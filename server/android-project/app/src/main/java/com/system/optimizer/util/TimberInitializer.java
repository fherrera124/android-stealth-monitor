package com.system.optimizer.util;

import android.app.Application;
import android.util.Log;

import timber.log.Timber;

/**
 * Initializes Timber logging with custom configuration.
 * Uses a single TAG "StealthMonitor" for all logs.
 * Automatically includes the class name in each log message.
 * 
 * Usage in Application.onCreate():
 *   TimberInitializer.init();
 * 
 * Then use Timber anywhere:
 *   Timber.d("Message");           // Logs with class name automatically
 *   Timber.e("Error: %s", error);  // Logs error with formatting
 * 
 * Filter in logcat:
 *   adb logcat -s StealthMonitor
 */
public class TimberInitializer {
    
    private static final String APP_TAG = "StealthMonitor";
    
    /**
     * Initialize Timber with custom tree that uses single TAG.
     * Call this in your Application.onCreate() method.
     */
    public static void init() {
        Timber.plant(new StealthMonitorTree());
    }
    
    /**
     * Custom Timber tree that uses a single TAG for all logs
     * and includes the class name automatically.
     */
    private static class StealthMonitorTree extends Timber.DebugTree {
        
        @Override
        protected String createStackElementTag(StackTraceElement element) {
            // Returns format: [ClassName]
            String className = element.getClassName();
            String simpleName = className.substring(className.lastIndexOf('.') + 1);
            return "[" + simpleName + "]";
        }
        
        @Override
        protected void log(int priority, String tag, String message, Throwable t) {
            // Use our custom TAG instead of the default one
            String finalTag = APP_TAG;
            
            // Prepend the tag (which contains [ClassName]) to the message
            String finalMessage = (tag != null ? tag + " " : "") + message;
            
            // Use Android's Log with our custom TAG
            Log.println(priority, finalTag, finalMessage);
            
            // Log exception if present
            if (t != null) {
                Log.println(priority, finalTag, Log.getStackTraceString(t));
            }
        }
    }
}
