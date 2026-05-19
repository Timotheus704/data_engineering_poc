# Documentation Index

Welcome to the PoC Repo documentation. Whether you're a first-time contributor or an experienced engineer, this index will point you to the right place.

---

## Where to start

| I want to... | Go here |
|---|---|
| Get the project running on my machine | [Quick Start Guide](guides/quick-start.md) |
| Understand the overall system design | [Architecture Overview](architecture/overview.md) |
| Learn how the database is structured | [Database Design](architecture/database-design.md) |
| Understand how Docker is used | [Docker & Containers](architecture/docker.md) |
| Learn how CI/CD works | [CI/CD Pipeline](architecture/cicd.md) |
| Understand the web app (API + UI) | [Web App Guide](guides/web-app.md) |
| Run Airflow, dbt, and data quality checks | [Orchestration Guide](guides/orchestration.md) |
| Add a new dataset pipeline | [Adding a Pipeline](guides/adding-a-pipeline.md) |
| Add a new database migration | [Database Migrations Guide](guides/migrations.md) |
| Work on the TypeScript CLI | [TypeScript CLI Guide](guides/typescript-app.md) |
| Look up CLI commands | [CLI Reference](reference/cli.md) |
| Look up API endpoints | [API Reference](reference/api.md) |
| Look up environment variables | [Environment Variables](reference/environment-variables.md) |
| Browse every file in the repo | [Project Structure](reference/project-structure.md) |
| Understand a design decision | [Architecture Decision Records](decisions/) |

---

## Documentation structure

```
docs/
├── INDEX.md                        ← You are here
├── architecture/
│   ├── overview.md                 ← Big-picture system design (updated: includes web layer)
│   ├── database-design.md          ← Schema, naming, and patterns
│   ├── docker.md                   ← How all containers are organised (updated: web services)
│   └── cicd.md                     ← GitHub Actions workflows explained
├── guides/
│   ├── quick-start.md              ← Get running in under 10 minutes (updated: web app)
│   ├── orchestration.md            ← Airflow, dbt, and Great Expectations
│   ├── web-app.md                  ← Working on the Fastify API + React dashboard
│   ├── typescript-app.md           ← Working on the TypeScript CLI
│   ├── adding-a-pipeline.md        ← Step-by-step: new Kaggle dataset
│   └── migrations.md               ← Writing and running SQL migrations
├── reference/
│   ├── api.md                      ← All REST API endpoints, methods, and examples
│   ├── cli.md                      ← All CLI commands and options
│   ├── environment-variables.md    ← Every env var explained
│   └── project-structure.md        ← File and folder reference (updated: web/)
└── decisions/
    ├── 001-postgres-in-docker.md   ← Why Postgres in Docker
    ├── 002-003-004-decisions.md    ← Migration strategy, TypeScript, Python choices
    └── 005-web-stack.md            ← Why Fastify + React + Vite + nginx
```

---

## Concepts glossary

| Term | Plain English |
|---|---|
| **Container** | A self-contained box that runs a piece of software with everything it needs bundled inside |
| **Docker Compose** | A tool that starts and connects multiple containers from a single config file |
| **Docker profile** | A label on a service that prevents it from starting unless explicitly requested (`--profile web`) |
| **Migration** | A versioned SQL script that changes the database schema in a controlled, trackable way |
| **Schema** | A namespace inside Postgres that groups related tables together |
| **Staging schema** | Where raw, freshly ingested data lives before cleaning |
| **Analytics schema** | Where cleaned, aggregated data and views live for querying |
| **Pipeline** | An automated process that fetches data from a source, cleans it, and loads it into a database |
| **DAG** | A directed acyclic graph: the dependency graph a scheduler like Airflow uses to run pipeline tasks in order |
| **dbt model** | A SQL transformation managed by dbt with lineage, tests, and documentation |
| **Data quality gate** | A validation step that stops downstream work when source data violates expected rules |
| **CI/CD** | Continuous Integration / Continuous Delivery — automated checks and deployments that run on every code push |
| **Environment variable** | A named value (like a password or hostname) set outside the code so secrets never live in source files |
| **Connection pool** | A set of pre-opened database connections shared across requests, avoiding the cost of opening a new one each time |
| **View** | A saved SQL query that looks like a table — querying it re-runs the query live |
| **Type safety** | A property of TypeScript code where the shape of every value is checked at compile time, catching bugs before runtime |
| **REST API** | An HTTP interface where each URL represents a resource and HTTP methods (GET/POST/PATCH/DELETE) represent actions |
| **Proxy** | A middleman that forwards requests — nginx forwards `/api/*` from the React UI to the Fastify server |
| **Hot reload** | A dev-mode feature where code changes instantly update the running app without a manual restart |
