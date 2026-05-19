# Project Structure Reference

A complete annotated map of every file and folder in the repository.

---

```
poc-repo/
│
├── .env.example                    # Template for environment variables — copy to .env
├── .env                            # Your local credentials (gitignored, never committed)
├── .gitignore                      # Files git will never track
├── docker-compose.yml              # Defines and connects all Docker services and profiles
├── dev.sh                          # One-command local dev startup (Postgres + API + React)
├── README.md                       # Project overview and getting-started instructions
├── CLAUDE.md                       # AI assistant context: full structure, conventions, commands
│
├── .github/
│   └── workflows/
│       ├── db-migrate.yml          # CI: validates and runs SQL migrations on push
│       └── app-ci.yml              # CI: TypeScript build check + DB smoke tests
│
├── db/
│   ├── migrations/                 # Numbered SQL files — run in order to build the schema
│   │   ├── 001_init_schemas.sql    # Creates staging + analytics schemas and pg extensions
│   │   ├── 002_create_titanic.sql  # staging.titanic table + analytics.titanic_survival_summary view
│   │   └── 003_create_nyc_taxi.sql # staging.nyc_taxi table + indexes + analytics.nyc_taxi_hourly view
│   └── seeds/
│       └── 001_sample_data.sql     # 5 sample Titanic rows for local dev without Kaggle
│
├── app/                            # TypeScript CLI application
│   ├── Dockerfile                  # node:20-alpine; runs ts-node in dev mode
│   ├── package.json                # Dependencies: pg, commander, dotenv, ts-node
│   ├── tsconfig.json               # Strict TypeScript, ES2022, CommonJS output
│   └── src/
│       ├── index.ts                # CLI entrypoint: ping, tables, seed, titanic, taxi, query
│       ├── db/
│       │   ├── client.ts           # pg Pool, query<T>(), withTransaction(), closePool()
│       │   └── types.ts            # TypeScript interfaces for every DB table/view row
│       └── queries/
│           ├── titanic.ts          # getTitanicPassengers(), getTitanicSurvivorySummary(), etc.
│           ├── nyc_taxi.ts         # getNycTaxiTrips(), getNycTaxiHourly(), etc.
│           └── utils.ts            # listTables(), pingDatabase(), runRawQuery()
│
├── web/                            # Full-stack web application
│   ├── server/                     # Fastify REST API (TypeScript)
│   │   ├── Dockerfile              # Multi-stage: tsc build → node:20-alpine production image
│   │   ├── package.json            # fastify, @fastify/cors, @fastify/swagger, pg, dotenv
│   │   ├── tsconfig.json           # Strict TypeScript, ES2022, CommonJS
│   │   └── src/
│   │       ├── index.ts            # Bootstrap: CORS, Swagger, route registration, listen()
│   │       ├── db.ts               # Shared pg Pool + query<T>() + withTransaction()
│   │       ├── plugins/
│   │       │   └── db-plugin.ts    # Fastify plugin: closes pool on server shutdown
│   │       └── routes/
│   │           ├── health.ts       # GET /health — DB ping + version
│   │           ├── titanic.ts      # GET/POST/PATCH/DELETE /api/titanic + /stats + /summary
│   │           ├── nyc_taxi.ts     # GET/POST/PATCH/DELETE /api/taxi + /stats + /hourly
│   │           └── admin.ts        # GET /api/admin/tables, /columns, /db-info; POST /admin/query
│   └── client/                     # React + Vite single-page application
│       ├── Dockerfile              # Multi-stage: vite build → nginx:alpine serving static files
│       ├── nginx.conf              # Serves SPA; proxies /api/* + /docs to web_server container
│       ├── vite.config.ts          # Dev server; proxies /api/* to localhost:3001
│       ├── index.html              # HTML entry point
│       ├── package.json            # react, react-router-dom, recharts, lucide-react
│       ├── tsconfig.json           # Strict TypeScript, ESNext modules, JSX react-jsx
│       └── src/
│           ├── main.tsx            # React root: StrictMode + BrowserRouter
│           ├── App.tsx             # Sidebar nav + React Router <Routes>
│           ├── lib/
│           │   └── api.ts          # Typed fetch wrappers: titanicApi, taxiApi, adminApi
│           ├── components/
│           │   ├── DataTable.tsx   # Generic paginated table; columns, Edit/Delete actions
│           │   ├── Modal.tsx       # Accessible modal; Esc to close, backdrop click to dismiss
│           │   └── StatCard.tsx    # Dashboard stat card; label, value, optional subtext
│           └── pages/
│               ├── Dashboard.tsx   # Stat cards + Recharts bar + line charts
│               ├── TitanicPage.tsx # Full CRUD UI for staging.titanic
│               ├── TaxiPage.tsx    # Full CRUD UI for staging.nyc_taxi
│               └── AdminPage.tsx   # Table browser + column inspector + SQL runner
│
├── pipelines/                      # Python data ingestion pipelines
│   ├── Dockerfile                  # python:3.11-slim with libpq + psycopg2
│   ├── requirements.txt            # kaggle, pandas, sqlalchemy, psycopg2-binary, matplotlib
│   ├── db.py                       # get_engine() — shared SQLAlchemy connection factory
│   ├── titanic/
│   │   └── ingest.py               # Download Titanic CSV → clean → TRUNCATE + INSERT → chart
│   └── nyc_taxi/
│       └── ingest.py               # Download Taxi CSV (50k rows) → clean → INSERT → chart
│
├── reports/                        # Generated PNG charts from pipeline analysis runs
│
└── docs/                           # All project documentation
    ├── INDEX.md                    # Documentation home page — start here
    ├── architecture/
    │   ├── overview.md             # Big-picture design, system diagram, data flow
    │   ├── database-design.md      # Schemas, tables, views, naming conventions
    │   ├── docker.md               # All containers, Dockerfiles, networking, profiles
    │   └── cicd.md                 # GitHub Actions workflows explained step by step
    ├── guides/
    │   ├── quick-start.md          # Zero to running in under 10 minutes
    │   ├── web-app.md              # Fastify API + React dashboard: structure and extension
    │   ├── typescript-app.md       # TypeScript CLI: structure, patterns, adding commands
    │   ├── adding-a-pipeline.md    # Step-by-step: add a new Kaggle dataset end-to-end
    │   └── migrations.md           # Writing and running SQL migrations safely
    ├── reference/
    │   ├── api.md                  # All REST endpoints, params, request/response shapes
    │   ├── cli.md                  # All CLI commands, options, and example output
    │   ├── environment-variables.md # Every env var: what it does, where it's used
    │   └── project-structure.md    # This file
    └── decisions/
        ├── 001-postgres-in-docker.md    # Why Postgres in Docker vs local install
        ├── 002-003-004-decisions.md     # Migration strategy, TypeScript CLI, Python pipelines
        └── 005-web-stack.md             # Why Fastify + React + Vite + nginx
```

