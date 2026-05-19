# Docker & Containers

This document explains how Docker is used in this project, what each container does, and how they communicate.

---

## What is Docker?

Docker is a tool for packaging software into **containers** — self-contained units that include the application code, its runtime, its dependencies, and its configuration. A container runs the same way on any machine, regardless of what is installed locally.

Think of a container like a shipping container: standardised, self-contained, and it doesn't matter what port (operating system) it arrives at — the contents are always the same.

**Why use Docker for this project?**
- You don't need to install Postgres, Python, or Node.js at specific versions on your Mac
- The development environment matches CI exactly
- All services start with a single command

---

## Services overview

This project has **six services** defined in `docker-compose.yml`, grouped by Docker profile:

| Service | Container name | Profile | Port | Purpose |
|---|---|---|---|---|
| `postgres` | `poc_postgres` | *(always)* | 5432 | PostgreSQL 16 database |
| `app` | `poc_app` | *(always)* | — | TypeScript CLI (run-and-exit) |
| `web_server` | `poc_web_server` | `web` | 3001 | Fastify REST API |
| `web_client` | `poc_web_client` | `web` | 3000 | React app served by nginx |
| `pipeline_titanic` | `poc_pipeline_titanic` | `pipeline` | — | Titanic ingestion pipeline |
| `pipeline_nyc_taxi` | `poc_pipeline_nyc_taxi` | `pipeline` | — | NYC Taxi ingestion pipeline |

---

## Key files

| File | Purpose |
|---|---|
| `docker-compose.yml` | Defines all services and how they connect |
| `app/Dockerfile` | Builds the TypeScript CLI image |
| `web/server/Dockerfile` | Builds the Fastify API image (multi-stage) |
| `web/client/Dockerfile` | Builds the React app image (multi-stage, nginx) |
| `web/client/nginx.conf` | nginx config: serves static files + proxies `/api/*` |
| `pipelines/Dockerfile` | Builds the Python pipeline image |

---

## The `docker-compose.yml` explained

### `postgres` service

```yaml
postgres:
  image: postgres:16-alpine
  container_name: poc_postgres
  env_file: .env
  ports:
    - "5432:5432"
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./db/migrations:/docker-entrypoint-initdb.d
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
    interval: 5s
    retries: 10
```

- `image: postgres:16-alpine` — official Postgres 16, Alpine Linux base (keeps image small)
- `env_file: .env` — credentials come from your `.env` file, never hardcoded
- `ports: "5432:5432"` — maps the container port to your Mac so GUI clients and local scripts can connect
- Two volumes:
  - `postgres_data` — a named volume that **persists data** across container restarts
  - `./db/migrations:/docker-entrypoint-initdb.d` — Postgres runs these SQL files automatically on first startup
- `healthcheck` — other services wait for this to pass before starting, preventing connection errors on boot

### `web_server` service

```yaml
web_server:
  build:
    context: ./web/server
    dockerfile: Dockerfile
  env_file: .env
  environment:
    - POSTGRES_HOST=postgres   # ← uses Docker service name, not localhost
    - PORT=3001
    - CORS_ORIGIN=http://localhost:3000
  ports:
    - "3001:3001"
  depends_on:
    postgres:
      condition: service_healthy
  profiles: [web]
```

- `build:` — builds from `web/server/Dockerfile` (multi-stage: compile TypeScript → slim production image)
- `environment` overrides `env_file` for Docker-specific values. `POSTGRES_HOST=postgres` is critical — inside Docker, services talk to each other by **service name**, not `localhost`
- `depends_on: condition: service_healthy` — waits for the Postgres health check before starting
- `profiles: [web]` — only starts when you pass `--profile web`

### `web_client` service

```yaml
web_client:
  build:
    context: ./web/client
    dockerfile: Dockerfile
  ports:
    - "3000:80"
  depends_on:
    - web_server
  profiles: [web]
```

- `build:` — builds from `web/client/Dockerfile` (multi-stage: Vite build → nginx serving static files)
- `ports: "3000:80"` — nginx listens on port 80 inside the container, mapped to 3000 on your Mac
- No `env_file` needed — the client is pure static HTML/JS after the build; it doesn't read env vars at runtime
- `depends_on: web_server` — ensures the API is up before the client starts

### Pipeline services

```yaml
pipeline_titanic:
  build:
    context: ./pipelines
    dockerfile: Dockerfile
  volumes:
    - ./pipelines:/pipelines
    - ${HOME}/.kaggle:/root/.kaggle:ro   # ← credentials mounted read-only
  command: python titanic/ingest.py
  profiles: [pipeline]
```

