# Orchestration, Transformations, and Data Quality

This project includes a production-shaped orchestration scaffold built around:

- **Airflow** for scheduling, retries, backfills, and operational metadata
- **Great Expectations** for staging-table data quality gates
- **dbt** for analytics transformations, lineage, documentation, and model tests

The flow is:

```text
Python ingestion scripts
  -> Great Expectations staging validations
  -> dbt analytics models
  -> dbt tests
```

Airflow runs this as the `data_platform_batch` DAG.

The NYC Taxi ingestion path supports both full-refresh and incremental modes. Airflow uses incremental mode so repeated runs only process rows newer than the last successful `pickup_datetime` watermark.

---

## Prerequisites

Before running dbt, ensure all migrations have been applied:

```bash
for f in db/migrations/*.sql; do
  PGPASSWORD=poc_password psql -h localhost -U poc_user -d poc_db -f "$f"
done
```

The dbt `stg_nyc_taxi` model requires migration `005` for the `source_row_hash` column.

---

## Start Airflow

Airflow is behind the `orchestration` Docker Compose profile.

```bash
docker compose --profile orchestration up --build
```

Then open:

- Airflow UI: http://localhost:8080
- Default user: `admin`
- Default password: `admin`

If your Postgres Docker volume existed before migration `004_create_orchestration_metadata.sql`, apply that migration first or recreate the local volume.

```bash
PGPASSWORD=poc_password psql -h localhost -U poc_user -d poc_db -f db/migrations/004_create_orchestration_metadata.sql
```

---

## Run the DAG

The DAG is defined in:

```text
orchestration/airflow/dags/data_platform_dag.py
```

It runs daily with `catchup=True`, so interviewers can see that backfills are a first-class concern. Each task has:

- retries
- retry delay
- SLA configuration
- success/failure callbacks
- task status persisted to `orchestration.pipeline_runs`

To inspect recent task runs:

```sql
SELECT *
FROM orchestration.latest_pipeline_runs
ORDER BY started_at DESC;
```

To inspect incremental state:

```sql
SELECT *
FROM orchestration.pipeline_watermarks
ORDER BY updated_at DESC;
```

---

## Run dbt Directly

The dbt project lives in `dbt/`.

```bash
docker compose --profile transform run --rm dbt run --profiles-dir .
docker compose --profile transform run --rm dbt test --profiles-dir .
docker compose --profile transform run --rm dbt docs generate --profiles-dir .
```

Current models:

- `stg_titanic`
- `stg_nyc_taxi`
- `titanic_survival_summary`
- `nyc_taxi_hourly`

The analytics models intentionally replace the analytics SQL that originally lived in migrations with dbt-owned model code.

---

## Run Great Expectations Directly

Great Expectations configuration lives in:

```text
orchestration/great_expectations/
```

Run either suite:

```bash
docker compose --profile quality run --rm great_expectations \
  python orchestration/great_expectations/validate.py titanic_staging

docker compose --profile quality run --rm great_expectations \
  python orchestration/great_expectations/validate.py nyc_taxi_staging
```

The validation script exits non-zero when expectations fail, which means the Airflow DAG stops before dbt builds downstream analytics.

---

## Incremental Loading

The NYC Taxi pipeline accepts a load mode:

```bash
cd pipelines
POSTGRES_HOST=localhost python nyc_taxi/ingest.py --mode full-refresh
POSTGRES_HOST=localhost python nyc_taxi/ingest.py --mode incremental
```

Full refresh truncates and reloads `staging.nyc_taxi`. Incremental mode reads the latest `pickup_datetime` from `orchestration.pipeline_watermarks`, filters out older rows, and upserts by `source_row_hash`.

This keeps the original PoC simple while demonstrating the production pattern: persisted watermarks, idempotent merges, and reruns that do not duplicate data.

---

## What This Demonstrates

This scaffold is meant to show senior data engineering instincts:

- Pipelines are scheduled and backfillable, not just executable scripts.
- Bad staging data blocks downstream transformations.
- Incremental loading has explicit watermark state and idempotent upserts.
- Transformations have lineage through `ref()` and `source()`.
- dbt tests document model contracts.
- Operational metadata is queryable from Postgres.

Next high-impact extensions would be dashboard surfacing for `orchestration.pipeline_runs` and `orchestration.pipeline_watermarks`.
