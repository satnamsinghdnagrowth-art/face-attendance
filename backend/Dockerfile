FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (sharp)
RUN apk add --no-cache python3 make g++ vips-dev

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDeps for TypeScript build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# ─── Production Stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies for sharp
RUN apk add --no-cache vips

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy migration files (SQL)
COPY src/migrations/*.sql ./dist/migrations/

# Create upload directories
RUN mkdir -p uploads/photos uploads/faces uploads/attendance logs

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start application
CMD ["node", "dist/server.js"]
