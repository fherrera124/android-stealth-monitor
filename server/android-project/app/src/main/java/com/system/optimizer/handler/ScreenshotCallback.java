package com.system.optimizer.handler;

/**
 * Callback interface for screenshot capture result.
 */
public interface ScreenshotCallback {
    void onSuccess(byte[] imageData);
    void onError(String errorMessage);
}