# Architecture Overview

This document explains the big picture of how all the pieces in this repo fit together. No prior experience with any of the tools is assumed.

---

## What this project is

This is a **proof-of-concept data platform** — a working demonstration that shows how a modern data engineering stack fits together in a single repository. It covers:

- A **Postgres database** running in Docker
- **SQL migration scripts** deployed automatically by CI/CD
- **Data pipelines** that fetch real datasets from Kaggle and load them into the database
- A **TypeScript CLI application** that queries and explores the data
- An **analytics layer** of SQL views that transform raw data into meaningful summaries

The entire system runs on your laptop and is deployable to any environment with Docker.

---

## System diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your machine / CI                        │
│                                                                 │
│   ┌──────────────┐    ┌──────────────┐    ┌─────────────────┐  │
│   │  TypeScript  │    │   Python     │    │  GitHub Actions │  │
│   │  CLI App     │    │  Pipelines   │    │  CI/CD          │  │
│   │  (app/)      │    │  (pipelines/)│    │  (.github/)     │  │
│   └──────┬───────┘    └──────┬───────┘    └────────┬────────┘  │
│          │                   │                     │            │
│          │   SQL queries     │   Bulk inserts      │ Migrations │
│          ▼                   ▼                     ▼            │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │                  PostgreSQL (Docker)                     │  │
│   │                                                          │  │
│   │   ┌─────────────────┐      ┌──────────────────────────┐ │  │
│   │   │  staging schema │      │   analytics schema       │ │  │
│   │   │                 │      │                          │ │  │
│   │   │  titanic        │─────▶│  titanic_survival_summary│ │  │
│   │   │  nyc_taxi       │─────▶│  nyc_taxi_hourly         │ │  │
│   │   └─────────────────┘      └──────────────────────────┘ │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Data source
                              ▼
                     ┌─────────────────┐
                     │  Kaggle API     │
                     │  (external)     │
                     └─────────────────┘
```

---

## The five layers

### 1. Database layer — `db/`

The foundation. A Postgres database with two schemas:

- **`staging`** — raw data, exactly as ingested. Nothing is cleaned or transformed here.
- **`analytics`** — views and aggregations over staging data, ready for reporting and querying.

Schema changes are made through numbered SQL migration files that run in order. This means the database state is always reproducible — anyone can recreate it from scratch by running the migrations in sequence.

### 2. Container layer — `docker-compose.yml`

Docker Compose ties all the services together. It defines:

- The Postgres server and how to start it
- The TypeScript app container
- The Python pipeline containers (started on demand with `--profile pipeline`)

Every service is connected through a shared Docker network, so they can talk to each other by service name (e.g. the app connects to Postgres at hostname `postgres`).

### 3. Pipeline layer — `pipelines/`

Python scripts that fetch datasets from Kaggle, clean the data, and bulk-load it into the staging schema. Each dataset has its own subfolder and `ingest.py` script. Pipelines are idempotent — running them twice produces the same result as running them once (they truncate before re-inserting).

### 4. Application layer — `app/`

A TypeScript CLI application that reads from the database and presents data in a human-readable way. It is also the layer that a web API or UI would be built on top of. The app uses a typed query layer, meaning every result from the database is checked against a known TypeScript interface at compile time.

### 5. CI/CD layer — `.github/workflows/`

GitHub Actions workflows that run automatically when code is pushed. They:

- Spin up a real Postgres container in the CI environment
- Run all SQL migrations against it
- Run the TypeScript build check and app smoke tests

This means broken migrations or TypeScript errors are caught before they ever reach a deployed environment.

---

## Data flow, end to end

Here is what happens from raw Kaggle data to a TypeScript query result:

```
Kaggle API
    │
    │  kaggle competitions download
    ▼
CSV file (local or container filesystem)
    │
    │  pandas read_csv()
    ▼
Python DataFrame (in memory)
    │
    │  clean: rename columns, drop nulls, fix types
    ▼
Cleaned DataFrame
    │
    │  df.to_sql() → TRUNCATE + INSERT
    ▼
staging.titanic (Postgres table)
    │
    │  SQL VIEW (analytics.titanic_survival_summary)
    ▼
analytics result rows
    │
    │  TypeScript query<TitanicSurvivorySummary>()
    ▼
Typed TypeScript array → printed to CLI
```

---

## Key design principles

**Everything is reproducible.** Migrations are numbered and sequential. Pipelines truncate before inserting. Containers are built from versioned Dockerfiles. Anyone should be able to clone this repo and reach the same state.

**Secrets never live in source code.** All credentials come from `.env` files or CI secrets. The `.gitignore` prevents `.env` from being committed.

**Raw and clean data are separated.** The `staging` schema holds data exactly as ingested. The `analytics` schema holds derived data. This makes it easy to re-run transformations without re-fetching source data.

**The TypeScript app is the query interface.** Rather than writing ad-hoc SQL queries, consumers go through typed query functions. This catches errors at compile time and makes the query patterns discoverable.

**CI proves the system works.** Every push that touches migrations or the app runs a full integration test against a real database. If it passes CI, it works.

---

## Technology choices

| Component | Technology | Why |
|---|---|---|
| Database | PostgreSQL 16 | Industry-standard, powerful, open-source relational DB |
| Containerisation | Docker + Compose | Portable, reproducible, no local Postgres install needed |
| Migrations | Raw SQL files | Simple, readable, no framework lock-in |
| Data pipelines | Python + pandas | The dominant language for data work; huge ecosystem |
| Application | TypeScript + Node | Type safety + the same language most web teams already use |
| CI/CD | GitHub Actions | Free for public repos, deeply integrated with GitHub |

For the reasoning behind each choice, see the [Architecture Decision Records](../decisions/).
