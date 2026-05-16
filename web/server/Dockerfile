FROM node:20-alpine AS base
WORKDIR /app

# ── deps layer (cached unless package.json changes) ──────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ── build layer ───────────────────────────────────────────────────────────────
FROM deps AS builder
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── production image ──────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
