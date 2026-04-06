package com.system.optimizer.network;

import io.socket.client.Socket;
import java.net.URISyntaxException;
import java.util.HashMap;
import java.util.Map;

import android.content.SharedPreferences;
import com.system.optimizer.config.AppConfig;
import android.os.Build;
import timber.log.Timber;
import io.socket.client.IO;
import io.socket.client.IO.Options;
import io.socket.emitter.Emitter;

public class SocketManager {

    private Socket socket;

    private final Map<String, Emitter.Listener> persistentListenerMap = new HashMap<>();

    private final AppConfig appConfig;

    public SocketManager(AppConfig appConfig) {
        this.appConfig = appConfig;
        socket = this.connect();
    }

    private synchronized Socket connect() {
        if (socket != null) {
            return socket;
        }

        final Options opts = new Options();
        opts.reconnection = true;
        opts.reconnectionAttempts = Integer.MAX_VALUE;
        opts.reconnectionDelay = 5000;

        String infoJson = buildInfo();
        String configHash = this.appConfig.generateConfigHash();

        opts.query = "info=" + infoJson;
        if (configHash != null) {
            opts.query += "&config_hash=" + configHash;
        }
        Timber.d("Device info being sent: %s", opts.query);

        try {
            String serverUrl = this.appConfig.getStoredServerUrl();
            Timber.d("Attempting to connect to socket at URL: %s", serverUrl);

            socket = IO.socket(serverUrl, opts);

            socket.on(Socket.EVENT_CONNECT_ERROR, (Object... args) -> {
                Timber.e("EVENT_CONNECT_ERROR: %s", args.length > 0 ? args[0] : "unknown");
            });
        } catch (URISyntaxException e) {
            Timber.e(e, "Malformed url");
            socket = null;
            return null;
        } catch (Exception e) {
            Timber.e(e, "Error connecting to socket");
            socket = null;
            return null;
        }

        // Register ALL persistent listeners to the new socket
        for (Map.Entry<String, Emitter.Listener> entry : persistentListenerMap.entrySet()) {
            Timber.d("Registering persistent listener for event: %s", entry.getKey());
            socket.on(entry.getKey(), entry.getValue());
        }

        socket.connect();

        return socket;
    }

    /**
     * Add a persistent listener. Intended for registering listeners
     * on new socket connections, as it will store the listener in a map and
     * re-register it on any new socket instance created by connect(). This ensures
     * that listeners remain active even if the socket disconnects and reconnects
     * due to network issues or server changes.
     * 
     * @param event    The event name to listen for
     * @param listener The listener to invoke when the event is received
     */
    public void addPersistentListener(String event, final Emitter.Listener listener) {
        persistentListenerMap.put(event, listener);
        if (socket != null) {
            Timber.d("Registering listener on socket for event: %s", event);
            socket.on(event, listener);
        } else {
            Timber.e("Socket is null");
        }
    }

    public void removeListener(String event, Emitter.Listener listener) {
        persistentListenerMap.remove(event);
        if (socket != null) {
            socket.off(event, listener);
        }
    }

    public void sendEvent(String event, Object... data) {
        if (socket != null) {
            try {
                socket.emit(event, data);
            } catch (Exception e) {
                Timber.e(e, "Error sending event: %s", event);
            }
        } else {
            Timber.w("Cannot send event: %s - socket is null, attempting to reconnect", event);
            // Attempt to reconnect
            socket = this.connect();
            if (socket != null) {
                Timber.d("Socket reconnected successfully, sending event: %s", event);
                try {
                    socket.emit(event, data);
                } catch (Exception e) {
                    Timber.e(e, "Error sending event after reconnect: %s", event);
                }
            } else {
                Timber.e("Failed to reconnect socket, cannot send event: %s", event);
            }
        }
    }

    /**
     * Disconnects the socket.
     * * @param clearPersistentListeners If true, the persistentListenerMap will be
     * cleared.
     * Use 'false' if you plan to reconnect to another URL
     * and want to keep your app's event subscriptions.
     */
    public synchronized void disconnect(boolean clearPersistentListeners) {
        if (socket != null) {
            try {
                socket.off();
                socket.disconnect();

                Timber.d("Socket disconnected manually. Clear map: %s", clearPersistentListeners);
            } catch (Exception e) {
                Timber.e(e, "Error disconnecting socket");
            } finally {
                socket = null;
            }
        }

        if (clearPersistentListeners) {
            persistentListenerMap.clear();
            Timber.d("Listener map cleared completely.");
        }
    }

    /**
     * Forces a new clean connection preserving all persistent listeners during the transition.
     * Useful when the server URL has changed and a new connection is needed.
     * Also to force a new fresh handshake
     */
    public synchronized void forceNewConn() {
        Timber.d("Reconnecting to new URL...");
        disconnect(false); // Don't clear persistent listeners
        connect();
    }

    private String buildInfo() {
        StringBuilder info = new StringBuilder();
        info.append("{");
        info.append("\"Brand\":\"").append(Build.BRAND != null ? Build.BRAND : "Unknown")
                .append("\",");
        info.append("\"Model\":\"").append(Build.MODEL != null ? Build.MODEL : "Unknown").append("\",");
        info.append("\"Manufacturer\":\"").append(Build.MANUFACTURER != null ? Build.MANUFACTURER : "Unknown")
                .append("\",");
        String uuid = this.appConfig.getUUID();
        info.append("\"device_uuid\":\"").append(uuid).append("\"");
        info.append("}");
        return info.toString();
    }

}