# AGENTS.md

This file is the working guide for AI coding assistants touching this repo. Use it to move quickly, make changes in the right layer, and avoid breaking the proof-of-concept story.

---

## Mission

This repo is a locally hostable data platform proof of concept. It should read as senior-level data engineering work, not just a full-stack demo with data in it.

Core signal:

- Postgres in Docker with ordered SQL migrations
- Python ingestion pipelines for Kaggle datasets
- Incremental loading with persisted watermarks for timestamped datasets
- Airflow orchestration with retries, backfills, SLA callback, and run metadata
- Great Expectations data quality gates before downstream transforms
- dbt transformation layer with sources, refs, tests, and docs
- TypeScript CLI for data exploration
- Fastify REST API with CRUD and Swagger
- React dashboard with charts, paginated tables, CRUD modals, and admin SQL panel
- GitHub Actions for migration and TypeScript checks

When making changes, preserve that layered architecture. Prefer production-shaped patterns over quick demo shortcuts.

---

## First Checks

Before editing:

```bash
git status --short
rg --files
```

Read the files in the area you are changing before proposing or applying edits. Do not revert unrelated local changes.

Fast orientation:

```bash
sed -n '1,220p' README.md
sed -n '1,220p' docs/INDEX.md
sed -n '1,240p' docker-compose.yml
```

Use `rg` for searches. Avoid slow broad scans through dependency/build directories.

---

## What this repo is

A proof-of-concept monorepo demonstrating a complete, locally-hostable data platform:

- **Postgres** running in Docker with schema migrations via numbered SQL scripts
- **CI/CD** via GitHub Actions for DDL/DML deployment and TypeScript build checks
- **Python data pipelines** that pull from Kaggle and load into Postgres
- **TypeScript CLI** (`app/`) for terminal-based data exploration
- **Fastify REST API** (`web/server/`) with full CRUD endpoints and Swagger docs
- **React dashboard** (`web/client/`) with charts, paginated tables, CRUD modals, and an admin SQL panel
- **Data analysis layer** with analytics views in Postgres

---

## Repo Map

```text
.
├── docker-compose.yml
├── dev.sh
├── .env.example
├── db/
│   ├── migrations/                 # Ordered SQL DDL, never rename/reorder
│   └── seeds/                      # Local sample data
├── pipelines/
│   ├── db.py                       # Shared SQLAlchemy engine
│   ├── titanic/ingest.py
│   └── nyc_taxi/ingest.py
├── orchestration/
│   ├── airflow/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── dags/data_platform_dag.py
│   └── great_expectations/
│       ├── great_expectations.yml
│       ├── expectations/
│       └── validate.py
├── dbt/
│   ├── dbt_project.yml
│   ├── profiles.yml
│   ├── macros/
│   └── models/
├── app/                            # TypeScript CLI
├── web/
│   ├── server/                     # Fastify API
│   └── client/                     # React/Vite UI
├── docs/
└── .github/workflows/
```

Generated/local-only paths are ignored:

- `reports/*.png`
- `orchestration/airflow/logs/`
- `orchestration/great_expectations/uncommitted/`
- `dbt/target/`, `dbt/dbt_packages/`, `dbt/logs/`
- `.env`, `.kaggle/`, `kaggle.json`, `data/`

---

## Key Commands

Infrastructure:

```bash
docker compose up -d postgres
docker compose ps
docker compose logs -f postgres
```

Web app:

```bash
./dev.sh
docker compose --profile web up --build
```

Pipelines:

```bash
docker compose --profile pipeline up pipeline_titanic
docker compose --profile pipeline up pipeline_nyc_taxi

cd pipelines
POSTGRES_HOST=localhost python titanic/ingest.py
POSTGRES_HOST=localhost python nyc_taxi/ingest.py
POSTGRES_HOST=localhost python nyc_taxi/ingest.py --mode incremental
```

Airflow/dbt/quality:

```bash
docker compose --profile orchestration up --build
docker compose --profile transform run --rm dbt run --profiles-dir .
docker compose --profile transform run --rm dbt test --profiles-dir .
docker compose --profile quality run --rm great_expectations python orchestration/great_expectations/validate.py titanic_staging
docker compose --profile quality run --rm great_expectations python orchestration/great_expectations/validate.py nyc_taxi_staging
```

TypeScript:

```bash
cd app && npm install && npm run build
cd web/server && npm install && npm run build
cd web/client && npm install && npm run build
```

CLI smoke checks:

```bash
cd app
npx ts-node src/index.ts ping
npx ts-node src/index.ts tables
npx ts-node src/index.ts titanic summary
npx ts-node src/index.ts taxi hourly
```

Manual migrations:

```bash
for f in db/migrations/*.sql; do
  PGPASSWORD=poc_password psql -h localhost -U poc_user -d poc_db -f "$f"
done
```

---

## Ports

| Service | Port | Notes |
|---|---:|---|
| Postgres | 5432 | `poc_user` / `poc_password` / `poc_db` |
| Fastify API | 3001 | Swagger at `/docs` |
| React UI | 3000 | Vite in dev, nginx in Docker |
| Airflow | 8080 | Default local user/password from `.env.example` |

---

## Data Engineering Conventions

### SQL and Postgres

- Migrations are append-only and numbered `001_`, `002_`, etc.
- Never rename, reorder, or edit old migrations unless explicitly asked.
- Use `IF NOT EXISTS` and `CREATE OR REPLACE` where practical.
- Raw ingested data belongs in `staging`.
- dbt-owned transformed objects belong in `analytics` or dbt staging schemas.
- Operational metadata belongs in `orchestration`.
- Incremental state belongs in `orchestration.pipeline_watermarks`.
- Tables should include `loaded_at TIMESTAMPTZ DEFAULT NOW()` when they store loaded data.
- Admin query surfaces must stay read-only. Do not allow non-SELECT SQL through `runRawQuery()` or `/api/admin/query`.

