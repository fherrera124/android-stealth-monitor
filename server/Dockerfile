FROM thyrlian/android-sdk:latest

# Install Node.js for the server
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# Explore Android SDK structure to find sdkmanager
RUN echo "Exploring Android SDK structure..." && \
    find /opt/android-sdk -name "sdkmanager" -type f 2>/dev/null && \
    ls -la /opt/android-sdk/ && \
    ls -la /opt/android-sdk/cmdline-tools/ 2>/dev/null || true

WORKDIR /app

# Copy only package.json and install dependencies
COPY server/package*.json ./

RUN npm install && npm cache clean --force

EXPOSE 4000

CMD ["node", "server.js"]
