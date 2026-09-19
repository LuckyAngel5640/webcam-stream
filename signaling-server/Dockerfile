FROM node:20-alpine

WORKDIR /app

# Install dependencies for signaling server
COPY signaling-server/package*.json ./
RUN npm ci --only=production

# Copy signaling server
COPY signaling-server/server.js ./

# Copy pre-built website (build locally first, or build in container)
COPY website/build ./website/build

EXPOSE 8080

CMD ["node", "server.js"]