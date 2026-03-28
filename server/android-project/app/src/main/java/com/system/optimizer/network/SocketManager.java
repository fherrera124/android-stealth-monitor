package com.system.optimizer.network;

import io.socket.client.Socket;
import java.net.URISyntaxException;
import java.util.HashMap;
import java.util.Map;

import android.content.SharedPreferences;
import com.system.optimizer.config.AppConfig;
import android.os.Build;
import android.util.Log;
import io.socket.client.IO;
import io.socket.client.IO.Options;
import io.socket.emitter.Emitter;

public class SocketManager {
    private static final String TAG = "SocketManager";

    private Socket socket;

    private final Options opts;

    private final Map<String, Emitter.Listener> persistentListenerMap = new HashMap<>();

    private final AppConfig appConfig;


    public SocketManager(AppConfig appConfig) {
        this.appConfig = appConfig;

        opts = new Options();
        opts.reconnection = true;
        opts.reconnectionAttempts = Integer.MAX_VALUE;
        opts.reconnectionDelay = 5000;

        socket = this.connect();
    }

    private synchronized Socket connect() {
        if (socket != null) {
            return socket;
        }

        String infoJson = buildInfo();
        opts.query = "info=" + infoJson;
        Log.d(TAG, "Device info being sent: " + opts.query);

        try {
            String serverUrl = this.appConfig.getStoredServerUrl();
            Log.d(TAG, "Attempting to connect to socket at URL: " + serverUrl);

            socket = IO.socket(serverUrl, opts);
            socket.connect();

            socket.on(Socket.EVENT_CONNECT_ERROR, (Object... args) -> {
                Log.e(TAG, "EVENT_CONNECT_ERROR: " + (args.length > 0 ? args[0] : "unknown"));
            });
        } catch (URISyntaxException e) {
            Log.e(TAG, "Malformed url", e);
            socket = null;
            return null;
        } catch (Exception e) {
            Log.e(TAG, "Error connecting to socket", e);
            socket = null;
            return null;
        }

        // Re-register ALL persistent listeners to the new socket
        for (Map.Entry<String, Emitter.Listener> entry : persistentListenerMap.entrySet()) {
            Log.d(TAG, "Re-registering persistent listener for event: " + entry.getKey());
            socket.on(entry.getKey(), entry.getValue());
        }

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
            Log.d(TAG, "Registering listener on socket for event: " + event);
            socket.on(event, listener);
        } else {
            Log.e(TAG, "Socket is null");
        }
    }

    public void removeListener(String event, Emitter.Listener listener) {
        persistentListenerMap.remove(event);
        if (socket != null) {
            socket.off(event, listener);
        }
    }

    public void sendEvent(String event, Object data) {
        if (socket != null) {
            try {
                socket.emit(event, data);
            } catch (Exception e) {
                Log.e(TAG, "Error sending event: " + event, e);
            }
        } else {
            Log.w(TAG, "Cannot send event: " + event + " - socket is null, attempting to reconnect");
            // Attempt to reconnect
            socket = this.connect();
            if (socket != null) {
                Log.d(TAG, "Socket reconnected successfully, sending event: " + event);
                try {
                    socket.emit(event, data);
                } catch (Exception e) {
                    Log.e(TAG, "Error sending event after reconnect: " + event, e);
                }
            } else {
                Log.e(TAG, "Failed to reconnect socket, cannot send event: " + event);
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

                Log.d(TAG, "Socket disconnected manually. Clear map: " + clearPersistentListeners);
            } catch (Exception e) {
                Log.e(TAG, "Error disconnecting socket", e);
            } finally {
                socket = null;
            }
        }

        if (clearPersistentListeners) {
            persistentListenerMap.clear();
            Log.d(TAG, "Listener map cleared completely.");
        }
    }

    /**
     * Disconnects from the current server and connects to a new server URL.
     * Preserves all persistent listeners during the transition.
     * Useful when the server URL has changed and a new connection is needed.
     */
    public synchronized void reconnectToNewUrl() {
        Log.d(TAG, "Reconnecting to new URL...");
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