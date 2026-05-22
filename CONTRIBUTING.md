# Contributing to the Data Platform PoC

Thank you for contributing! This project is designed to showcase high-level data engineering and full-stack practices. To maintain this standard, we ask that all contributors follow the guidelines outlined below.

---

## Development Setup

This repository uses a containerized architecture with Docker Compose.

### 1. Prerequisites
- **Docker Desktop** (latest)
- **Node.js 20+** (managed via `nvm` recommended)
- **Python 3.11+**
- **Kaggle API Token**: Placed at `~/.kaggle/kaggle.json` to enable data pipelines.

### 2. Initial Configuration
```bash
cp .env.example .env
# The default values are tuned for Docker-to-Docker communication.
```

### 3. Running the Stack
- **Standard Dev:** Run `./dev.sh`. This starts Postgres in Docker while running the API and UI locally for hot-reloading.
- **Full Stack (Dockerized):** `docker compose --profile web --profile orchestration --profile transform up --build`

---

## Coding Standards

### TypeScript (API, CLI, UI)
- **Strict Typing:** We enforce `strict: true`. Use of `any` is strictly prohibited.
- **Validation:** Use **Zod** for all API request validation and environment variable parsing.
- **Interfaces:** Shared database row types live in `app/src/db/types.ts`. Ensure these match the actual SQL schema exactly.
- **Functional Style:** Prefer immutability and functional array methods (`map`, `filter`, `reduce`) over imperative loops where possible.

### Python (Pipelines & Orchestration)
- **Style:** Follow PEP 8. Use `black` or `ruff` for formatting.
- **Database Access:** Always use the shared engine factory in `pipelines/db.py`. Never hardcode connection strings.
- **Type Hinting:** All new functions must include Python type hints for arguments and return values.

### SQL
- **Formatting:** Keywords should be uppercase (`SELECT`, `FROM`, `JOIN`).
- **Schema Ownership:**
  - `staging`: Raw or lightly cleaned ingestion data.
  - `analytics`: dbt-transformed models and business views.
  - `orchestration`: Metadata, watermarks, and pipeline logs.

---

## Migration Conventions

Migrations are the source of truth for the platform's state.

1. **Append-Only:** Never modify a migration file that has already been merged. Create a new numbered file for changes.
2. **Naming:** Use the three-digit prefix: `db/migrations/###_description.sql`.
3. **Idempotency:** Every statement must be safe to run multiple times. Use `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE VIEW`, and `DO $$ BEGIN ... END $$` blocks for logic.
4. **Audit Columns:** Every table in `staging` must include:
   ```sql
   loaded_at TIMESTAMPTZ DEFAULT NOW()
   ```

---

## Pull Request Guidelines

1. **Branching:** Use `feat/`, `fix/`, or `docs/` prefixes for branch names.
2. **Atomic Commits:** Keep PRs focused on a single logical change. If a feature requires a new table, a pipeline, and a UI update, ensure the commit history clearly reflects these layers.
3. **Verification:** Your PR description must include evidence of testing:
   - For SQL changes: Result of manual `psql` execution.
   - For API changes: Screenshot of Swagger UI or Curl output.
   - For UI changes: Screenshot of the React dashboard.

---

## Testing & Quality Requirements

We gate our data and code through several layers of testing.

### 1. Data Quality (Great Expectations)
If you introduce a new dataset, you **must** add a corresponding expectation suite in `orchestration/great_expectations/expectations/`. At a minimum, check for:
- Row count ranges.
- Non-nullity on primary keys.
- Proper date formats for timestamps.

### 2. Transformation Tests (dbt)
All new dbt models must have `unique` and `not_null` tests defined in their `schema.yml`. Run these before submitting:
```bash
docker compose --profile transform run --rm dbt test
```

### 3. API Integration
Ensure the API build succeeds and the Swagger documentation (accessible at `/docs`) correctly reflects any schema changes made via Zod.

### 4. Build Checks
Before pushing, verify that all TypeScript packages compile:
```bash
cd app && npm run build
cd web/server && npm run build
cd web/client && npm run build
```

---

## Documentation

- **ADRs:** Significant architectural changes (e.g., adding a new messaging bus or changing a library) should be recorded as an ADR in `docs/decisions/`.
- **Guides:** If you add a new pipeline, update `docs/guides/adding-a-pipeline.md` if the workflow has changed.

---

**Questions?** Check `DEVELOPER_GUIDE` for a deep dive into the platform philosophy or open a GitHub Issue.
