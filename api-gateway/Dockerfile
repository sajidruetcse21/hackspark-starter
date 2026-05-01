# STAGE 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy lockfiles for a clean install
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# STAGE 2: Runtime
FROM node:20-alpine AS runtime
WORKDIR /app

# Set environment to production to reduce footprint
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source files
COPY . .

# Ensure wget is installed for the healthcheck defined in docker-compose
RUN apk add --no-cache wget

# Update the port for each specific service
EXPOSE 8000
CMD ["node", "index.js"]