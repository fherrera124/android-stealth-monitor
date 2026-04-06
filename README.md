# Android Monitor

Panel de control web para monitoreo y gestión de dispositivos Android. Construido con Node.js/Socket.IO y frontend Nginx.

**Uso educativo únicamente.** Respeta la privacidad y leyes locales.

## Arquitectura

```
┌─────────────┐     /android      ┌──────────────┐
│   Android   │◄─────────────────►│    Server    │
│   Device    │   (WebSocket)     │  (Socket.IO) │
└─────────────┘                   └──────┬───────┘
                                         │ /frontend
                                         ▼
                                    ┌──────────┐
                                    │  Nginx   │
                                    │ + Static │
                                    └──────────┘
```

### Namespaces Socket.IO

| Namespace | Descripción |
|-----------|-------------|
| `/android` | Conexiones de dispositivos Android |
| `/frontend` | Conexiones del panel web |

## Stack

- **Backend**: Node.js + Socket.IO + SQLite
- **Frontend**: HTML/CSS/JS vanilla + jQuery
- **Proxy**: Nginx
- **Android**: Java (Android Studio)

## Funcionalidades

- Monitoreo de dispositivos en tiempo real
- Captura de screenshots (manual y automática)
- Logs en tiempo real del dispositivo
- Generación dinámica de APK con configuración embebida
- Configuración por defecto y por dispositivo (server URL, calidad de screenshot, auto-screenshot)
- Persistencia en SQLite (dispositivos, configs, logs, screenshots)

## Setup

```bash
# Build y ejecución
docker compose up --build

# Acceso
http://localhost:4000
```

## Uso

1. **Generar APK**: Click en "Build APK" → descargar e instalar en dispositivo
2. **Seleccionar dispositivo**: Elegir del dropdown
3. **Logs**: Ver en tiempo real (solo si el dispositivo está seleccionado)
4. **Screenshot**: Click en botón o automático según config
5. **Configuración**: Pestaña config para ajustar server URL, calidad, auto-screenshot por dispositivo

## Desarrollo

| Componente | Path | Notas |
|------------|------|-------|
| Servidor | `./server/` | Editar y rebuild: `docker compose build` |
| Frontend | `./nginx/public/` | Cambios inmediatos (volumen mountado) |
| APK | `./server/android-project/` | Build manual: `./gradlew assembleDebug` |

## Estructura de archivos

```
.
├── docker-compose.yml
├── nginx/
│   ├── nginx.conf
│   └── public/          # Frontend estático
├── server/
│   ├── db.js            # SQLite
│   ├── server.js        # Socket.IO + API
│   └── android-project/ # Código fuente APK
└── screenshots/        # Generados por dispositivos
```

## Configuración

- **Server URL**: Endpoint donde el dispositivo se conecta
- **Screenshot Quality**: 1-100 (default 70)
- **Auto Screenshot**: Captura automática periódica

## Permisos Android

- Internet
- Boot completado
- Accessibility (para captura de logs/screenshot)

## License

MIT