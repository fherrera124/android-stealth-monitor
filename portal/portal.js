import express from "express";
import { Server } from "socket.io";
import bodyParser from 'body-parser';
import cors from 'cors'
import chalk from "chalk";
import path from 'path';
import { io as Client } from "socket.io-client";
import { promises as fs } from "fs";

const frontendPort = 4001;
const serverUrl = process.env.SERVER_URL || "http://server:4000";

// Cache de dispositivos del server
let cachedDevices = [];

// Conexión como cliente al server
const serverClient = new Client(`${serverUrl}/portal`, {
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
});

serverClient.on("connect", () => {
    console.log(chalk.green(`[+] Connected to server at ${serverUrl}/portal`));
});

serverClient.on("disconnect", () => {
    console.log(chalk.red(`[!] Disconnected from server`));
});

serverClient.on("connect_error", (error) => {
    console.error(chalk.red(`[!] Connection error to server: ${error.message}`));
});

// Recibe actualizaciones de dispositivos del server
serverClient.on("devices", (devices) => {
    console.log(chalk.blue(`[i] Received ${devices.length} devices from server`));
    cachedDevices = devices;
    // Broadcast a todos los frontends conectados
    frontendIo.emit("info", devices);
});

serverClient.on("screenshot_error", (data) => {
    frontendIo.emit("screenshot_error", data);
});

serverClient.on("config_validation_request", (data) => {
    frontendIo.emit("config_validation_request", data);
});

// Express
const app = express()
app.use(cors())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.static('static'))
app.use('/screenshots', express.static('screenshots', { maxAge: '1h' }))

// Serve main HTML file at root
app.get('/', (req, res) => {
    res.sendFile(path.resolve('./static/html/index.html'));
});

const frontendServer = app.listen(frontendPort, "0.0.0.0", () => {
    console.log(`Listening for frontends on http://0.0.0.0:${frontendPort}/`)
});

// Socket io Connection for Frontends
const frontendIo = new Server(frontendServer);
frontendIo.on("connection", async (socket) => {
    console.log(chalk.greenBright(`[+] Frontend Connected (${socket.id})`))

    // Enviar devices cacheados
    socket.emit("info", cachedDevices);

    socket.on("get_device_logs", async (id) => {
        if (!id) {
            socket.emit("device_logs", []);
            return;
        }
        // Reenviar al server
        serverClient.emit("get_device_logs", id);
        
        // El server responderá directamente al frontend via el namespace /portal
        // Nous necesitamos escuchar la respuesta del server
    });

    socket.on("screenshot_req", async (deviceId) => {
        deviceId = (typeof deviceId === 'string' ? deviceId.trim() : deviceId);
        if (!deviceId || deviceId === 'None') {
            console.log(chalk.red(`Screenshot request with invalid/None deviceId`));
            socket.emit("screenshot_error", { device_uuid: deviceId, error: "Invalid device ID" });
            return;
        }

        console.log(`Screenshot request for device: ${deviceId} from frontend: ${socket.id}`);
        
        // Reenviar al server
        serverClient.emit("screenshot_req", deviceId);
    });

    socket.on("get_device_info", async (deviceId) => {
        if (!deviceId) {
            socket.emit("device_info_error", { error: "Invalid device ID" });
            return;
        }

        // Reenviar al server
        serverClient.emit("get_device_info", deviceId);
    });

    socket.on("build_request", async (data) => {
        const { configUrl } = data;
        console.log(`Build request for config URL: ${configUrl}`);

        try {
            const response = await fetch('http://android-builder:8080/build', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ configUrl })
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

    socket.on("validate_config", () => {
        console.log(chalk.cyan(`[i] Config validation request received via WS from frontend ${socket.id}`));
        
        // Reenviar al server
        serverClient.emit("validate_config");
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
    });
});

// Escuchar respuestas del server y reenviar al frontend correcto
serverClient.on("device_logs", (data) => {
    frontendIo.emit("device_logs", data);
});

serverClient.on("device_info", (data) => {
    frontendIo.emit("device_info", data);
});

serverClient.on("device_info_error", (data) => {
    frontendIo.emit("device_info_error", data);
});

serverClient.on("validate_config_response", (data) => {
    frontendIo.emit("validate_config_response", data);
});

console.log(chalk.blue(`[i] Portal running on port ${frontendPort}`));
console.log(chalk.blue(`[i] Server URL: ${serverUrl}`));
