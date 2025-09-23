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
            if (!pendingText.isEmpty()) {
                this.consumer.accept(pendingText);
            }
        };
    }

    public void onNewText(String text) {
        pendingText = text;
        handler.removeCallbacks(flushRunnable);
        handler.postDelayed(flushRunnable, DELAY_MS);
    }
}
