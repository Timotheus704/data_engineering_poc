# Quick Start Guide

Get the project running on your Mac in under 10 minutes. No prior experience required.

---

## What you'll have at the end

- A Postgres database running in Docker
- Sample data loaded and queryable
- The TypeScript CLI working against live data

---

## Prerequisites

You need two things installed: **Docker Desktop** and **Node.js**.

### Install Docker Desktop

1. Go to https://www.docker.com/products/docker-desktop/
2. Download the Mac version (choose Apple Silicon if your Mac has an M-series chip, Intel otherwise)
3. Open the downloaded `.dmg` file and drag Docker to Applications
4. Open Docker Desktop from Applications and wait for it to say "Docker Desktop is running" in the menu bar

**Verify it worked:**
```bash
docker --version
# Should print something like: Docker version 25.x.x
```

### Install Node.js

The easiest way is with Homebrew. If you don't have Homebrew:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then install Node:
```bash
brew install node
node --version
# Should print v20.x.x or higher
```

---

## Step 1 — Get the code

```bash
# If you have a git repo URL:
git clone <your-repo-url>
cd poc-repo

# Or if you downloaded the zip:
unzip poc-repo.zip
cd poc-repo
```

---

## Step 2 — Create your environment file

The project uses a `.env` file to store database credentials. The defaults work out of the box for local development.

```bash
cp .env.example .env
```

Your `.env` file will look like this (no changes needed to get started):
```
POSTGRES_USER=poc_user
POSTGRES_PASSWORD=poc_password
POSTGRES_DB=poc_db
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
```

> **Never commit `.env` to git.** It is already in `.gitignore`.

---

## Step 3 — Start the database

```bash
docker compose up -d postgres
```

Docker will download the Postgres image (about 85MB, one-time only) and start the container. The migrations in `db/migrations/` run automatically on first startup, creating the schemas and tables.

Check that it is healthy:
```bash
docker compose ps
```

You should see `poc_postgres` with status `healthy`. If it says `starting`, wait 10 seconds and run it again.

---

## Step 4 — Install TypeScript app dependencies

```bash
cd app
npm install
```

This downloads the Node.js packages listed in `package.json` into a local `node_modules/` folder. It only needs to run once (or again after `package.json` changes).

---

## Step 5 — Test the database connection

```bash
# Make sure you are in the app/ directory
npx ts-node src/index.ts ping
```

You should see:
```
✅ Connected to: PostgreSQL 16.x on x86_64-pc-linux-musl, compiled by...
```

If you see a connection error, make sure the Postgres container is healthy (`docker compose ps`).

---

## Step 6 — Load sample data

```bash
npx ts-node src/index.ts seed
```

This runs the seed SQL files in `db/seeds/` which insert a small set of Titanic rows so you have something to query immediately (without needing a Kaggle account).

---

## Step 7 — Explore the data

```bash
# List all tables and their row counts
npx ts-node src/index.ts tables

# View Titanic passengers
npx ts-node src/index.ts titanic list

# Survival summary by class and sex
npx ts-node src/index.ts titanic summary

# Run a raw SQL query
npx ts-node src/index.ts query "SELECT * FROM analytics.titanic_survival_summary"
```

---

## What's running?

At this point you have:

```
Your Mac
├── Docker Desktop
│   └── poc_postgres container (Postgres 16)
│       ├── staging.titanic   (5 sample rows from seed)
│       └── analytics.titanic_survival_summary (view)
└── Terminal session
    └── npx ts-node → connects to localhost:5432
```

---

## Connecting with a GUI (optional)

If you prefer a visual database client, use **TablePlus** (free tier available at https://tableplus.com):

1. Open TablePlus → New Connection → PostgreSQL
2. Fill in:
   - Host: `localhost`
   - Port: `5432`
   - Database: `poc_db`
   - User: `poc_user`
   - Password: `poc_password`
3. Click Test → Connect

---

## Stopping and starting

```bash
# Stop (data is preserved)
docker compose down

# Start again later
docker compose up -d postgres

# Fresh start — deletes all data and recreates from migrations
docker compose down -v
docker compose up -d postgres
```

---

## Next steps

| I want to... | Go here |
|---|---|
| Understand what all the code does | [Architecture Overview](../architecture/overview.md) |
| Load real Kaggle data | [Adding a Pipeline](adding-a-pipeline.md) |
| Add a new table | [Database Migrations Guide](migrations.md) |
| See all CLI commands | [CLI Reference](../reference/cli.md) |
| Work on the TypeScript app | [TypeScript App Guide](typescript-app.md) |

---

## Troubleshooting

**`docker compose` says "no configuration file provided"**
Make sure you are in the root of the repo (the folder that contains `docker-compose.yml`).

**`Cannot connect to Postgres`**
Run `docker compose ps` and check the status column. If it says `starting`, wait a moment. If it says `exited`, run `docker compose logs postgres` to see what went wrong.

**`npx ts-node: command not found`**
Make sure you ran `npm install` in the `app/` directory. TypeScript and ts-node are installed locally, not globally.

**`connection refused` on port 5432**
Another Postgres instance may already be using port 5432. Stop it with `brew services stop postgresql` or change the port in `docker-compose.yml` to `5433:5432` and update your `.env` accordingly.
