# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy workspace root manifests first (layer cache)
COPY package.json package-lock.json ./
COPY apps/api/package.json        ./apps/api/
COPY apps/web/package.json        ./apps/web/
COPY packages/types/package.json  ./packages/types/

# Install all deps (dev included — needed to compile TS and run Vite)
RUN npm ci

# Copy source
COPY . .

# Build TypeScript API + React frontend
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Runtime deps for better-sqlite3 on Alpine
RUN apk add --no-cache libstdc++

WORKDIR /app

# Copy only what we need to run
COPY --from=builder /app/package.json       ./
COPY --from=builder /app/node_modules       ./node_modules
COPY --from=builder /app/apps/api/dist      ./apps/api/dist
COPY --from=builder /app/apps/web/dist      ./apps/web/dist

# Volume mount point for SQLite database
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["node", "apps/api/dist/index.js"]
