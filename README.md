# PoC Repo — Data Engineering & TypeScript Demo

A proof-of-concept monorepo demonstrating Postgres in Docker, CI/CD for SQL migrations, Kaggle data pipelines, a TypeScript CLI, and data analysis — all runnable locally on macOS.

---

## Prerequisites

Install these before starting:

| Tool | Version | Install |
|---|---|---|
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop |
| Node.js | 20+ | `brew install node` |
| Python | 3.11+ | `brew install python@3.11` |
| psql (optional) | Any | `brew install libpq && brew link --force libpq` |

---

## 1. Clone and configure

```bash
git clone <your-repo-url>
cd poc-repo

# Create your local environment file
cp .env.example .env
# The defaults in .env.example work out of the box for local dev
```

---

## 2. Start Postgres

```bash
docker compose up -d postgres

# Verify it's healthy
docker compose ps
```

Postgres is now running on `localhost:5432`. Connect with any SQL client (TablePlus, DBeaver, or psql):

```
Host:     localhost
Port:     5432
User:     poc_user
Password: poc_password
Database: poc_db
```

---

## 3. Run database migrations

The `docker-compose.yml` automatically mounts `db/migrations/` into the Postgres container's init directory, so migrations run on first start.

To re-run them manually (e.g. after wiping the volume):

```bash
# Using psql (if installed)
for f in db/migrations/*.sql; do
  echo "Running $f"
  PGPASSWORD=poc_password psql -h localhost -U poc_user -d poc_db -f "$f"
done
```

---

## 4. Set up and run the TypeScript app

```bash
cd app
npm install

# Ping the database
npx ts-node src/index.ts ping

# List all tables
npx ts-node src/index.ts tables

# Load the seed data (small sample rows)
npx ts-node src/index.ts seed

# Query Titanic data
npx ts-node src/index.ts titanic list
npx ts-node src/index.ts titanic list --limit 5
npx ts-node src/index.ts titanic summary

# Run a raw SQL query
npx ts-node src/index.ts query "SELECT * FROM analytics.titanic_survival_summary"
```

---

## 5. Run the data pipelines (optional — requires Kaggle account)

1. Create a Kaggle account at https://kaggle.com
2. Go to Account → API → Create New Token → download `kaggle.json`
3. Place it at `~/.kaggle/kaggle.json`
4. Accept the dataset competition rules on Kaggle.com for both:
   - https://www.kaggle.com/c/titanic
   - https://www.kaggle.com/c/new-york-city-taxi-fare-prediction

```bash
# From the repo root
docker compose --profile pipeline up pipeline_titanic
docker compose --profile pipeline up pipeline_nyc_taxi

# Or run locally with Python (faster for dev)
cd pipelines
pip install -r requirements.txt

# Set DB host to localhost for local Python (not the Docker network)
export POSTGRES_HOST=localhost
python titanic/ingest.py
python nyc_taxi/ingest.py
```

Analysis charts are saved to `reports/`.

---

## 6. Explore the analytics views

```bash
cd app

# NYC Taxi hourly breakdown
npx ts-node src/index.ts taxi hourly

# Titanic survival by class and sex
npx ts-node src/index.ts titanic summary
```

---

## Useful Docker commands

```bash
# View logs
docker compose logs -f postgres

# Stop everything
docker compose down

# Wipe the database volume and start fresh
docker compose down -v
docker compose up -d postgres
```

---

## Documentation

Comprehensive documentation lives in the `docs/` folder. Start at **[docs/INDEX.md](./docs/INDEX.md)**.

| I want to... | Document |
|---|---|
| Understand the system design | [Architecture Overview](docs/architecture/overview.md) |
| Learn how the database is structured | [Database Design](docs/architecture/database-design.md) |
| Understand Docker usage | [Docker & Containers](docs/architecture/docker.md) |
| Learn how CI/CD works | [CI/CD Pipeline](docs/architecture/cicd.md) |
| Add a new dataset | [Adding a Pipeline](docs/guides/adding-a-pipeline.md) |
| Write a database migration | [Migrations Guide](docs/guides/migrations.md) |
| Work on the TypeScript app | [TypeScript App Guide](docs/guides/typescript-app.md) |
| See all CLI commands | [CLI Reference](docs/reference/cli.md) |

## Project structure

See [CLAUDE.md](./CLAUDE.md) for AI assistant context, or [docs/reference/project-structure.md](docs/reference/project-structure.md) for the full annotated file tree.
