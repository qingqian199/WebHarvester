# Use official Node image
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
COPY config.json ./
COPY tasks.json ./
RUN mkdir -p /app/sessions /app/output
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