### Airflow

- DAGs live in `orchestration/airflow/dags/`.
- Prefer calling existing pipeline/dbt/GX entrypoints instead of duplicating business logic inside DAG files.
- Keep DAGs deterministic and backfillable: avoid wall-clock-only logic unless it is explicitly parameterized.
- Use retries and clear task dependencies for new tasks.
- If adding new pipeline tasks, update `orchestration.pipeline_runs` metadata behavior or explain why it does not apply.

### dbt

- dbt project lives in `dbt/`.
- Use `source()` for raw tables and `ref()` for model dependencies.
- Add tests in `schema.yml` for new sources/models.
- Keep analytics SQL in dbt models, not new migration views, unless the object truly must exist before dbt runs.
- Numeric `accepted_values` tests in Postgres should use `quote: false`.
- The project uses `macros/generate_schema_name.sql` so custom schemas land exactly where configured.

### Great Expectations

- Expectations live in `orchestration/great_expectations/expectations/`.
- `validate.py` is the stable entrypoint for Airflow and Docker Compose.
- Validation should fail closed: return non-zero on data contract failures.
- Add checks that would matter in an interview: row count ranges, uniqueness, nullability, accepted values, positive amounts/distances, timestamp presence.

### Python Pipelines

- One dataset per folder under `pipelines/`.
- Use `pipelines/db.py:get_engine()` for all database access.
- Never hardcode credentials.
- Timestamped datasets should support incremental loading with explicit watermarks and idempotent writes.
- Keep full-refresh mode available for local resets and reproducible demos.
- Keep cleaning logic close to ingestion unless it is a true transformation, in which case prefer dbt.

### TypeScript CLI and API

- Strict TypeScript. Do not use `any`.
- DB credentials come from environment variables via `dotenv`.
- Query functions return typed interfaces, not raw `QueryResult`.
- New datasets get:
  - `app/src/queries/<dataset>.ts`
  - types in `app/src/db/types.ts`
  - API route in `web/server/src/routes/`
  - client wrappers in `web/client/src/lib/api.ts`
- API collections use `{ data: ... }`.
- Mutations use `{ data: ..., message: ... }`.

### React

- No CSS framework. Styles are inline and token-driven.
- Existing dark theme tokens: `#0f1117` background, `#161b27` cards, `#1e2a3a` borders.
- Generic components live in `web/client/src/components/`.
- Page-specific state and workflow logic stays in `web/client/src/pages/`.
- All API calls go through `web/client/src/lib/api.ts`; do not call raw `fetch` in page components.

---

## Efficient Change Patterns

For a new dataset:

1. Add a migration for `staging.<dataset>`.
2. Add `pipelines/<dataset>/ingest.py`.
3. Add dbt source, staging model, analytics model, and tests.
4. Add Great Expectations suite and wire it into `validate.py`.
5. Add Airflow tasks and dependencies.
6. Add CLI query functions/types if needed.
7. Add API route and React page only if the dataset is user-facing.
8. Update docs and README commands.

For a new quality rule:

1. Add the GE expectation for runtime gating.
2. Add the dbt test if it is also a model contract.
3. Verify the failure mode is non-zero in Docker/Airflow.
4. Document why the rule exists if it is domain-specific.

For a new dashboard/API feature:

1. Add/adjust typed API query on the server.
2. Add typed client wrapper in `web/client/src/lib/api.ts`.
3. Keep reusable UI in `components/`.
4. Verify API build and client build.

---

## Verification Expectations

Run the smallest meaningful checks for your change.

Common checks:

```bash
docker compose config
docker compose --profile orchestration --profile transform --profile quality config
python3 -m py_compile orchestration/airflow/dags/data_platform_dag.py orchestration/great_expectations/validate.py
```

For dbt changes:

```bash
docker compose --profile transform run --rm dbt parse --profiles-dir .
docker compose --profile transform run --rm dbt test --profiles-dir .
```

For TypeScript changes:

```bash
cd app && npm run build
cd web/server && npm run build
cd web/client && npm run build
```

For SQL changes:

```bash
docker compose up -d postgres
PGPASSWORD=poc_password psql -h localhost -U poc_user -d poc_db -f db/migrations/<new_migration>.sql
```

If a check needs network access or large Docker image pulls, say so clearly and run config/static checks locally first.

---

## Do Not Do

- Do not commit `.env`, `kaggle.json`, generated data files, dbt artifacts, Airflow logs, or GE validation outputs.
- Do not hardcode database credentials in source files.
- Do not use `any` in TypeScript.
- Do not bypass `src/lib/api.ts` from React page components.
- Do not put transformation lineage into ad hoc scripts when dbt is the right layer.
- Do not silently weaken data quality checks to make a pipeline pass.
- Do not add non-SELECT admin SQL execution.
- Do not run destructive Docker or git cleanup commands unless explicitly requested.

---

## Documentation

Keep docs in sync when changing behavior:

- Main entry: `docs/INDEX.md`
- Quick start: `docs/guides/quick-start.md`
- Orchestration/dbt/GX: `docs/guides/orchestration.md`
- Database design: `docs/architecture/database-design.md`
- Docker architecture: `docs/architecture/docker.md`
- API reference: `docs/reference/api.md`
- Environment variables: `docs/reference/environment-variables.md`

When in doubt, update the smallest relevant doc and add a short note to `README.md` only for top-level workflows.
