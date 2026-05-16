# CLAUDE.md

This file helps AI coding assistants understand the repo structure, conventions, and key commands.

## What this repo is

A proof-of-concept monorepo demonstrating:
- Postgres running in Docker with schema migrations via SQL scripts
- CI/CD via GitHub Actions for DDL/DML deployment
- Python data pipeline containers that pull from Kaggle and load into Postgres
- A TypeScript CLI application that queries the Postgres database
- Data analysis layer with analytics views and reports

## Repo structure

```
poc-repo/
├── docker-compose.yml          # Orchestrates all services
├── .env.example                # Copy to .env and fill in
├── db/
│   ├── migrations/             # Numbered SQL DDL files (run in order)
│   └── seeds/                  # Sample DML for local dev
├── app/                        # TypeScript CLI application
│   ├── src/
│   │   ├── db/                 # DB client and types
│   │   ├── queries/            # Typed query functions per dataset
│   │   └── index.ts            # CLI entrypoint (commander)
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── pipelines/                  # Python ingestion pipelines
│   ├── db.py                   # Shared SQLAlchemy engine
│   ├── titanic/ingest.py
│   ├── nyc_taxi/ingest.py
│   ├── Dockerfile
│   └── requirements.txt
├── .github/workflows/          # CI/CD
│   ├── db-migrate.yml
│   └── app-ci.yml
├── reports/                    # Generated charts and markdown reports
└── ai-config/                  # Additional AI assistant configs
```

## Key commands

```bash
# Start Postgres
docker compose up -d postgres

# Run all DB migrations manually
for f in db/migrations/*.sql; do psql $DATABASE_URL -f "$f"; done

# TypeScript app (local, requires Node 20)
cd app && npm install
npx ts-node src/index.ts ping
npx ts-node src/index.ts tables
npx ts-node src/index.ts titanic list
npx ts-node src/index.ts titanic summary
npx ts-node src/index.ts taxi list
npx ts-node src/index.ts query "SELECT COUNT(*) FROM staging.titanic"

# Run a pipeline (requires Kaggle credentials at ~/.kaggle/kaggle.json)
docker compose --profile pipeline up pipeline_titanic
docker compose --profile pipeline up pipeline_nyc_taxi
```

## Conventions

### SQL
- Migrations are numbered: `001_`, `002_`, etc. Never rename or reorder them.
- Raw ingested data lives in the `staging` schema.
- Cleaned/aggregated data lives in the `analytics` schema.
- All tables get `loaded_at TIMESTAMPTZ DEFAULT NOW()`.

### TypeScript
- Strict mode is on. No `any` types.
- DB connection config always comes from environment variables via `dotenv`.
- Query functions return typed interfaces, never raw `QueryResult`.
- New datasets get their own file in `app/src/queries/`.

### Python
- One `ingest.py` per dataset in its own subfolder under `pipelines/`.
- Always truncate before re-inserting (idempotent runs).
- Use `db.get_engine()` for the SQLAlchemy connection — never hardcode credentials.

## What NOT to do

- Never commit `.env` or `kaggle.json`
- Never hardcode DB credentials anywhere in source
- Never use `any` in TypeScript
- Never rename or reorder migration files
- Never write non-SELECT queries in `runRawQuery()`
