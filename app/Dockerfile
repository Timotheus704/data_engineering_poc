FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Default: run the CLI with ts-node (dev-friendly)
CMD ["npx", "ts-node", "src/index.ts", "ping"]
