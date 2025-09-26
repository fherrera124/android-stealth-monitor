FROM thyrlian/android-sdk:latest

# Install Node.js for the basic HTTP server
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the builder script
COPY builder.js .

COPY package.json .

RUN npm install

EXPOSE 8080

CMD ["node", "builder.js"]