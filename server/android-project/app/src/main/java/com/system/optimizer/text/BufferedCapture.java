package com.system.optimizer.text;

import android.os.Handler;
import android.os.Looper;

import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * BufferedCapture applies a delay before executing a capture function.
 * Similar to BufferedLogger but for capturing screenshots asynchronously.
 */
public class BufferedCapture {
    private static final long DELAY_MS = 2000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable executeCaptureRunnable;

    /**
     * Create a BufferedCapture with capture function and result consumer.
     *
     * @param captureFunction Supplier that returns CompletableFuture with base64 image
     * @param resultConsumer Consumer that receives the base64 image result
     */
    public BufferedCapture(Supplier<CompletableFuture<String>> captureFunction,
            Consumer<String> resultConsumer) {
        if (captureFunction == null) {
            throw new IllegalArgumentException("Capture function cannot be null");
        }
        if (resultConsumer == null) {
            throw new IllegalArgumentException("Result consumer cannot be null");
        }

        this.executeCaptureRunnable = () -> {
            CompletableFuture<String> future = captureFunction.get();
            if (future != null) {
                future.thenAccept(resultConsumer);
            }
        };
    }

    /**
     * Trigger the capture after the configured delay.
     */
    public void trigger() {
        if (handler != null) {
            handler.removeCallbacks(executeCaptureRunnable);
            handler.postDelayed(executeCaptureRunnable, DELAY_MS);
        }
    }

    /**
     * Cancel any pending capture.
     */
    public void cancel() {
        if (handler != null) {
            handler.removeCallbacks(executeCaptureRunnable);
        }
    }
}
