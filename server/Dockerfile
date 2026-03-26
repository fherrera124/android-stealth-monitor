FROM thyrlian/android-sdk:latest

# Install Node.js for the server and accept Android SDK licenses
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# Accept Android SDK licenses
RUN yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses || true

# Install required Build Tools
RUN $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "build-tools;34.0.0" "platforms;android-34"

WORKDIR /app

# Copy only package.json and install dependencies
COPY server/package*.json ./

RUN npm install && npm cache clean --force

EXPOSE 4000

CMD ["node", "server.js"]