---

## Key files explained

### `docker-compose.yml`
The single source of truth for the running system. Uses Docker profiles to group services: `postgres` always starts; `web_server` and `web_client` only start with `--profile web`; pipelines only start with `--profile pipeline`.

### `dev.sh`
A convenience script that starts Postgres in Docker, then runs the Fastify server and Vite dev client on your Mac with hot reload. Use this for active development — changes to TypeScript and React files update instantly without rebuilding Docker images.

### `web/server/src/index.ts`
The Fastify bootstrap. Registers CORS (allowing the React origin), Swagger UI, and all route plugins. The server listens on `0.0.0.0:3001` so it's reachable both from the Docker network and from your Mac.

### `web/server/src/db.ts`
The shared pg connection pool for the API. All route files import `query<T>()` and `withTransaction()` from here. Nothing else imports `pg` directly.

### `web/client/src/lib/api.ts`
The typed HTTP client for the React app. All API calls go through the typed helpers here — no raw `fetch()` in page components. If the API shape changes, this is the only file to update.

### `web/client/nginx.conf`
Critical for the Docker deployment. Routes `/api/*` to the Fastify container and serves `index.html` for all other routes (enabling React Router's client-side navigation). Without the `try_files ... /index.html` directive, refreshing a React route would return a 404.

### `app/src/db/client.ts` and `web/server/src/db.ts`
Both the CLI and the API have their own pg connection pool. They are structurally identical. A shared library would be an improvement in a larger project, but for a PoC keeping them separate avoids coupling between the two applications.

### `CLAUDE.md`
Read by AI coding assistants. Contains the full repo structure, all key commands, ports, conventions, and what NOT to do. Keep this up to date whenever the project structure changes.

---

## What is not in this repo (and why)

| Thing | Why absent |
|---|---|
| `.env` | Contains secrets; gitignored. Copy from `.env.example` |
| `node_modules/` | Generated by `npm install`; gitignored. Run `npm install` in `app/`, `web/server/`, and `web/client/` |
| `app/dist/` | TypeScript compiled output; gitignored. Run `npm run build` |
| `web/server/dist/` | Same — TypeScript compiled output |
| `web/client/dist/` | Vite build output; gitignored. Built automatically in the Docker image |
| `pipelines/*/data/` | Downloaded Kaggle CSV files; gitignored. Re-created by running pipelines |
| `reports/*.png` | Generated analysis charts; gitignored. Re-created by running pipelines |
| `~/.kaggle/kaggle.json` | Kaggle API credentials; lives on your Mac, mounted read-only at runtime |
