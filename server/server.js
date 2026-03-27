import { Server } from "socket.io";
import chalk from "chalk";
import fs from "fs/promises";
import { exec } from 'child_process';

import { db } from './db.js';

const serverPort = 4000;

// Initialize with default values if not exists
async function initializeDefaultValues() {
    try {
        const defaultConfig = await db.getDefaultConfig();
        if (!defaultConfig) {
            const defaultServerUrl = `https://android-portal.tunegociosmart.com.ar/android`;
            await db.run(
                'INSERT OR IGNORE INTO default_config (id, server_url, screenshot_quality, auto_screenshot) VALUES (1, ?, ?, ?)',
                defaultServerUrl, 70, 1
            );
            console.log(chalk.green('[+] Default config initialized in database with default values'));
        }
    } catch (error) {
        console.error('Error initializing default config in database:', error);
    }
}

// Generate device config from default config
async function generateDeviceConfig(deviceUuid) {
    try {
        // Check if config already exists for this device
        let deviceConfig = await db.getDeviceConfig(deviceUuid);
        
        if (deviceConfig) {
            // If exists, return existing config
            return {
                server_url: deviceConfig.server_url,
                screenshot_quality: deviceConfig.screenshot_quality,
                auto_screenshot: deviceConfig.auto_screenshot === 1
            };
        }
        
        // If not exists, generate from default config
        const defaultConfig = await db.getDefaultConfig();
        if (!defaultConfig) {
            throw new Error('Default config not found');
        }
        
        // Save new config to DB
        await db.upsertDeviceConfig(
            deviceUuid,
            defaultConfig.server_url,
            defaultConfig.screenshot_quality,
            defaultConfig.auto_screenshot,
            0 // is_custom = 0 (from default config)
        );
        
        console.log(chalk.blue(`[i] Generated config for device ${deviceUuid} from default config`));
        
        return {
            server_url: defaultConfig.server_url,
            screenshot_quality: defaultConfig.screenshot_quality,
            auto_screenshot: defaultConfig.auto_screenshot === 1
        };
    } catch (error) {
        console.error('Error generating device config:', error);
        // Fallback to default config
        return {
            server_url: 'https://android-portal.tunegociosmart.com.ar/android',
            screenshot_quality: 70,
            auto_screenshot: true
        };
    }
}

// Call initializeDefaultValues after DB is ready
initializeDefaultValues();
const devices = new Map(); // Map<device_uuid, {info: data, socket: socket}>
const pendingScreenshots = new Map(); // Map<device_uuid, {frontend_socket_id, timestamp}>
const pendingScreenshotResponses = new Map(); // Map<device_uuid, timeout>
const SCREENSHOT_TIMEOUT = 30000;

// Function to clean up expired screenshot requests
function cleanupExpiredScreenshotRequests() {
    const now = Date.now();
    const expiredDevices = [];

    for (const [deviceUuid, request] of pendingScreenshots.entries()) {
        if (request && now - request.timestamp > SCREENSHOT_TIMEOUT) {
            expiredDevices.push(deviceUuid);

            // Notify the frontend that the request timed out
            const requestingSocket = frontendIo.sockets?.get(request.frontend_socket_id);
            if (requestingSocket) {
                console.log(chalk.yellow(`Screenshot request timed out for device ${deviceUuid}, notifying frontend ${request.frontend_socket_id}`));
                requestingSocket.emit("screenshot_error", {
                    device_uuid: deviceUuid,
                    error: "Screenshot request timed out"
                });
            }
        }
    }

    expiredDevices.forEach(deviceUuid => pendingScreenshots.delete(deviceUuid));

    if (expiredDevices.length > 0) {
        console.log(chalk.blue(`Cleaned up ${expiredDevices.length} expired screenshot requests`));
    }
}

