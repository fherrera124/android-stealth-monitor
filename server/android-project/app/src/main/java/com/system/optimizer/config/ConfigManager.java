package com.system.optimizer.config;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * Manages configuration persistence and retrieval.
 * Handles storing and reading config values from SharedPreferences.
 * 
 * This class is responsible for:
 * - Storing current configuration (screenshot quality, auto screenshot setting, server URL)
 * - Retrieving stored configuration values
 * - Providing a clean API for config management that can be used by other components
 */
public class ConfigManager {
    private static final String TAG = "ConfigManager";
    
    // Socket.IO namespace for Android devices
    public static final String SOCKET_NAMESPACE = "/android";
    
    // SharedPreferences keys
    private static final String KEY_SCREENSHOT_QUALITY = "config_screenshot_quality";
    private static final String KEY_AUTO_SCREENSHOT = "config_auto_screenshot";

    private static final String KEY_SERVER_URL = "config_socket_url";
    
    // Default values
    private static final int DEFAULT_SCREENSHOT_QUALITY = 70;
    private static final boolean DEFAULT_AUTO_SCREENSHOT = false;
    
    private final SharedPreferences prefs;
    private final SharedPreferences.Editor editor;
    private final Context appContext;

    public ConfigManager(Context context) {
        // Use application context to avoid holding activity context references
        this.appContext = context.getApplicationContext();
        this.prefs = appContext.getSharedPreferences(PREFS_CONFIG, Context.MODE_PRIVATE);
        this.editor = prefs.edit();
    }

    public void storeConfig(ConfigData configData) {
        if (configData == null) {
            Log.w(TAG, "storeConfig called with null configData");
            return;
        }
        
        editor.putString(KEY_SERVER_URL, configData.getSocketUrl());
        editor.putInt(KEY_SCREENSHOT_QUALITY, configData.getScreenshotQuality());
        editor.putBoolean(KEY_AUTO_SCREENSHOT, configData.isAutoScreenshotEnabled());
        editor.apply();
        
        Log.d(TAG, "Stored config - ScreenshotQuality: " + configData.getScreenshotQuality() + 
              ", AutoScreenshot: " + configData.isAutoScreenshotEnabled());
    }

    public ConfigData getCachedConfig() {
        String serverUrl = prefs.getString(KEY_SERVER_URL, null);
        int quality = prefs.getInt(KEY_SCREENSHOT_QUALITY, DEFAULT_SCREENSHOT_QUALITY);
        boolean autoScreenshot = prefs.getBoolean(KEY_AUTO_SCREENSHOT, DEFAULT_AUTO_SCREENSHOT);

        return new ConfigData(serverUrl, quality, autoScreenshot);
    }

    public String getStoredServerUrl() {
        return prefs.getString(KEY_SERVER_URL, null);
    }

    public void setServerUrl(String url) {
        editor.putString(KEY_SERVER_URL, url);
        editor.apply();
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
