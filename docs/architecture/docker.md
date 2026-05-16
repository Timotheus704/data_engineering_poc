# Docker & Containers

This document explains how Docker is used in this project, what each container does, and how they communicate.

---

## What is Docker?

Docker is a tool for packaging software into **containers** — self-contained units that include the application code, its runtime, its dependencies, and its configuration. A container runs the same way on any machine, regardless of what is installed locally.

Think of a container like a shipping container on a cargo ship: standardised, self-contained, stackable, and it doesn't matter what port (operating system) it arrives at — the contents are always the same.

**Why use Docker for this project?**
- You don't need to install Postgres, Python, or Node.js at specific versions on your Mac
- The development environment matches CI exactly
- All services start with a single command: `docker compose up`

---

## Key files

| File | Purpose |
|---|---|
| `docker-compose.yml` | Defines all services and how they connect |
| `app/Dockerfile` | Builds the TypeScript app container image |
| `pipelines/Dockerfile` | Builds the Python pipeline container image |

---

## The docker-compose.yml explained

The `docker-compose.yml` file is the orchestration config. It defines four services:

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
    timeout: 5s
    retries: 10
```

**What each part does:**

- `image: postgres:16-alpine` — uses the official Postgres 16 image based on Alpine Linux (a tiny OS, keeps the image small)
- `env_file: .env` — reads credentials from your `.env` file so they never live in the compose file
- `ports: "5432:5432"` — maps port 5432 on your Mac to port 5432 inside the container; this is how you connect from your host machine or a GUI client
- `volumes:` has two entries:
  - `postgres_data:/var/lib/postgresql/data` — a named volume that persists your data across container restarts; without this, all data is lost when the container stops
  - `./db/migrations:/docker-entrypoint-initdb.d` — mounts the migration SQL files into the special init directory that Postgres automatically runs on first startup
- `healthcheck` — Docker repeatedly checks if Postgres is accepting connections before allowing dependent services to start

### `app` service

```yaml
app:
  build:
    context: ./app
    dockerfile: Dockerfile
  env_file: .env
  depends_on:
    postgres:
      condition: service_healthy
  volumes:
    - ./app/src:/app/src
  command: npx ts-node src/index.ts
```

- `build:` — builds the image from `app/Dockerfile` rather than pulling a pre-built one
- `depends_on: condition: service_healthy` — waits until the Postgres health check passes before starting; this prevents connection errors on startup
- `volumes: ./app/src:/app/src` — mounts your local source code into the container so changes take effect without rebuilding the image
- `command` — overrides the Dockerfile's default command; useful for running specific CLI commands

### Pipeline services (`pipeline_titanic`, `pipeline_nyc_taxi`)

```yaml
pipeline_titanic:
  build:
    context: ./pipelines
    dockerfile: Dockerfile
  depends_on:
    postgres:
      condition: service_healthy
  volumes:
    - ${HOME}/.kaggle:/root/.kaggle:ro
  command: python titanic/ingest.py
  profiles: [pipeline]
```

- `${HOME}/.kaggle:/root/.kaggle:ro` — mounts your Kaggle credentials from your Mac into the container read-only (`:ro`); the credentials are never copied into the image
- `profiles: [pipeline]` — this service only starts when you explicitly pass `--profile pipeline`; it does not start with a plain `docker compose up`

---

## The Dockerfile files explained

### `app/Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
CMD ["npx", "ts-node", "src/index.ts", "ping"]
```

Each line creates a **layer** in the image:

1. `FROM node:20-alpine` — start from the official Node 20 image (Alpine = small)
2. `WORKDIR /app` — all subsequent commands run in the `/app` directory
3. `COPY package.json ... && RUN npm ci` — copy dependency files and install; this is done before copying source code so Docker can **cache** this layer — if `package.json` hasn't changed, Docker skips reinstalling dependencies on the next build
4. `COPY src ./src` — copy the application source code
5. `CMD` — the default command when the container starts

**Why copy `package.json` before `src/`?** Docker builds layers incrementally. If you copy everything at once and then run `npm ci`, any change to any source file invalidates the install layer and forces a full reinstall. Separating them means edits to TypeScript files only re-copy source code — the install layer stays cached.

### `pipelines/Dockerfile`

```dockerfile
FROM python:3.11-slim
WORKDIR /pipelines
RUN apt-get update && apt-get install -y libpq-dev gcc
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
```

- `python:3.11-slim` — official Python 3.11, slim variant (no extras preinstalled)
- `apt-get install libpq-dev gcc` — required to compile `psycopg2`, the Postgres adapter for Python
- Same layer-caching pattern: install dependencies before copying source code

---

## How containers communicate

All services defined in the same `docker-compose.yml` are automatically placed on a shared Docker network. They communicate using their **service name as the hostname**.

```
TypeScript app ──→ connects to hostname "postgres", port 5432
Python pipeline ──→ connects to hostname "postgres", port 5432
Your Mac ──→ connects to localhost:5432 (mapped via ports:)
```

This is why the `.env` file has:
```
POSTGRES_HOST=postgres   ← used inside Docker (service name)
# DB_HOST=localhost      ← use this when running the app locally outside Docker
```

---

## Named volumes vs bind mounts

Two types of volumes are used in this project:

**Named volume** — `postgres_data:/var/lib/postgresql/data`
- Managed entirely by Docker
- Data persists across `docker compose down` (but is deleted with `docker compose down -v`)
- Not directly accessible as a folder on your Mac
- Used for database data because Postgres manages its own file format

**Bind mount** — `./app/src:/app/src`
- A direct link between a folder on your Mac and a path inside the container
- Changes on your Mac are instantly reflected in the container
- Used for source code so you can edit locally and see changes without rebuilding the image

---

## Common Docker commands

```bash
# Start all services (detached — runs in background)
docker compose up -d

# Start only Postgres
docker compose up -d postgres

# Start pipelines (requires the pipeline profile)
docker compose --profile pipeline up pipeline_titanic

# View running containers
docker compose ps

# Stream logs from a service
docker compose logs -f postgres
docker compose logs -f app

# Stop all services (data volume is preserved)
docker compose down

# Stop and delete the data volume (fresh start)
docker compose down -v

# Rebuild an image after changing a Dockerfile
docker compose build app
docker compose up -d app

# Open a shell inside a running container
docker compose exec postgres sh
docker compose exec app sh

# Run a one-off command in a container
docker compose run --rm app npx ts-node src/index.ts tables
```

---

## Profiles

Docker Compose profiles let you group services that shouldn't start by default. The pipeline services have `profiles: [pipeline]`, meaning they only start when explicitly requested.

```bash
# This does NOT start pipelines
docker compose up -d

# This starts ONLY the titanic pipeline (and postgres if not running)
docker compose --profile pipeline up pipeline_titanic

# This starts ALL profile=pipeline services
docker compose --profile pipeline up
```

This design keeps the development workflow clean — you only run pipelines when you actually want to ingest data.
