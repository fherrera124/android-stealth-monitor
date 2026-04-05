# Android Monitor

This project is a proof-of-concept Android application that demonstrates advanced system service capabilities, including background connectivity, accessibility features, and device monitoring. It includes a web-based control panel for managing connected devices. **This is for educational purposes only. Use responsibly and ensure compliance with all laws and ethical guidelines. Misuse can lead to legal consequences.**

## Features
- **Web Control Panel**: A responsive UI to monitor and control multiple Android devices via Socket.IO.
- **Android System Service**: Runs as a foreground service with boot receiver and keylogger (accessibility-based).
- **Dockerized Deployment**: Easy setup with containerized backend (nginx for frontend, server for Socket.IO + APK generation).
- **In-Memory Device Management**: Real-time device tracking via Socket.IO events (no external DB).
- **Dynamic APK Building**: Generate customized APKs with user-specified config URL for server connectivity.
- **Remote Config Management**: Apps fetch configuration from a remote JSON file, enabling dynamic server updates without reinstalling APK.

## Configuration Architecture

The application now uses a **remote configuration model**:

1. **Config File** (JSON): Hosted on any accessible URL (GitHub, web server, etc.)
   ```json
   {
     "server_url": "example.com:4000",
     "screenshot_quality": 70,
     "auto_screenshot": true
   }
   ```
   - `server_url`: Domain or IP with optional port and protocol (http/https).
     - Defaults: `http://` protocol, port `80` for http, port `443` for https.
     - Examples: `"example.com"`, `"example.com:8080"`, `"https://example.com"`, `"https://ws.boo.bar:4000"`
   - `screenshot_quality`: Optional integer (1-100) for JPEG compression quality. Default: 70. Higher = better quality, larger file.

2. **APK Generation**: Build accepts a config URL instead of hardcoded IP/port
3. **Config Validation**: 
   - Apps validate config on startup
   - Periodic validation every 60 seconds
   - Automatic reconnection if config changes

## Socket.IO Architecture

The server uses **namespaces** to separate traffic between Android devices and the web frontend:

| Namespace | Path | Purpose |
|-----------|------|---------|
| `/android` | `http://server:4000/android` | Android device connections |
| `/frontend` | `http://server:4000/frontend` | Web frontend connections |

- Android apps automatically connect to the `/android` namespace (configured as a constant in `ConfigManager.SOCKET_NAMESPACE`)
- The web frontend connects to the `/frontend` namespace
- This separation ensures clean isolation between device traffic and control panel traffic

## Prerequisites
- Docker and Docker Compose installed.

## Setup


### 1. Docker Setup
This project uses Docker for the frontend (nginx + static files) and server (Socket.IO + Android APK generation). A `docker-compose.yml` file is included in the root directory for easy deployment.

1. Clone the repository

2. Build and run with Docker Compose:
   ```
   docker compose up --build
   ```

- Nginx serves the frontend and proxies the socket.io server on http://localhost:4000

### 3. Access the Control Panel
1. Open http://localhost:4000 in your browser.
2. The dashboard will list connected devices.

### 4. Generate and Deploy APK
1. Click "Build APK" – this triggers the server to compile a customized APK with the embedded config URL.
2. Download the generated APK from the UI link.
3. Install on target device (enable "Install unknown apps" or use ADB: `adb install app-release.apk`).
4. Grant Accessibility permissions to the "System Service" app for keylogging.

## Configuration Update Workflow

1. **Update Config File**: Modify your remote `settings.json` with new host:port
2. **Option A - Manual Push**: Call `/api/validate-config` endpoint to trigger immediate revalidation across all connected apps
3. **Option B - Wait for Restart**: Apps validate config on startup/reconnect
4. Apps automatically disconnect from old server and connect to new one

## Development
- **Server (Node.js)**: Edit in `./server/`. The server also handles Android APK builds in `./server/android-project/`. Rebuild Docker image after changes: `docker compose build android-server`.
- **Frontend**: Static files in `./nginx/public/`. No rebuild needed (mounted via volume).
- **Android App**: Source in `./server/android-project/app/`. For manual build: `cd server/android-project && ./gradlew assembleDebug -PserverUrl='https://example.com/settings.json'`.

## Security Notes
- The app requests sensitive permissions (Accessibility, Boot Complete, Internet) – disclose to users.
- Config file should be accessible but ideally protected (HTTPS recommended).
- For ethical testing only; do not deploy without explicit consent.

## License
MIT

For issues, open a GitHub issue.
