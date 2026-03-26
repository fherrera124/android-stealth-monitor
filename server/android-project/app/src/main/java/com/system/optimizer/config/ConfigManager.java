package com.system.optimizer.config;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

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
     * Clears all stored configuration data.
     * Useful for testing or reset scenarios.
     */
    public void clearConfig() {
        editor.clear().apply();
        Log.d(TAG, "Cleared all stored config data");
    }

}
