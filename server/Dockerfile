FROM thyrlian/android-sdk:latest

# Install Node.js for the server
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# Find sdkmanager path and install required Android SDK components
RUN export SDK_MANAGER=$(find /opt -name "sdkmanager" -type f 2>/dev/null | head -1) && \
    export ACCEPT_LICENSES=yes && \
    echo "Found sdkmanager at: $SDK_MANAGER" && \
    yes | $SDK_MANAGER --licenses && \
    $SDK_MANAGER "build-tools;34.0.0" "platforms;android-34"

WORKDIR /app

# Copy source
COPY package.json ./
COPY vite.config.js ./
COPY server/server.js ./server.js
COPY server/ ./
COPY frontend/ ./frontend/

# Install dependencies
RUN npm install && npm cache clean --force

# Build frontend ON STARTUP (not during build) so it fills the shared volume properly
CMD sh -c "echo '🔨 Building React frontend...' && npm run build && echo '✅ Fixing permissions for nginx...' && chmod -R 755 /app/nginx/public && chown -R 101:101 /app/nginx/public && echo '✅ Permissions fixed' && ls -la /app/nginx/public/ && echo '🚀 Starting node server...' && node server.js"