- `${HOME}/.kaggle:/root/.kaggle:ro` — mounts your Kaggle credentials from your Mac into the container; `:ro` means read-only so the container can't modify them
- `profiles: [pipeline]` — does **not** start with plain `docker compose up`; must be explicitly requested

---

## Dockerfile deep dives

### `web/server/Dockerfile` — multi-stage build

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS builder
COPY tsconfig.json ./
COPY src ./src
RUN npm run build          # tsc → outputs to dist/

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

**Why multi-stage?** Each `FROM` is a separate build stage. The final `runner` image only copies in `node_modules` and the compiled `dist/` — not the TypeScript source, the TypeScript compiler, or any other build tool. This produces a **smaller, more secure production image**.

### `web/client/Dockerfile` — React build + nginx

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build     # vite build → outputs to dist/

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

The React app is compiled to static HTML, CSS, and JavaScript files in `dist/`. The nginx stage copies them in and serves them. There is no Node.js or React in the final image — just nginx and files.

### Layer caching — why dependencies are copied first

```dockerfile
COPY package.json package-lock.json* ./   ← copied first
RUN npm ci                                 ← runs only if package.json changed
COPY src ./src                            ← copied after
```

Docker caches each layer. If `package.json` hasn't changed, the `npm ci` layer is reused from cache — saving 30–60 seconds on every rebuild. If `src/` files change, only the last `COPY` is invalidated.

---

## How containers communicate

All services in the same `docker-compose.yml` share a Docker network automatically. They communicate using the **service name as hostname**:

```
web_server container → connects to hostname "postgres", port 5432 ✅
web_client container → proxies /api/* to hostname "web_server", port 3001 ✅
Your Mac terminal    → connects to localhost:5432 (port mapped) ✅
Your Mac browser     → connects to localhost:3000 (port mapped) ✅
```

This is why `POSTGRES_HOST=postgres` in the `web_server` environment — `localhost` inside a container refers to the container itself, not other containers.

### The proxy chain in Docker

```
Browser → localhost:3000
    │
    ▼
nginx (web_client container, port 80)
    │
    ├── /api/* → proxy_pass http://web_server:3001   (API calls)
    ├── /docs  → proxy_pass http://web_server:3001   (Swagger UI)
    └── /*     → serve /usr/share/nginx/html/index.html  (React app)
```

### The proxy chain in dev mode

```
Browser → localhost:3000
    │
    ▼
Vite dev server (your Mac, port 3000)
    │
    ├── /api/* → proxy → http://localhost:3001   (Fastify on your Mac)
    └── /*     → serve React app with hot reload
```

The result is identical from the browser's perspective — one origin, no CORS issues.

---

## Named volumes vs bind mounts

| Type | Example | Persists? | Accessible from Mac? | Used for |
|---|---|---|---|---|
| Named volume | `postgres_data:/var/lib/postgresql/data` | Yes (until `down -v`) | No | DB data |
| Bind mount | `./app/src:/app/src` | Yes (it's your files) | Yes | Source code in dev |
| Bind mount (read-only) | `~/.kaggle:/root/.kaggle:ro` | Yes | Yes | Credentials |

---

## Common Docker commands

```bash
# ── Starting services ─────────────────────────────────────────────────────────
docker compose up -d postgres                        # Postgres only
docker compose --profile web up --build              # Full web app (build images first)
docker compose --profile web up                      # Full web app (use cached images)
docker compose --profile pipeline up pipeline_titanic

# ── Monitoring ────────────────────────────────────────────────────────────────
docker compose ps                                    # All running containers + status
docker compose logs -f web_server                    # Stream API server logs
docker compose logs -f web_client                    # Stream nginx logs
docker compose logs -f postgres                      # Stream DB logs

# ── Rebuilding ────────────────────────────────────────────────────────────────
docker compose --profile web build web_server        # Rebuild API image
docker compose --profile web build web_client        # Rebuild React image

# ── Stopping ──────────────────────────────────────────────────────────────────
docker compose down                                  # Stop all; data volume preserved
docker compose down -v                               # Stop all + delete data volume

# ── Debugging ─────────────────────────────────────────────────────────────────
docker compose exec postgres psql -U poc_user poc_db # psql shell in DB container
docker compose exec web_server sh                    # Shell in API container
docker compose run --rm web_server node dist/index.js ping  # One-off command
```

---

## Docker profiles

Profiles let you group services that should not start by default:

```bash
# No profile → starts postgres + app only
docker compose up -d

# web profile → starts postgres + web_server + web_client
docker compose --profile web up

# pipeline profile → starts postgres + one pipeline (run and exit)
docker compose --profile pipeline up pipeline_titanic

# Multiple profiles at once
docker compose --profile web --profile pipeline up
```

This design keeps `docker compose up` fast for day-to-day work, and makes pipelines an explicit opt-in.
