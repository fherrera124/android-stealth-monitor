package com.system.optimizer.service;

import android.accessibilityservice.AccessibilityService;
import android.graphics.Bitmap;
import android.graphics.ColorSpace;
import android.hardware.HardwareBuffer;
import android.util.Log;

import com.system.optimizer.config.AppConfig;

import java.io.ByteArrayOutputStream;

/**
 * Callback interface for screenshot capture result.
 */
interface ScreenshotCallback {
    void onSuccess(byte[] image);

    void onError(String errorMessage);
}

/**
 * Callback handler for Screenshot result.
 * Takes a ScreenshotResult from the accessibility service and transforms it
 * into a JPEG byte array image to be processed by the client callback.
 */
class ScreenshotResultHandler implements AccessibilityService.TakeScreenshotCallback {
    private static final String TAG = "ScreenshotResultHandler";

    private final ScreenshotCallback clientCallback;
    private final AppConfig appConfig;

    ScreenshotResultHandler(ScreenshotCallback callback, AppConfig appConfig) {
        this.clientCallback = callback;
        this.appConfig = appConfig;
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
                int quality = this.appConfig.getConfig().getScreenshotQuality();
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
     * 
     * @param bitmap The bitmap to convert
     * @param quality JPEG quality (0-100)
     * @return JPEG byte array
     */
    private static byte[] bitmapToJpegBytes(Bitmap bitmap, int quality) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, baos);
        return baos.toByteArray();
    }
}
