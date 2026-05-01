FROM node:20-alpine

WORKDIR /app

# Install curl for healthchecks
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY src ./src
COPY index.js ./

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8001/status || exit 1

# Start app
CMD ["npm", "start"]