# CI/CD Pipeline

This document explains the continuous integration and continuous delivery (CI/CD) setup — what it does, how it works, and how to extend it.

---

## What is CI/CD?

**Continuous Integration (CI)** means automatically running checks every time code is pushed to the repository. The goal is to catch problems (broken migrations, TypeScript errors, test failures) before they reach a shared environment or production.

**Continuous Delivery (CD)** extends that by automatically deploying code that passes CI checks. In this project we focus on CI — the deployment side is left for you to extend based on your target environment.

The analogy: CI is like a spell-checker that runs every time you save a document, but for your entire codebase.

---

## Where the workflows live

```
.github/
└── workflows/
    ├── ci.yml            ← General app, API, and client build/test matrix
    ├── contract-ci.yml   ← Cross-layer platform contract and harness checks
    ├── db-migrate.yml    ← Validates and runs SQL migrations
    ├── dbt-ci.yml        ← Validates dbt parse/test against Postgres
    ├── python-ci.yml     ← Compiles, lints, and tests Python pipelines
    ├── terraform-ci.yml  ← Formats and validates Terraform modules
    └── app-ci.yml        ← Builds and smoke-tests the TypeScript CLI app
```

GitHub Actions automatically discovers and runs any `.yml` file in `.github/workflows/`.

The contract workflow is intentionally broader than the path-scoped workflows.
It catches changes that cross repository layers, such as a migration affecting
dbt, an API schema affecting the client, or documentation drifting away from the
AI collaboration harness.

---

## Workflow 1: Database Migrations (`db-migrate.yml`)

### What it does

1. Starts a real Postgres container inside the CI runner
2. Runs every migration SQL file in order against it
3. Verifies the expected schemas exist
4. Verifies the expected tables exist

### When it runs

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'db/migrations/**'
  pull_request:
    paths:
      - 'db/migrations/**'
```

It only runs when migration files change. This keeps CI fast — a change to the TypeScript app does not trigger a migration run.

### The service container

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: poc_user
      POSTGRES_PASSWORD: poc_password
      POSTGRES_DB: poc_db
    ports:
      - 5432:5432
    options: >-
      --health-cmd "pg_isready -U poc_user -d poc_db"
      --health-interval 5s
      --health-retries 10
```

GitHub Actions supports **service containers** — Docker containers that run alongside your workflow steps and are accessible by hostname. Here, Postgres is available at `localhost:5432` within the CI job.

The `options` health check ensures the next steps don't start until Postgres is actually ready to accept connections.

### Migration step

```yaml
- name: Run migrations in order
  env:
    PGPASSWORD: poc_password
  run: |
    for f in $(ls db/migrations/*.sql | sort); do
      echo "▶ Running $f"
      psql -h localhost -U poc_user -d poc_db -f "$f"
    done
```

This shell loop runs each `.sql` file using `psql`, the Postgres command-line client. The files are sorted so they always run in numeric order (001, 002, 003...).

The `PGPASSWORD` environment variable is how `psql` receives the password without an interactive prompt.

### Verification steps

After migrations run, the workflow verifies the expected schemas and tables actually exist:

```yaml
- name: Verify schemas exist
  run: psql ... -c "\dn" | grep -E "staging|analytics"

- name: Verify tables exist
  run: psql ... -c "SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('staging','analytics');"
```

If any migration failed silently (e.g. a `CREATE TABLE IF NOT EXISTS` did nothing due to a bug), these checks catch it.

---

## Workflow 2: TypeScript App CI (`app-ci.yml`)

### What it does

1. Starts a Postgres container and runs migrations against it
2. Installs Node.js dependencies
3. Runs the TypeScript compiler in check-only mode (`tsc --noEmit`)
4. Runs two live CLI commands against the real database to verify end-to-end functionality

### When it runs

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'app/**'
  pull_request:
    paths:
      - 'app/**'
```

Only triggers when files in `app/` change.

### TypeScript build check

```yaml
- name: TypeScript build check
  working-directory: app
  run: npx tsc --noEmit
```

`--noEmit` tells TypeScript to type-check everything but not actually produce output files. This catches:
- Type mismatches (e.g. passing a string where a number is expected)
- Missing properties on interfaces
- Incorrect function signatures
- Imports that don't exist

### Smoke tests

```yaml
- name: Ping database via app
  run: npx ts-node src/index.ts ping

- name: List tables via app
  run: npx ts-node src/index.ts tables
```

These run the actual CLI against the real Postgres container in CI. If the database connection fails, the migration logic is broken, or the TypeScript has a runtime error, these steps fail — giving you a clear signal.

---

## How environment variables flow in CI

The CI workflows use hardcoded credentials in the workflow file itself (not secrets) because this is a CI testing database with no real data. For production, you would:

1. Store credentials in **GitHub repository secrets** (Settings → Secrets and variables → Actions)
2. Reference them in workflows as `${{ secrets.DB_PASSWORD }}`

Example:
```yaml
env:
  POSTGRES_PASSWORD: ${{ secrets.POSTGRES_PASSWORD }}
```

---

## Understanding the job execution flow

Here is what happens step-by-step when you push a migration file:

```
You push a commit touching db/migrations/004_new_table.sql
          │
          ▼
GitHub detects the push matches the workflow trigger
          │
          ▼
GitHub allocates a runner (Ubuntu VM in the cloud)
          │
          ▼
Runner starts the Postgres service container
          │
          ▼
Health check passes → Postgres is ready
          │
          ▼
actions/checkout@v4 → your code is cloned onto the runner
          │
          ▼
Shell loop runs 001_, 002_, 003_, 004_ in order against CI Postgres
          │
          ├── ✅ All pass → verify schemas → verify tables → job succeeds
          │
          └── ❌ Any SQL error → psql exits non-zero → job fails → GitHub notifies you
```

---

## Reading CI results

When a workflow runs, you can see it in the **Actions** tab of your GitHub repository. Each run shows:

- ✅ Green checkmark — all steps passed
- ❌ Red X — a step failed; click to see the exact error output
- 🟡 Yellow circle — the workflow is still running

You can also add a **status badge** to your README:

```markdown
![DB Migrations](https://github.com/YOUR_ORG/YOUR_REPO/actions/workflows/db-migrate.yml/badge.svg)
![App CI](https://github.com/YOUR_ORG/YOUR_REPO/actions/workflows/app-ci.yml/badge.svg)
```

---

## Extending CI

### Adding a linter

```yaml
- name: Lint TypeScript
  working-directory: app
  run: npx eslint src/**/*.ts
```

### Adding tests

```yaml
- name: Run tests
  working-directory: app
  run: npm test
```

### Adding pipeline CI

To validate Python pipelines in CI (without Kaggle credentials), you can use the seed data:

```yaml
- name: Validate pipeline imports
  run: |
    pip install -r pipelines/requirements.txt
    python -c "from pipelines.db import get_engine; print('imports ok')"
```

### Scheduling a pipeline run

```yaml
on:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday at 6am UTC
```

This runs the workflow on a schedule rather than on push — useful for refreshing Kaggle data weekly.
