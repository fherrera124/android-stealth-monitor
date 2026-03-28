package com.system.optimizer.service;

/**
 * Callback interface for screenshot capture result.
 */
public interface ScreenshotCallback {
    void onSuccess(byte[] image);

    void onError(String errorMessage);
}
