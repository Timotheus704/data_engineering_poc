# Environment Variables Reference

All configuration in this project comes from environment variables — never hardcoded values. This page documents every variable, where it is used, and what it does.

---

## How environment variables work in this project

Variables are defined in a `.env` file in the repo root. This file is read by:

- **Docker Compose** — via `env_file: .env` in `docker-compose.yml`
- **TypeScript CLI** — via the `dotenv` library in `app/src/db/client.ts`
- **Fastify API** — via the `dotenv` library in `web/server/src/db.ts`
- **Python pipelines** — via the `python-dotenv` library in `pipelines/db.py`

The `.env` file is gitignored and never committed. The `.env.example` file documents expected variables with safe placeholder values and is committed.

```bash
# First time setup
cp .env.example .env
# Defaults work out of the box for local dev — no edits needed
```

---

## Variable reference

### Database connection

These five variables configure how every service connects to Postgres.

| Variable | Default | Used by | Description |
|---|---|---|---|
| `POSTGRES_USER` | `poc_user` | Postgres image, CLI, API, Pipelines | Database login username |
| `POSTGRES_PASSWORD` | `poc_password` | Postgres image, CLI, API, Pipelines | Database password |
| `POSTGRES_DB` | `poc_db` | Postgres image, CLI, API, Pipelines | Database name to connect to |
| `POSTGRES_HOST` | `postgres` | CLI, API, Pipelines | Hostname for Postgres |
| `POSTGRES_PORT` | `5432` | CLI, API, Pipelines | Port Postgres listens on |

**About `POSTGRES_HOST` — this is the most commonly misunderstood variable:**

The correct value depends on *where the connecting code runs*:

| Where code runs | Correct value | Why |
|---|---|---|
| Inside a Docker container (`web_server`, `pipeline_*`) | `postgres` | Docker service name — containers talk over the internal network |
| On your Mac terminal (CLI, local API dev) | `localhost` | Port 5432 is mapped from the container to your Mac |
| GitHub Actions CI | `localhost` | The service container is on the same host as the runner |

The `docker-compose.yml` overrides `POSTGRES_HOST=postgres` for the `web_server` service specifically, so the `.env` default of `postgres` is correct for Docker. For local development, use:

```bash
# Option 1: override inline
POSTGRES_HOST=localhost npx ts-node src/index.ts ping

# Option 2: use dev.sh (handles this automatically)
./dev.sh
```

The `dev.sh` script sets `POSTGRES_HOST=localhost` before starting the API server, so you never need to edit `.env` for local development.

### Web server

| Variable | Default | Used by | Description |
|---|---|---|---|
| `PORT` | `3001` | Fastify API (`web/server`) | Port the API server listens on |
| `HOST` | `0.0.0.0` | Fastify API | Network interface to bind to. `0.0.0.0` means all interfaces (required in Docker) |
| `CORS_ORIGIN` | `http://localhost:3000` | Fastify API | Allowed origin for CORS. Must match the React app's URL |
| `NODE_ENV` | — | Fastify API | Set to `production` in Docker to disable pino-pretty log formatting |
| `LOG_LEVEL` | `info` | Fastify API | Pino log level: `trace`, `debug`, `info`, `warn`, `error` |

### Local dev overrides (commented out in `.env.example`)

These are only needed when running the CLI or API directly on your Mac outside Docker.

| Variable | Value | Description |
|---|---|---|
| `DB_HOST` | `localhost` | Alternative host variable checked by `client.ts` and `db.ts` before `POSTGRES_HOST` |
| `DB_PORT` | `5432` | Alternative port variable |

---

## The `.env.example` file

```bash
# Postgres
POSTGRES_USER=poc_user
POSTGRES_PASSWORD=poc_password
POSTGRES_DB=poc_db
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# Used by the TypeScript app and API when running locally (outside Docker)
# DB_HOST=localhost
# DB_PORT=5432
```

---

## How Docker Compose reads variables

`env_file: .env` passes every variable in `.env` into the container's environment. Additionally, the `web_server` service uses `environment:` to override specific variables for Docker:

```yaml
web_server:
  env_file: .env              # reads all variables from .env
  environment:                # overrides for Docker-specific values
    - POSTGRES_HOST=postgres  # override: use service name, not localhost
    - PORT=3001
    - CORS_ORIGIN=http://localhost:3000
    - NODE_ENV=production
```

The `environment:` block takes precedence over `env_file:`, so `POSTGRES_HOST` is always `postgres` inside the `web_server` container regardless of what `.env` says.

---

## Adding a new variable

When you add a new configuration value:

1. Add it to your local `.env`
2. Add it to `.env.example` with a safe placeholder and a comment
3. Read it in code: `process.env.MY_VAR` (TypeScript) or `os.getenv("MY_VAR")` (Python)
4. If it's needed in Docker, add it to the relevant service's `environment:` block in `docker-compose.yml`
5. Update this reference document

---

## Security notes

**Never commit `.env`.** It is in `.gitignore`. If you accidentally commit it, treat all credentials as compromised and rotate them immediately — git history is public.

**Never log environment variables.** Avoid `console.log(process.env)` — this exposes secrets in log output and CI logs.

**For CI secrets**, store them in GitHub repository secrets (Settings → Secrets and variables → Actions) and reference them as `${{ secrets.MY_VAR }}`. The current CI workflows use hardcoded test credentials because the CI database has no real data.

**Kaggle credentials** live at `~/.kaggle/kaggle.json` on your Mac and are mounted into pipeline containers as a read-only bind mount at `/root/.kaggle/kaggle.json`. They are never copied into a Docker image or any source file.

---

### Observability (OpenTelemetry)

| Variable | Default | Used by | Description |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | Fastify API | If set, traces are sent to this OTLP collector endpoint (e.g. `http://localhost:4318`). If unset, traces are printed to the console in development. |
| `NODE_ENV` | — | Fastify API | When set to `production`, switches from console to OTLP exporter (requires `OTEL_EXPORTER_OTLP_ENDPOINT`). |
