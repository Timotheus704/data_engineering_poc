# CLAUDE.md

This file helps AI coding assistants (Claude, Copilot, Cursor, etc.) understand the repo structure, conventions, and key commands.

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

## Repo structure

```
poc-repo/
├── docker-compose.yml              # Orchestrates all services (postgres, app, web, pipelines)
├── dev.sh                          # One-command local dev startup (Postgres + API + React)
├── .env.example                    # Copy to .env — defaults work for local dev
│
├── db/
│   ├── migrations/                 # Numbered SQL DDL (run in order: 001_, 002_, ...)
│   └── seeds/                      # Sample DML for local dev without Kaggle
│
├── app/                            # TypeScript CLI application (Commander.js)
│   └── src/
│       ├── db/client.ts            # pg pool, query<T>(), withTransaction()
│       ├── db/types.ts             # Typed interfaces for every DB row
│       ├── queries/titanic.ts      # Typed query functions for Titanic dataset
│       ├── queries/nyc_taxi.ts     # Typed query functions for NYC Taxi dataset
│       ├── queries/utils.ts        # listTables(), pingDatabase(), runRawQuery()
│       └── index.ts                # CLI entrypoint (ping, tables, titanic, taxi, query, seed)
│
├── web/
│   ├── server/                     # Fastify REST API (TypeScript)
│   │   └── src/
│   │       ├── db.ts               # pg pool shared with routes
│   │       ├── index.ts            # Server bootstrap, plugin registration, Swagger
│   │       ├── plugins/db-plugin.ts
│   │       └── routes/
│   │           ├── health.ts       # GET /health
│   │           ├── titanic.ts      # Full CRUD: /api/titanic
│   │           ├── nyc_taxi.ts     # Full CRUD: /api/taxi
│   │           └── admin.ts        # /api/admin/tables, /api/admin/query, /api/admin/db-info
│   └── client/                     # React + Vite frontend
│       ├── nginx.conf              # Proxies /api → web_server container in Docker
│       ├── vite.config.ts          # Proxies /api → localhost:3001 in dev mode
│       └── src/
│           ├── lib/api.ts          # Typed fetch wrappers for all API endpoints
│           ├── App.tsx             # Router + sidebar layout
│           ├── components/
│           │   ├── DataTable.tsx   # Reusable paginated table with Edit/Delete actions
│           │   ├── Modal.tsx       # Accessible modal (Esc to close, click-outside)
│           │   └── StatCard.tsx    # Dashboard stat card
│           └── pages/
│               ├── Dashboard.tsx   # Stat cards + Recharts bar/line charts
│               ├── TitanicPage.tsx # Full CRUD UI for staging.titanic
│               ├── TaxiPage.tsx    # Full CRUD UI for staging.nyc_taxi
│               └── AdminPage.tsx   # Table browser + column inspector + SQL runner
│
├── pipelines/                      # Python ingestion pipelines
│   ├── db.py                       # Shared SQLAlchemy get_engine()
│   ├── titanic/ingest.py           # Download → clean → load → chart
│   ├── nyc_taxi/ingest.py          # Download → clean → load (50k rows) → chart
│   ├── Dockerfile                  # python:3.11-slim
│   └── requirements.txt
│
├── .github/workflows/
│   ├── db-migrate.yml              # CI: runs all migrations against a fresh Postgres
│   └── app-ci.yml                  # CI: tsc --noEmit + smoke tests (ping, tables)
│
├── reports/                        # Generated PNG charts from pipeline analysis
└── docs/                           # Full documentation (see docs/INDEX.md)
```

---

## Key commands

```bash
# ── Infrastructure ────────────────────────────────────────────────────────────
docker compose up -d postgres                        # start Postgres
docker compose --profile web up --build              # start full web stack (Docker)
docker compose --profile pipeline up pipeline_titanic

# ── Local dev (hot reload) ────────────────────────────────────────────────────
./dev.sh                                             # starts Postgres + API + React

# ── TypeScript CLI ────────────────────────────────────────────────────────────
cd app && npm install
npx ts-node src/index.ts ping
npx ts-node src/index.ts seed
npx ts-node src/index.ts tables
npx ts-node src/index.ts titanic list
npx ts-node src/index.ts titanic summary
npx ts-node src/index.ts taxi list
npx ts-node src/index.ts query "SELECT COUNT(*) FROM staging.titanic"

# ── Web server (standalone) ───────────────────────────────────────────────────
cd web/server && npm install && npm run dev          # API at :3001, docs at :3001/docs

# ── React client (standalone) ─────────────────────────────────────────────────
cd web/client && npm install && npm run dev          # UI at :3000

# ── Migrations (manual) ───────────────────────────────────────────────────────
for f in db/migrations/*.sql; do
  PGPASSWORD=poc_password psql -h localhost -U poc_user -d poc_db -f "$f"
done

# ── Pipelines (local Python) ─────────────────────────────────────────────────
cd pipelines && pip install -r requirements.txt
POSTGRES_HOST=localhost python titanic/ingest.py
POSTGRES_HOST=localhost python nyc_taxi/ingest.py
```

---

## Ports

| Service | Port | Notes |
|---|---|---|
| Postgres | 5432 | Always on; use `poc_user` / `poc_password` / `poc_db` |
| Fastify API | 3001 | REST API; Swagger at `/docs` |
| React UI | 3000 | In Docker: served by nginx; in dev: Vite dev server |

---

## Conventions

### SQL
- Migrations are numbered: `001_`, `002_`, etc. Never rename or reorder them.
- Raw ingested data lives in the `staging` schema. Transformed/aggregated in `analytics`.
- All tables include `loaded_at TIMESTAMPTZ DEFAULT NOW()`.
- Use `IF NOT EXISTS` / `CREATE OR REPLACE` so migrations are safe to re-run.

### TypeScript (CLI + API)
- Strict mode on. No `any` types anywhere.
- Credentials always come from environment variables via `dotenv`. Never hardcoded.
- Query functions return typed interfaces, never raw `QueryResult`.
- New datasets get their own route file in `web/server/src/routes/` and query file in `app/src/queries/`.
- API responses always use `{ data: ... }` wrapper for collections, `{ data: ..., message: ... }` for mutations.

### React
- No CSS framework — all styles are inline with design tokens (dark theme: `#0f1117` bg, `#161b27` card, `#1e2a3a` border).
- Components in `src/components/` are generic and reusable. Page-specific logic stays in `src/pages/`.
- All API calls go through `src/lib/api.ts` — never raw `fetch` in page components.

### Python
- One `ingest.py` per dataset in its own subfolder under `pipelines/`.
- Always `TRUNCATE` before inserting (idempotent runs).
- Use `db.get_engine()` — never hardcode credentials.

---

## What NOT to do

- Never commit `.env` or `kaggle.json`
- Never hardcode DB credentials in any source file
- Never use `any` in TypeScript
- Never rename or reorder migration files
- Never write non-SELECT queries through `runRawQuery()` or `/api/admin/query`
- Never put business logic directly in React page components — use `src/lib/api.ts`
