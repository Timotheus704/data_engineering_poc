# Environment Variables Reference

All configuration in this project comes from environment variables, never hardcoded values. This page documents every variable, where it is used, and what it does.

---

## How environment variables work in this project

Variables are defined in a `.env` file in the repo root. This file is read by:

- **Docker Compose** — via `env_file: .env` in `docker-compose.yml`
- **The TypeScript app** — via the `dotenv` library in `app/src/db/client.ts`
- **Python pipelines** — via the `python-dotenv` library in `pipelines/db.py`

The `.env` file is gitignored and never committed. The `.env.example` file documents the expected variables with safe placeholder values and is committed.

```bash
# First time setup
cp .env.example .env
# Edit .env with your actual values
```

---

## Variable reference

### Database connection

These variables configure how all services connect to Postgres.

| Variable | Default | Used by | Description |
|---|---|---|---|
| `POSTGRES_USER` | `poc_user` | Postgres, TS app, Python | Database username |
| `POSTGRES_PASSWORD` | `poc_password` | Postgres, TS app, Python | Database password |
| `POSTGRES_DB` | `poc_db` | Postgres, TS app, Python | Database name |
| `POSTGRES_HOST` | `postgres` | TS app (Docker), Python (Docker) | Hostname for Postgres. Inside Docker this is the service name `postgres`. From your Mac this should be `localhost` |
| `POSTGRES_PORT` | `5432` | TS app, Python | Port Postgres listens on |

**About `POSTGRES_HOST`:**

This variable behaves differently depending on where the connecting code runs:

```
Inside Docker container → use "postgres"   (Docker internal network, service name)
On your Mac terminal    → use "localhost"  (port mapped by Docker Compose)
In GitHub Actions CI    → use "localhost"  (service container on same host)
```

The TypeScript client checks both `POSTGRES_HOST` and `DB_HOST`:
```typescript
host: process.env.POSTGRES_HOST ?? process.env.DB_HOST ?? 'localhost'
```

So for local terminal use you can either:
1. Edit `.env` and set `POSTGRES_HOST=localhost`
2. Use the commented `DB_HOST=localhost` entry in `.env`
3. Override inline: `POSTGRES_HOST=localhost npx ts-node src/index.ts ping`

### Local development overrides (optional)

These are commented out in `.env.example` and only needed when running the app directly on your Mac (not in Docker).

| Variable | Value | Description |
|---|---|---|
| `DB_HOST` | `localhost` | Alternative host variable for local runs; takes precedence over `POSTGRES_HOST` if set |
| `DB_PORT` | `5432` | Alternative port variable |

---

## The `.env.example` file

This file is the canonical reference for what variables exist. It is committed to git and should be kept up to date.

```bash
# Postgres
POSTGRES_USER=poc_user
POSTGRES_PASSWORD=poc_password
POSTGRES_DB=poc_db
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# Used by the TypeScript app when running locally (outside Docker)
# DB_HOST=localhost
# DB_PORT=5432
```

---

## How Docker Compose reads variables

The `env_file: .env` directive in `docker-compose.yml` passes every variable in `.env` as an environment variable to the container:

```yaml
postgres:
  image: postgres:16-alpine
  env_file: .env          # ← all variables in .env become env vars in the container
```

The official Postgres Docker image reads `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` automatically on first startup to create the database and user.

---

## Adding a new variable

When you add a new configuration value:

1. Add it to `.env` with your local value
2. Add it to `.env.example` with a safe placeholder and a comment explaining what it is
3. Reference it in code via `process.env.MY_VAR` (TypeScript) or `os.getenv("MY_VAR")` (Python)
4. Update this reference document

Example:
```bash
# .env
KAGGLE_API_KEY=abc123xyz

# .env.example
# Kaggle API key — get yours at https://www.kaggle.com/settings → API
KAGGLE_API_KEY=your_kaggle_api_key_here
```

---

## Security notes

**Never commit `.env`.** It is in `.gitignore` for this reason. If you accidentally commit it, rotate all credentials immediately — git history is public and searchable.

**Never log environment variables.** Avoid `console.log(process.env)` or similar — this exposes secrets in log output.

**Use GitHub Secrets for CI.** The current CI workflows use hardcoded test credentials because the CI database has no real data. If you extend this to a real environment, store credentials in GitHub repository secrets and reference them as `${{ secrets.MY_VAR }}`.

**Kaggle credentials** are in `~/.kaggle/kaggle.json` and are mounted into pipeline containers as a read-only bind mount. They are never copied into the Docker image or any file in this repo.
