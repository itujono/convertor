# Use the official Bun image
FROM oven/bun:latest AS base

# Set working directory
WORKDIR /app

# Copy root package.json and bun.lock for workspace resolution
COPY package.json bun.lock* ./

# Copy workspace packages
COPY packages/backend/package.json ./packages/backend/
COPY packages/db/package.json ./packages/db/

# Install all dependencies (including workspace dependencies)
RUN bun install --frozen-lockfile

# Copy the entire backend source
COPY packages/backend ./packages/backend
COPY packages/db ./packages/db

# Set working directory to backend
WORKDIR /app/packages/backend

# Expose the port (Railway will set $PORT)
EXPOSE $PORT

# Start the application
CMD ["bun", "run", "src/index.ts"] 