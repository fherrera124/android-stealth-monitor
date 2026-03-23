package com.system.optimizer.config;

import java.util.Objects;

import java.net.URI;

public class ConfigData {
    private final String socketUrl;
    private final String configUrl;
    private final int screenshotQuality;
    private final String configHash; // SHA-256 hash of the config JSON
    private final boolean autoScreenshotEnabled;

    public ConfigData(String socketUrl, String configUrl, int screenshotQuality, String configHash, boolean autoScreenshotEnabled) {
        this.socketUrl = parseUrl(socketUrl);
        this.configUrl = parseUrl(configUrl);
        if (screenshotQuality < 1 || screenshotQuality > 100) {
            screenshotQuality = 70;
        }
        this.screenshotQuality = screenshotQuality;
        this.configHash = configHash;
        this.autoScreenshotEnabled = autoScreenshotEnabled;
    }

    public String getConfigUrl() {
        return configUrl;
    }

    public int getScreenshotQuality() {
        return screenshotQuality;
    }

    public String getConfigHash() {
        return configHash;
    }

    public String getSocketUrl() {
        return this.socketUrl;
    }

    public boolean isAutoScreenshotEnabled() {
        return autoScreenshotEnabled;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;

        if (o == null || getClass() != o.getClass()) return false;

        ConfigData that = (ConfigData) o;
        return Objects.equals(configHash, that.configHash);
    }

    @Override
    public int hashCode() {
        return Objects.hash(configHash);
    }

    public static String parseUrl(String input) {
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

