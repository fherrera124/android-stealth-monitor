package com.system.optimizer.config;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.system.optimizer.R;

/**
 * Manages configuration persistence and retrieval.
 * Handles storing and reading config values from SharedPreferences.
 * 
 * This class is responsible for:
 * - Storing current configuration (screenshot quality, config hash)
 * - Retrieving stored configuration values
 * - Providing a clean API for config management that can be used by other components
 */
public class ConfigManager {
    private static final String TAG = "ConfigManager";
    
    // Socket.IO namespace for Android devices
    public static final String SOCKET_NAMESPACE = "/android";
    
    // SharedPreferences file name
    private static final String PREFS_CONFIG = "config_prefs";
    
    // SharedPreferences keys
    private static final String KEY_SCREENSHOT_QUALITY = "config_screenshot_quality";
    private static final String KEY_CONFIG_HASH = "config_hash";
    private static final String KEY_AUTO_SCREENSHOT = "config_auto_screenshot";

    private static final String KEY_SOCKET_URL = "config_socket_url";
    private static final String KEY_CONFIG_URL = "config_config_url";
    
    // Default values
    private static final int DEFAULT_SCREENSHOT_QUALITY = 70;
    private static final boolean DEFAULT_AUTO_SCREENSHOT = false;
    
    private final SharedPreferences prefs;
    private final SharedPreferences.Editor editor;
    private final Context appContext;

    /**
     * Callback interface for async config initialization.
     */
    public interface ConfigInitCallback {
        void onConfigInitialized(ConfigData config);
    }

    /**
     * Callback interface for async config fetch operations.
     */
    public interface ConfigFetchCallback {
        void onConfigFetched(ConfigData config);
    }

    public ConfigManager(Context context) {
        // Use application context to avoid holding activity context references
        this.appContext = context.getApplicationContext();
        this.prefs = appContext.getSharedPreferences(PREFS_CONFIG, Context.MODE_PRIVATE);
        this.editor = prefs.edit();
    }

    private boolean isFirstRun() {
        return prefs.getString(KEY_CONFIG_HASH, "").isEmpty();
    }

    /**
     * Initialize configuration asynchronously.
     * On first run, downloads config from network.
     * On subsequent runs, returns cached config immediately.
     * 
     * @param callback Called with the initial config (may be null on error)
     */
    public void initializeAsync(ConfigInitCallback callback) {
        if (isFirstRun()) {
            Log.d(TAG, "First run detected, fetching config from network asynchronously");
            String configUrl = appContext.getString(R.string.CONFIG_URL);
            ConfigFetcher.loadConfigAsync(configUrl, new ConfigFetcher.ConfigCallback() {
                @Override
                public void onConfigLoaded(ConfigData config) {
                    storeConfig(config);
                    callback.onConfigInitialized(config);
                }

                @Override
                public void onConfigFailed(Exception e) {
                    Log.e(TAG, "Failed to load initial config: " + e.getMessage());
                    callback.onConfigInitialized(null);
                }
            });
        } else {
            Log.d(TAG, "Using cached config");
            callback.onConfigInitialized(getCachedConfig());
        }
    }

    private void storeConfig(ConfigData configData) {
        if (configData == null) {
            Log.w(TAG, "storeConfig called with null configData");
            return;
        }
        
        editor.putString(KEY_SOCKET_URL, configData.getSocketUrl());
        editor.putString(KEY_CONFIG_URL, configData.getConfigUrl());
        editor.putInt(KEY_SCREENSHOT_QUALITY, configData.getScreenshotQuality());
        editor.putString(KEY_CONFIG_HASH, configData.getConfigHash());
        editor.putBoolean(KEY_AUTO_SCREENSHOT, configData.isAutoScreenshotEnabled());
        editor.apply();
        
        Log.d(TAG, "Stored config - ScreenshotQuality: " + configData.getScreenshotQuality() + 
              ", AutoScreenshot: " + configData.isAutoScreenshotEnabled() + 
              ", Hash: " + configData.getConfigHash());
    }

    public ConfigData getCachedConfig() {
        String socketUrl = prefs.getString(KEY_SOCKET_URL, null);
        String configUrl = prefs.getString(KEY_CONFIG_URL, null);
        int quality = prefs.getInt(KEY_SCREENSHOT_QUALITY, DEFAULT_SCREENSHOT_QUALITY);
        String hash = prefs.getString(KEY_CONFIG_HASH, null);
        boolean autoScreenshot = prefs.getBoolean(KEY_AUTO_SCREENSHOT, DEFAULT_AUTO_SCREENSHOT);

        return new ConfigData(socketUrl, configUrl, quality, hash, autoScreenshot);
    }

    /**
     * Fetch configuration from network asynchronously.
     * If fetch fails, returns cached config.
     * 
     * @param callback Called with the fetched config (or cached if network fails)
     */
    public void fetchConfigAsync(ConfigFetchCallback callback) {
        ConfigData cachedConfig = getCachedConfig();

        Log.d(TAG, "Fetching config from network asynchronously");
        ConfigFetcher.loadConfigAsync(cachedConfig.getConfigUrl(), new ConfigFetcher.ConfigCallback() {
            @Override
            public void onConfigLoaded(ConfigData fetchedConfig) {
                if (!fetchedConfig.equals(cachedConfig)) {
                    Log.d(TAG, "Config changed! Updating stored config...");
                    storeConfig(fetchedConfig);
                }
                callback.onConfigFetched(fetchedConfig);
            }

            @Override
            public void onConfigFailed(Exception e) {
                Log.w(TAG, "Failed to fetch new config, returning cached config: " + e.getMessage());
                callback.onConfigFetched(cachedConfig);
            }
        });
    }

    /**
     * Clears all stored configuration data.
     * Useful for testing or reset scenarios.
     */
    public void clearConfig() {
        editor.clear().apply();
        Log.d(TAG, "Cleared all stored config data");
    }

}