package com.system.optimizer.config;

import android.util.Log;

import java.security.MessageDigest;

class ConfigHasher {
    private static final String TAG = "ConfigHasher";

    public static String hashConfig(String configJson) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(configJson.getBytes());
            return bytesToHex(hash);
        } catch (Exception e) {
            Log.e(TAG, "Error computing config hash", e);
            return null;
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder hexString = new StringBuilder();
        for (byte b : bytes) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) {
                hexString.append('0');
            }
            hexString.append(hex);
        }
        return hexString.toString();
    }
}
