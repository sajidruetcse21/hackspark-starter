# STAGE 1: The Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# STAGE 2: The Lean Runtime (Nginx Alpine is ~20MB)
FROM nginx:alpine AS runtime

# Copy build artifacts from builder stage
# N.B. If using Vite, the folder is usually 'dist'. If CRA, it is 'build'.
COPY --from=builder /app/dist /usr/share/nginx/html

# Create custom Nginx config to support Port 3000 and internal routing
RUN echo 'server { \
    listen 3000; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Essential: Install wget so the Healthcheck in your compose file works (P1)
RUN apk add --no-cache wget

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]