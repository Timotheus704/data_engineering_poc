# Project Structure Reference

A complete annotated map of every file and folder in the repository.

---

```
poc-repo/
│
├── .env.example                    # Template for environment variables — copy to .env
├── .env                            # Your local credentials (gitignored, never committed)
├── .gitignore                      # Files git will never track
├── docker-compose.yml              # Defines and connects all Docker services
├── README.md                       # Project overview and getting-started instructions
├── CLAUDE.md                       # AI assistant context: structure, conventions, commands
│
├── .github/
│   └── workflows/
│       ├── db-migrate.yml          # CI: validates and runs SQL migrations on push
│       └── app-ci.yml              # CI: TypeScript build check and smoke tests
│
├── db/
│   ├── migrations/                 # Numbered SQL files that build the schema in order
│   │   ├── 001_init_schemas.sql    # Creates staging and analytics schemas + extensions
│   │   ├── 002_create_titanic.sql  # staging.titanic table + analytics view
│   │   └── 003_create_nyc_taxi.sql # staging.nyc_taxi table + indexes + analytics view
│   └── seeds/
│       └── 001_sample_data.sql     # Small set of Titanic rows for local dev without Kaggle
│
├── app/                            # TypeScript CLI application
│   ├── Dockerfile                  # Container image for the app (node:20-alpine)
│   ├── package.json                # Node.js dependencies and npm scripts
│   ├── tsconfig.json               # TypeScript compiler options (strict, ES2022)
│   └── src/
│       ├── index.ts                # CLI entrypoint; all commands registered here
│       ├── db/
│       │   ├── client.ts           # pg connection pool, query<T>(), withTransaction()
│       │   └── types.ts            # TypeScript interfaces for every DB row/view type
│       └── queries/
│           ├── titanic.ts          # Typed query functions for staging.titanic
│           ├── nyc_taxi.ts         # Typed query functions for staging.nyc_taxi
│           └── utils.ts            # listTables(), pingDatabase(), runRawQuery()
│
├── pipelines/                      # Python data ingestion pipelines
│   ├── Dockerfile                  # Container image for pipelines (python:3.11-slim)
│   ├── requirements.txt            # Python dependencies (kaggle, pandas, sqlalchemy, etc.)
│   ├── db.py                       # Shared SQLAlchemy engine factory; reads from env vars
│   ├── titanic/
│   │   └── ingest.py               # Titanic pipeline: download → clean → load → analyse
│   └── nyc_taxi/
│       └── ingest.py               # NYC Taxi pipeline: download → clean → load → analyse
│
├── reports/                        # Generated output (charts, analysis markdown files)
│   └── .gitkeep                    # Keeps the folder tracked by git while ignoring contents
│
└── docs/                           # All documentation
    ├── INDEX.md                    # Documentation home page — start here
    ├── architecture/
    │   ├── overview.md             # Big-picture system design and data flow
    │   ├── database-design.md      # Schema, table definitions, views, naming
    │   ├── docker.md               # Container setup, Dockerfiles, networking
    │   └── cicd.md                 # GitHub Actions workflows explained
    ├── guides/
    │   ├── quick-start.md          # Get running from zero in under 10 minutes
    │   ├── typescript-app.md       # Working on the TS app: structure, patterns, extending
    │   ├── migrations.md           # Writing and running SQL migrations
    │   └── adding-a-pipeline.md    # Step-by-step: add a new Kaggle dataset
    ├── reference/
    │   ├── cli.md                  # All CLI commands, options, and example output
    │   ├── environment-variables.md # Every env var documented
    │   └── project-structure.md    # This file
    └── decisions/
        ├── 001-postgres-in-docker.md
        ├── 002-flyway-vs-raw-sql.md
        ├── 003-typescript-for-app.md
        └── 004-python-for-pipelines.md
```

---

## Key files explained

### `docker-compose.yml`

The single file that describes the entire running system. Services defined here:
- `postgres` — always starts; data persisted to named volume `postgres_data`
- `app` — the TypeScript CLI; depends on Postgres being healthy
- `pipeline_titanic` and `pipeline_nyc_taxi` — only start with `--profile pipeline`

### `app/src/index.ts`

The main entrypoint. Every CLI command is registered here using Commander.js. It also handles the `finally` block that closes the database connection pool on exit.

### `app/src/db/client.ts`

The single source of truth for database connectivity. All other files import `query` or `withTransaction` from here — nothing else imports `pg` directly.

### `app/src/db/types.ts`

Every database table and view has a corresponding TypeScript interface here. When you add a new table, you add its interface here first, then use it in query functions.

### `pipelines/db.py`

The Python equivalent of `client.ts` — a single `get_engine()` function that all pipeline scripts import. Connection config comes from environment variables.

### `CLAUDE.md`

A special file read by AI coding assistants (Claude, Copilot, Cursor). It explains the project structure, key commands, and conventions so that AI-generated code follows the same patterns as the rest of the codebase.

---

## What is not in this repo

| Thing | Why |
|---|---|
| `.env` | Contains secrets; gitignored |
| `node_modules/` | Generated by `npm install`; gitignored |
| `app/dist/` | TypeScript compiled output; gitignored |
| `pipelines/*/data/` | Downloaded Kaggle CSV files; gitignored |
| `reports/*.png` | Generated charts; gitignored |
| `~/.kaggle/kaggle.json` | Kaggle API credentials; lives on your Mac, never in the repo |
