package com.system.optimizer.text;

import android.os.Handler;
import android.os.Looper;

import java.util.function.Consumer;

public class BufferedLogger {
    private static final long DELAY_MS = 2000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Consumer<String> consumer;
    private String pendingText = "";
    private final Runnable flushRunnable;

    public BufferedLogger(Consumer<String> consumer) {
        this.consumer = consumer;
        this.flushRunnable = () -> {
            synchronized (this) {
                if (!pendingText.isEmpty()) {
                    String textToFlush = pendingText;
                    pendingText = "";
                    this.consumer.accept(textToFlush);
                }
            }
        };
    }

    public void onNewText(String text) {
        synchronized (this) {
            pendingText = text;
        }

        if (handler != null) {
            handler.removeCallbacks(flushRunnable);
            handler.postDelayed(flushRunnable, DELAY_MS);
        }
    }
}
