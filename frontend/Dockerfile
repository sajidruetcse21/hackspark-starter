FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (needed for build)
RUN npm install

# Copy app source
COPY pages ./pages

# Build Next.js app
RUN npm run build

# ── Runtime Stage ──────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install curl for healthchecks
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --only=production

# Copy built app from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/pages ./pages

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

# Start app
CMD ["npm", "start"]