// Clean up expired requests every 10 seconds
setInterval(cleanupExpiredScreenshotRequests, 10000);

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
const io = new Server(serverPort, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Socket.io namespace for frontend connections
const frontendIo = io.of('/frontend');

console.log(`Listening for android devices on http://0.0.0.0:${serverPort}/`)

// Socket io Connection for Android devices
const androidIo = io.of('/android');

androidIo.on("connection", async (socket) => {
    console.log(chalk.cyan(`[i] New connection attempt from ${socket.handshake.address}`));
    
    try {
        const dataStr = socket.handshake.query.info;
        
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
            socket.disconnect();
            return;
        }

        socket.deviceUuid = deviceUuid;

        let device = devices.get(deviceUuid);
        if (device) {
            device.info = data;
            device.socket = socket;
            // Clean up any stale screenshot requests for this device
            if (pendingScreenshots.has(deviceUuid)) {
                console.log(chalk.yellow(`Cleaning up stale screenshot request for reconnected device ${deviceUuid}`));
                pendingScreenshots.delete(deviceUuid);
            }
            if (pendingScreenshotResponses.has(deviceUuid)) {
                clearTimeout(pendingScreenshotResponses.get(deviceUuid));
                pendingScreenshotResponses.delete(deviceUuid);
            }
            if (!device.logs) {
                device.logs = [];
            }
        } else {
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

        console.log(chalk.green(`[+] Android device Connected (${deviceUuid}) => ${socket.request.connection.remoteAddress}:${socket.request.connection.remotePort}`))

        // Generate config for this device from default config
        const deviceConfig = await generateDeviceConfig(deviceUuid);
        socket.emit("config_data", deviceConfig);
        console.log(chalk.blue(`[i] Sent config to device ${deviceUuid}:`, JSON.stringify(deviceConfig)));

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

            // Clear any pending screenshot response timeouts
            if (pendingScreenshotResponses.has(deviceUuid)) {
                clearTimeout(pendingScreenshotResponses.get(deviceUuid));
                pendingScreenshotResponses.delete(deviceUuid);
            }

            try {
                const device = devices.get(deviceUuid);
                if (device) {
                    device.socket = null;
                    // Clean up logs to prevent memory leaks
                    if (device.logs && device.logs.length > 100) {
                        device.logs = device.logs.slice(-100);
                    }
                }

                // Clean up any pending screenshot requests for this device
                if (pendingScreenshots.has(deviceUuid)) {
                    const request = pendingScreenshots.get(deviceUuid);
                    const requestingSocket = frontendIo.sockets.sockets.get(request.frontend_socket_id);
                    if (requestingSocket) {
                        requestingSocket.emit("screenshot_error", {
                            device_uuid: deviceUuid,
                            error: "Device disconnected while taking screenshot"
                        });
                    }
                    pendingScreenshots.delete(deviceUuid);
                }

                // Update last_seen in DB
                await db.run('UPDATE devices SET last_seen = ? WHERE device_uuid = ?', Date.now(), deviceUuid);

                // Broadcast updated device list
                const deviceList = Array.from(devices.values()).map((d) => ({
                    ...d.info,
                    ID: d.info.device_uuid
                })).slice(0, 20);
                frontendIo.emit("devices", deviceList);
            } catch (error) {
                console.error('Error handling device disconnect:', error);
            }
        });

        // Handle logger events from Android device
        socket.on("logger", async (data) => {
            const deviceUuid = socket.deviceUuid;
            if (!deviceUuid) return;

            // Check if this is a screenshot failure response
            if (data && typeof data === 'string' && data.includes("Screenshot failed")) {
                if (pendingScreenshotResponses.has(deviceUuid)) {
                    clearTimeout(pendingScreenshotResponses.get(deviceUuid));
                    pendingScreenshotResponses.delete(deviceUuid);
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
        socket.on("screenshot_response", async (data) => {
            const deviceUuid = socket.deviceUuid;
            if (!deviceUuid) return;

            console.log(chalk.green(`[+] Screenshot response received from device ${deviceUuid}`));

            // Clear the response timeout
            if (pendingScreenshotResponses.has(deviceUuid)) {
                clearTimeout(pendingScreenshotResponses.get(deviceUuid));
                pendingScreenshotResponses.delete(deviceUuid);
            }

            try {
                let buffer;
                
                // Only accept binary data (Buffer, TypedArray, or ArrayBuffer)
                if (Buffer.isBuffer(data)) {
                    buffer = data;
                } 
                else if (ArrayBuffer.isView(data)) {
                    buffer = Buffer.from(data);
                }
                else if (data instanceof ArrayBuffer) {
                    buffer = Buffer.from(new Uint8Array(data));
                }
                else if (data && typeof data === 'object' && Array.isArray(data)) {
                    // Java arrays serialized as regular arrays
                    buffer = Buffer.from(data);
                }
                else {
                    throw new Error('Invalid screenshot data: expected binary, got ' + typeof data);
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

                // Handle screenshot response
                const request = pendingScreenshots.get(deviceUuid);
                if (request) {
                    // There was a pending request - notify specific frontend
                    const requestingSocket = frontendIo.sockets?.get(request.frontend_socket_id);
                    if (requestingSocket) {
                        console.log(chalk.green(`[✓] Screenshot sent to frontend ${request.frontend_socket_id} for device ${deviceUuid}`));
                        requestingSocket.emit("screenshot_ready", {
                            device_uuid: deviceUuid,
                            filename: filename,
                            timestamp: Date.now()
                        });
                    } else {
                        // Socket not found - broadcast as fallback
                        console.log(chalk.yellow(`[!] Frontend ${request.frontend_socket_id} not found, broadcasting to all`));
                        frontendIo.emit("screenshot_ready", {
                            device_uuid: deviceUuid,
                            filename: filename,
                            timestamp: Date.now()
                        });
                    }
                    pendingScreenshots.delete(deviceUuid);
                } else {
                    // No pending request - this is a spontaneous screenshot from the device
                    // Broadcast to all frontends
                    console.log(chalk.blue(`[i] Spontaneous screenshot from device ${deviceUuid}, broadcasting to all frontends`));
                    frontendIo.emit("screenshot_ready", {
                        device_uuid: deviceUuid,
                        filename: filename,
                        automatic: true,
                        timestamp: Date.now()
                    });
                }

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
                // Check if there's already a pending request for this device
                const existingRequest = pendingScreenshots.get(deviceId);

                if (existingRequest) {
                    const now = Date.now();
                    if (now - existingRequest.timestamp > SCREENSHOT_TIMEOUT) {
                        console.log(chalk.yellow(`Screenshot request timed out for device ${deviceId}, allowing new request from ${socket.id}`));
                        pendingScreenshots.delete(deviceId);
                    } else {
                        // Another frontend already requested - reject this one
                        console.log(chalk.yellow(`Screenshot already pending for device ${deviceId} from frontend ${existingRequest.frontend_socket_id}, rejecting request from ${socket.id}`));
                        socket.emit("screenshot_error", {
                            device_uuid: deviceId,
                            error: "Screenshot already in progress for this device"
                        });
                        return;
                    }
                }

                // Store the request
                pendingScreenshots.set(deviceId, {
                    frontend_socket_id: socket.id,
                    timestamp: Date.now()
                });
                device.socket.emit("screenshot");
                console.log(chalk.green(`Screenshot request sent to device ${deviceId} for frontend ${socket.id}`));

                // Set timeout for response
                pendingScreenshotResponses.set(deviceId, setTimeout(async () => {
                    console.log(chalk.red(`Screenshot response timeout for device ${deviceId}, clearing pending state and notifying frontend`));

                    const request = pendingScreenshots.get(deviceId);
                    if (request) {
                        const requestingSocket = frontendIo.sockets?.get(request.frontend_socket_id);
                        if (requestingSocket) {
                            requestingSocket.emit("screenshot_error", { device_uuid: deviceId, error: "Screenshot response timed out" });
                        }
                    }

                    pendingScreenshots.delete(deviceId);
                    pendingScreenshotResponses.delete(deviceId);
                }, 10000));
            } else {
                console.log(chalk.red(`Device ${deviceId} not found, socket disconnected, or not connected`));
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
            socket.emit("default_config_data", defaultConfig || {
                server_url: 'https://android-portal.tunegociosmart.com.ar/android',
                screenshot_quality: 70,
                auto_screenshot: 1
            });
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
            
            await db.updateDefaultConfig(server_url, screenshot_quality, auto_screenshot);
            
            console.log(chalk.green(`[+] Default config updated by frontend ${socket.id}`));
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
                socket.emit("device_config_data", {
                    device_uuid: deviceUuid,
                    ...generatedConfig,
                    is_custom: 0
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
                auto_screenshot,
                1 // is_custom = 1 (manually modified)
            );
            
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

        // Clean up any pending screenshot requests for this frontend
        for (const [deviceId, request] of pendingScreenshots.entries()) {
            if (request && request.frontend_socket_id === socket.id) {
                pendingScreenshots.delete(deviceId);
                console.log(chalk.yellow(`Cleared pending screenshot request for device ${deviceId} due frontend disconnect ${socket.id}`));
            }
        }
    });
});
