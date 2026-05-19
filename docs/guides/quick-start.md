# Quick Start Guide

Get the full stack running on your Mac in under 10 minutes. No prior experience required.

---

## What you'll have at the end

- PostgreSQL running in Docker with schema and sample data loaded
- A React dashboard at http://localhost:3000
- A REST API at http://localhost:3001 with Swagger docs
- The TypeScript CLI working for terminal-based data exploration

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop |
| Node.js | 20+ | `brew install node` |
| Python | 3.11+ | `brew install python@3.11` *(pipelines only — skip if not needed)* |

**Install Docker Desktop:**
1. Download from https://www.docker.com/products/docker-desktop (choose Apple Silicon for M-series Macs)
2. Open the `.dmg` and drag Docker to Applications
3. Open Docker Desktop and wait for "Docker Desktop is running" in the menu bar

**Verify:**
```bash
docker --version   # Docker version 25.x.x
node --version     # v20.x.x or higher
```

---

## Step 1 — Get the code

```bash
git clone <your-repo-url>
cd poc-repo

# Or if you downloaded a zip:
unzip poc-repo.zip && cd poc-repo
```

---

## Step 2 — Create your environment file

```bash
cp .env.example .env
```

The defaults work out of the box. No edits needed to get started.

> **Never commit `.env` to git.** It is already in `.gitignore`.

---

## Step 3 — Start Postgres

```bash
docker compose up -d postgres
docker compose ps   # wait until status shows "healthy"
```

The migrations in `db/migrations/` run automatically on first startup, creating the `staging` and `analytics` schemas plus all tables.

---

## Step 4 — Load sample data

```bash
cd app && npm install
npx ts-node src/index.ts seed
cd ..
```

This inserts a small set of Titanic rows so you have data to explore immediately, without needing a Kaggle account.

---

## Step 5 — Launch the web app

**Option A — Docker (one command, fully containerised)**
```bash
docker compose --profile web up --build
```
Wait ~60 seconds for images to build on first run.

**Option B — Local dev mode (hot reload)**
```bash
./dev.sh
```
This runs Postgres in Docker and the API + React app on your Mac with instant hot reload.

Then open:
- **Dashboard** → http://localhost:3000
- **REST API** → http://localhost:3001
- **Swagger docs** → http://localhost:3001/docs

---

## Step 6 — Explore the data

**In the browser:**
- Visit http://localhost:3000/titanic to see the data table and CRUD controls
- Visit http://localhost:3000/admin to browse the database and run SQL queries

**In the terminal (TypeScript CLI):**
```bash
cd app

npx ts-node src/index.ts ping              # verify DB connection
npx ts-node src/index.ts tables            # list all tables + row counts
npx ts-node src/index.ts titanic list      # view passengers
npx ts-node src/index.ts titanic summary   # survival rates by class + sex
npx ts-node src/index.ts query "SELECT * FROM analytics.titanic_survival_summary"
```

---

## What's running?

```
Your Mac
├── Docker Desktop
│   ├── poc_postgres (PostgreSQL 16, port 5432)
│   │   ├── staging.titanic     (5 sample rows)
│   │   └── analytics.titanic_survival_summary (view)
│   ├── poc_web_server (Fastify API, port 3001)    ← profile: web
│   └── poc_web_client (nginx + React, port 3000)  ← profile: web
└── Browser → http://localhost:3000
```

---

## Connect with a GUI database client (optional)

[TablePlus](https://tableplus.com) (free tier) or [DBeaver](https://dbeaver.io) (free):

```
Host:     localhost
Port:     5432
Database: poc_db
User:     poc_user
Password: poc_password
```

---

## Running the Kaggle data pipelines (optional)

To load real datasets (Titanic with 891 rows, NYC Taxi with 50k trips):

1. Create a Kaggle account at https://kaggle.com
2. Account → API → Create New Token → download `kaggle.json`
3. Place it at `~/.kaggle/kaggle.json`
4. Accept competition rules at:
   - https://www.kaggle.com/c/titanic
   - https://www.kaggle.com/c/new-york-city-taxi-fare-prediction

```bash
# Via Docker
docker compose --profile pipeline up pipeline_titanic
docker compose --profile pipeline up pipeline_nyc_taxi

# Or locally with Python
cd pipelines && pip install -r requirements.txt
POSTGRES_HOST=localhost python titanic/ingest.py
POSTGRES_HOST=localhost python nyc_taxi/ingest.py
```

After running, reload the dashboard to see live data and charts.

---

## Stopping and starting

```bash
# Stop everything (data is preserved)
docker compose down

# Start again later
docker compose up -d postgres
docker compose --profile web up

# Wipe the database and start completely fresh
docker compose down -v
docker compose up -d postgres
cd app && npx ts-node src/index.ts seed   # re-seed if desired
```

---

## Next steps

| I want to... | Go here |
|---|---|
| Understand how everything fits together | [Architecture Overview](../architecture/overview.md) |
| Understand the web app code | [Web App Guide](web-app.md) |
| Add a new dataset pipeline | [Adding a Pipeline](adding-a-pipeline.md) |
| See all REST API endpoints | [API Reference](../reference/api.md) |
| See all CLI commands | [CLI Reference](../reference/cli.md) |

---

## Troubleshooting

**`docker compose` says "no configuration file provided"**
Make sure you are in the repo root (the folder containing `docker-compose.yml`).

**Postgres stays in "starting" status**
Run `docker compose logs postgres` to see what went wrong. Commonly caused by a port 5432 conflict — check if you have a local Postgres running: `brew services list | grep postgres`.

**Port 5432 already in use**
Stop your local Postgres: `brew services stop postgresql@16`. Or change the port mapping in `docker-compose.yml` to `"5433:5432"` and update `POSTGRES_PORT=5433` in `.env`.

**`Cannot connect` from the CLI**
The CLI running on your Mac needs `POSTGRES_HOST=localhost`. Use `./dev.sh` or run `POSTGRES_HOST=localhost npx ts-node src/index.ts ping`.

**Web app builds but shows blank page**
Check `docker compose logs web_client` — usually a build error in the React code. Run `docker compose --profile web build web_client` to see the full output.

**`npx ts-node: command not found`**
Run `npm install` in the `app/` directory. TypeScript and ts-node are installed locally, not globally.
