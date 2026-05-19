# Architecture Overview

This document explains the big picture of how all the pieces in this repo fit together. No prior experience with any of the tools is assumed.

---

## What this project is

This is a **proof-of-concept data platform** — a working demonstration of a modern, full-stack data engineering system in a single repository. It covers:

- A **Postgres database** running in Docker with two schemas: `staging` (raw data) and `analytics` (aggregated views)
- **SQL migration scripts** deployed automatically by CI/CD
- **Python data pipelines** that fetch real datasets from Kaggle and load them into the database
- A **TypeScript CLI application** for terminal-based data exploration
- A **Fastify REST API** with full CRUD endpoints and auto-generated Swagger documentation
- A **React dashboard** with charts, paginated data tables, CRUD modals, and an admin SQL panel
- An **nginx reverse proxy** that serves the React app and routes API requests in Docker

The entire system runs on your laptop and is deployable to any environment with Docker.

---

## System diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Your machine / CI runner                           │
│                                                                              │
│  Browser          TypeScript CLI      Python Pipelines    GitHub Actions     │
│  localhost:3000   (app/)              (pipelines/)        (.github/)         │
│      │                │                    │                   │             │
│      │ HTTP           │ SQL queries        │ Bulk INSERT       │ Migrations  │
│      ▼                │                    │                   │             │
│  ┌──────────────┐     │                    │                   │             │
│  │  nginx       │     │                    │                   │             │
│  │  (Docker)    │     │                    │                   │             │
│  │  port 3000   │     │                    │                   │             │
│  └──────┬───────┘     │                    │                   │             │
│   /api/* │             │                    │                   │             │
│         ▼             ▼                    ▼                   ▼             │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                    Fastify REST API (web/server/)                      │  │
│  │                         localhost:3001                                 │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
│                                   │ pg pool                                  │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                     PostgreSQL 16 (Docker, port 5432)                  │  │
│  │                                                                        │  │
│  │   staging schema                    analytics schema                   │  │
│  │   ├── titanic             ────►     ├── titanic_survival_summary (view) │  │
│  │   └── nyc_taxi            ────►     └── nyc_taxi_hourly (view)          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                              Kaggle API (external)
```

---

## The seven layers

### 1. Database layer — `db/`

The foundation. A Postgres database with two schemas:

- **`staging`** — raw data exactly as ingested. Nothing is cleaned or transformed here.
- **`analytics`** — SQL views over staging data that produce aggregations ready for querying.

Schema changes are made through numbered migration files that always run in order. Anyone can recreate the exact database state by running the migrations in sequence.

### 2. Container layer — `docker-compose.yml`

Docker Compose ties all services together. It uses **profiles** to separate concerns:

| Profile | Services started |
|---|---|
| *(none)* | `postgres`, `app` (CLI) |
| `--profile web` | `postgres`, `web_server`, `web_client` |
| `--profile pipeline` | `postgres`, `pipeline_titanic` or `pipeline_nyc_taxi` |

### 3. Pipeline layer — `pipelines/`

Python scripts that download datasets from Kaggle, clean the data, and bulk-load into the `staging` schema. Each dataset has its own subfolder and `ingest.py`. Pipelines are idempotent — they truncate before re-inserting so running them twice is safe.

### 4. CLI layer — `app/`

A TypeScript command-line app that connects directly to Postgres and presents data in a human-readable way. Useful for quick data exploration and scripting without starting the full web stack. Uses a typed query layer with `pg` connection pooling.

### 5. API layer — `web/server/`

A **Fastify** REST API server (TypeScript) that exposes every dataset over HTTP with full CRUD operations. It connects to the same Postgres instance using its own connection pool. Features:
- Full CRUD for `staging.titanic` and `staging.nyc_taxi`
- Analytics endpoints that query the `analytics` schema views
- Admin endpoints for table introspection and safe SQL execution
- Auto-generated Swagger / OpenAPI documentation at `/docs`

### 6. Frontend layer — `web/client/`

A **React + Vite** single-page application. It communicates exclusively with the Fastify API — it never connects to Postgres directly. Features:
- Dashboard with live stat cards and Recharts charts
- Paginated data tables with Edit and Delete actions per row
- Modal forms for creating and editing records
- Admin panel: table browser, column inspector, SQL runner

### 7. Reverse proxy — nginx (`web/client/nginx.conf`)

In the Docker setup, nginx serves the built React app as static files and proxies all `/api/*` requests to the `web_server` container. This means the browser only ever talks to one origin (`localhost:3000`), avoiding CORS issues and mirroring a real production deployment pattern.

In dev mode, Vite's built-in proxy server does the same job.

---

## Data flow, end to end

```
Kaggle API
    │  kaggle download
    ▼
CSV file (container filesystem)
    │  pandas read_csv()
    ▼
Python DataFrame — clean, rename columns, drop bad rows
    │  df.to_sql() → TRUNCATE + bulk INSERT
    ▼
staging.titanic (Postgres table)
    │  SQL VIEW
    ▼
analytics.titanic_survival_summary
    │  GET /api/titanic/summary (Fastify)
    ▼
JSON response
    │  fetch() in src/lib/api.ts
    ▼
React component state → rendered chart in browser
```

---

## Key design principles

**Everything is reproducible.** Migrations are numbered and sequential. Pipelines truncate before inserting. Images are built from versioned Dockerfiles. Anyone can clone and reach the same state.

**Secrets never live in source code.** All credentials come from `.env` files or CI secrets. The `.gitignore` prevents `.env` from being committed. Kaggle credentials are mounted read-only at runtime, never baked into images.

**Raw and clean data are separated.** The `staging` schema holds data exactly as ingested. The `analytics` schema holds derived data. This makes it safe to re-run transformations without re-fetching source data.

**The API is the single source of truth for the UI.** The React frontend never queries Postgres directly — all data access goes through the Fastify API. This decouples the UI from the database and makes the API independently testable.

**Docker profiles keep the startup simple.** You don't start pipelines every time you start the app. Services are grouped by intent and started only when needed.

**CI proves the system works.** Every push touching migrations or the TypeScript app runs a full integration test against a real Postgres container. If CI passes, the core system works.

---

## Technology choices at a glance

| Component | Technology | Why |
|---|---|---|
| Database | PostgreSQL 16 | Industry standard, powerful, open-source |
| Containerisation | Docker + Compose | Portable, reproducible, no local installs needed |
| Migrations | Raw SQL files | Simple, readable, no framework lock-in |
| Data pipelines | Python + pandas | Dominant language for data work |
| CLI | TypeScript + Node + Commander | Type safety, same language as the API |
| REST API | Fastify (TypeScript) | Fast, schema-first, excellent Swagger integration |
| Frontend | React + Vite | Component model, fast dev server, wide ecosystem |
| Reverse proxy | nginx (Alpine) | Production-grade, tiny image, trivial config |
| CI/CD | GitHub Actions | Free, integrated, service containers supported |

See the [Architecture Decision Records](../decisions/) for the reasoning behind each choice.
