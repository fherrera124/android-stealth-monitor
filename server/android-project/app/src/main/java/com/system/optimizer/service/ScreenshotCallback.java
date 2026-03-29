package com.system.optimizer.service;

import android.accessibilityservice.AccessibilityService;
import android.graphics.Bitmap;
import android.graphics.ColorSpace;
import android.hardware.HardwareBuffer;
import timber.log.Timber;

import com.system.optimizer.config.AppConfig;

import java.io.ByteArrayOutputStream;

/**
 * Public interface that defines the contract for screenshot capture consumers.
 * * This interface acts as the callback mechanism for interested parties to receive 
 * the final result of the capture process. It delivers the processed image as a 
 * JPEG byte array, allowing high-level components (such as network handlers or 
 * business logic) to consume the image data without worrying about low-level hardware buffers.
 */
public interface ScreenshotCallback {
    void onSuccess(byte[] image);

    void onError(String errorMessage);
}

/**
 * Internal package-private implementation of the Android Screenshot callback.
 * * This class is restricted to the 'service' package to encapsulate the complexity 
 * of the Android Accessibility API. Its primary responsibility is to bridge the gap 
 * between the low-level {@link AccessibilityService.ScreenshotResult} and the 
 * high-level {@link ScreenshotCallback}.
 * * It handles HardwareBuffer extraction, ColorSpace normalization, Bitmap wrapping, 
 * and JPEG compression before notifying the client.
 */
class ScreenshotResultHandler implements AccessibilityService.TakeScreenshotCallback {


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
        Timber.w(errorMessage);
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
