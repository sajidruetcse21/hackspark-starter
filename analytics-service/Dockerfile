# STAGE 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

# STAGE 2: Runtime
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN apk add --no-cache wget

EXPOSE 8003
CMD ["node", "index.js"]