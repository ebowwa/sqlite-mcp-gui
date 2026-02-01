# =============================================================================
# Multi-stage Dockerfile for sqlite-mcp-gui
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Set build arguments
ARG NODE_ENV=production

# Set working directory
WORKDIR /app

# Set environment variables for build
ENV NODE_ENV=${NODE_ENV} \
    npm_config_production=false

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production Runner
# -----------------------------------------------------------------------------
FROM node:22-alpine AS production

# Metadata labels
LABEL maintainer="sqlite-mcp-gui" \
      org.opencontainers.image.title="SQLite MCP GUI" \
      org.opencontainers.image.description="A web interface for SQLite databases using MCP protocol" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="sqlite-mcp-gui"

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000

# Install runtime dependencies only
RUN apk add --no-cache \
    sqlite \
    ca-certificates

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built artifacts from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy public assets
COPY --chown=nodejs:nodejs src/ui/public ./dist/ui/public

# Create directory for databases with proper permissions
RUN mkdir -p /app/data && \
    chown -R nodejs:nodejs /app/data

# Switch to non-root user
USER nodejs

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/ui/server.js"]
