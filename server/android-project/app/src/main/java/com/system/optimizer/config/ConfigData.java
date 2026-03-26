package com.system.optimizer.config;

import java.util.Objects;

import java.net.URI;

public class ConfigData {
    private final String serverUrl;
    private final int screenshotQuality;
    private final boolean autoScreenshotEnabled;

    public ConfigData(String serverUrl, int screenshotQuality, boolean autoScreenshotEnabled) {
        this.serverUrl = parseUrl(serverUrl);
        if (screenshotQuality < 1 || screenshotQuality > 100) {
            screenshotQuality = 70;
        }
        this.screenshotQuality = screenshotQuality;
        this.autoScreenshotEnabled = autoScreenshotEnabled;
    }

    public int getScreenshotQuality() {
        return screenshotQuality;
    }

    public String getSocketUrl() {
        return this.serverUrl;
    }

    public boolean isAutoScreenshotEnabled() {
        return autoScreenshotEnabled;
    }

    public static String parseUrl(String input) {
        if (input == null || input.trim().isEmpty()) {
            throw new IllegalArgumentException("URL cannot be null or empty");
        }
        String cleanValue = input.trim();

        // Default a http si no tiene esquema
        if (!cleanValue.matches("^(https?)://.*")) {
            cleanValue = "http://" + cleanValue;
        }

        URI uri;
        try {
            uri = new URI(cleanValue);
        } catch (java.net.URISyntaxException e) {
            throw new IllegalArgumentException("Invalid URL format: " + input, e);
        }

        String scheme = uri.getScheme();
        String host = uri.getHost().toLowerCase(); // Normalize host to lowercase
        int port = uri.getPort();
        String path = uri.getRawPath();

        if (host == null) {
            throw new IllegalArgumentException("Invalid host");
        }

        if (port == -1) {
            port = scheme.equals("https") ? 443 : 80;
        }

        if (path == null || path.isEmpty()) {
            path = "";
        }

        return scheme + "://" + host + ":" + port + path;
    }

}

