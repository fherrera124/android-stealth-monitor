# Android Stealth Monitor

This project is a proof-of-concept Android application that demonstrates advanced system service capabilities, including background connectivity, accessibility features, and device monitoring. It includes a web-based control panel for managing connected devices. **This is for educational purposes only. Use responsibly and ensure compliance with all laws and ethical guidelines. Misuse can lead to legal consequences.**

## Features
- **Web Control Panel**: A responsive UI to monitor and control multiple Android devices via Socket.IO.
- **Android System Service**: Runs as a foreground service with boot receiver and keylogger (accessibility-based).
- **Dockerized Deployment**: Easy setup with containerized backend (portal for control, builder for APK generation).
- **In-Memory Device Management**: Real-time device tracking via Socket.IO events (no external DB).
- **Dynamic APK Building**: Generate customized APKs with user-specified IP/port via the builder service.

## Prerequisites
- Docker and Docker Compose installed.

## Setup

### 1. Docker Setup
This project uses Docker for the portal (web server + Socket.IO) and builder (Android APK generation). Dockerfiles are provided: `portal/Dockerfile` and `builder/Dockerfile`. A `docker-compose.yml` file is included in the root directory for easy deployment.

1. Clone the repository

2. Build and run with Docker Compose:
   ```
   docker compose up --build
   ```

- Portal runs the web UI on http://localhost:4001.
- Builder listens on http://localhost:8080 for build requests (internal from portal).

### 2. Access the Control Panel
1. Open http://localhost:4001 in your browser.
2. The dashboard will list connected devices.

### 3. Generate and Deploy APK
1. In the UI, enter the target IP and port (e.g., your portal IP:4000 for bots).
2. Click "Download APK" – this triggers the builder service (via http://localhost:8080/build) to compile a customized APK with embedded config.
3. Download the generated APK from the UI link (output in `./builder/project/app/build/outputs/apk/`).
4. Install on target device (enable "Install unknown apps" or use ADB: `adb install app-debug.apk`).
5. Grant Accessibility permissions to the "System Service" app for keylogging.
6. The app will connect back to your portal on boot/service start.

### 4. Testing and Monitoring
- Android devices connect to port 4000; monitor Docker logs: `docker logs portal` or `docker compose logs`.
- Use the UI to send "logger" commands (start/stop keylogging).
- Device info (IP, model, etc.) updates in real-time via Socket.IO events.

## Development
- **Portal (Node.js)**: Edit in `./portal/`. Rebuild Docker image after changes: `docker compose build portal`.
- **Android App**: Source in `./builder/project/app/`. For manual build: `cd builder/project && ./gradlew assembleDebug`.

## Security Notes
- The app requests sensitive permissions (Accessibility, Boot Complete, Internet) – disclose to users.
- For ethical testing only; do not deploy without explicit consent.

## License
MIT

For issues, open a GitHub issue.
