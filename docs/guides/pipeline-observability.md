# Pipeline Observability Guide

This document describes the observability model for data pipelines 
in this platform — what signals are captured, how to query them 
during an incident, and what gaps exist in the current 
implementation.

---

## The Observability Model

Pipeline observability in this platform is built on three signals:

**1. Structured operational metadata**  
Every pipeline task run by Airflow writes a record to 
`orchestration.pipeline_runs`. This table is the primary signal 
for pipeline health. It captures status, timing, row counts, and 
error messages for every task execution.

**2. Watermark state**  
`orchestration.pipeline_watermarks` captures the last successful 
load watermark for each incremental dataset. Querying this table 
tells you how fresh the data is and whether the last incremental 
run was successful.

**3. Application-layer tracing**  
The Fastify API emits OpenTelemetry traces for every request. 
These traces are available in the console in development and 
would route to Cloud Trace in production. They cover the API 
layer but not the pipeline layer.

**Known gap:** The pipeline layer (Python ingestion scripts) does 
not emit structured traces or spans. Pipeline observability is 
currently limited to the Airflow metadata captured in 
`orchestration.pipeline_runs`. In production, pipeline functions 
would emit OpenTelemetry spans so the full ingestion path is 
traceable. This is a planned addition.

---

## Incident Diagnostic Queries

The following queries answer the most common questions during a 
pipeline incident. All queries run against the local Postgres 
instance or the production Cloud SQL equivalent.

### Is the pipeline currently healthy?

```sql
SELECT
  dag_id,
  task_id,
  status,
  started_at,
  ended_at,
  duration_seconds,
  rows_ingested,
  error_message
FROM orchestration.latest_pipeline_runs
ORDER BY dag_id, task_id;
```

This view returns the most recent run for each task. A healthy 
platform shows `status = 'success'` for all tasks with 
`started_at` within the expected schedule window.

### When did the last successful run complete?

```sql
SELECT
  dag_id,
  task_id,
  status,
  ended_at,
  rows_ingested,
  EXTRACT(EPOCH FROM (NOW() - ended_at)) / 3600 AS hours_since_completion
FROM orchestration.latest_pipeline_runs
WHERE status = 'success'
ORDER BY ended_at DESC;
```

If `hours_since_completion` exceeds the expected schedule interval, 
the pipeline has missed a run.

### How fresh is the data?

```sql
SELECT
  dataset_name,
  watermark_value,
  last_rows_loaded,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 3600 AS hours_since_update
FROM orchestration.pipeline_watermarks
ORDER BY updated_at DESC;
```

`watermark_value` is the maximum `pickup_datetime` processed in 
the last successful incremental run. If this is significantly 
behind the current time, either the pipeline has not run or the 
source data has no new records.

### What failed and why?

```sql
SELECT
  dag_id,
  task_id,
  run_id,
  status,
  started_at,
  ended_at,
  duration_seconds,
  error_message
FROM orchestration.pipeline_runs
WHERE status = 'failed'
ORDER BY started_at DESC
LIMIT 20;
```

`error_message` is populated by the Airflow failure callback. 
It contains the exception message from the failed task. For 
Python pipeline failures, this typically contains the traceback 
from the pipeline script.

### How has run duration trended?

```sql
SELECT
  task_id,
  DATE_TRUNC('day', started_at) AS run_date,
  AVG(duration_seconds) AS avg_duration_seconds,
  MAX(duration_seconds) AS max_duration_seconds,
  COUNT(*) AS run_count,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failure_count
FROM orchestration.pipeline_runs
WHERE started_at > NOW() - INTERVAL '30 days'
GROUP BY task_id, DATE_TRUNC('day', started_at)
ORDER BY task_id, run_date;
```

Increasing duration trend indicates data volume growth, 
infrastructure degradation, or a query plan regression. 
Failure count spikes indicate source data issues or 
infrastructure instability.

### Did the row count change unexpectedly?

```sql
SELECT
  task_id,
  started_at,
  rows_ingested,
  LAG(rows_ingested) OVER (
    PARTITION BY task_id ORDER BY started_at
  ) AS previous_rows_ingested,
  rows_ingested - LAG(rows_ingested) OVER (
    PARTITION BY task_id ORDER BY started_at
  ) AS row_delta
FROM orchestration.pipeline_runs
WHERE status = 'success'
  AND task_id LIKE 'ingest_%'
ORDER BY task_id, started_at DESC
LIMIT 30;
```

A large negative `row_delta` in full refresh mode may indicate 
source data was truncated upstream. A zero `row_delta` in 
incremental mode may indicate the watermark is not advancing.

---

## Alert Thresholds

The following conditions should trigger alerts in a production 
deployment. In the local PoC, these are manual checks:

| Condition | Threshold | Action |
|---|---|---|
| Task status is `failed` | Any failure | Investigate `error_message` in `pipeline_runs` |
| Hours since last success | > 1.5x schedule interval | Check Airflow scheduler health |
| Data freshness lag | > 24 hours | Check watermark and source availability |
| Run duration increase | > 2x 7-day average | Check data volume and query plans |
| Row count drop | > 20% from previous run | Check source data and cleaning contract |

---

## What Is Not Observable Today

This section documents known observability gaps so they can be 
prioritized for production promotion:

**Pipeline-layer tracing:** Python pipeline functions do not emit 
OpenTelemetry spans. The time spent in each phase of the pipeline 
(download, clean, load) is not individually traceable. The total 
pipeline duration is captured in `orchestration.pipeline_runs` but 
phase-level breakdown requires log parsing.

**Data quality trend tracking:** Great Expectations produces 
validation results but they are not currently persisted to a 
queryable table. In production, GE validation results would be 
written to `orchestration.validation_runs` for trend analysis.

**Consumer-side observability:** The API layer emits traces but 
there is no signal that captures which downstream queries are 
consuming pipeline output, how fresh the data is from the 
consumer's perspective, or whether consumers are experiencing 
degraded results due to pipeline latency.

**Cross-pipeline lineage:** If the titanic pipeline and the NYC 
taxi pipeline both fail simultaneously, there is no signal that 
tells an operator which dbt models are affected and what the 
downstream impact is. dbt's lineage graph contains this 
information but it is not integrated with the pipeline run 
metadata.

---

## References

- `db/migrations/004_create_orchestration_metadata.sql` — 
  schema for `orchestration.pipeline_runs`
- `db/migrations/005_create_pipeline_watermarks.sql` — 
  schema for `orchestration.pipeline_watermarks`
- `orchestration/airflow/dags/data_platform_dag.py` — 
  Airflow callbacks that populate `pipeline_runs`
- `web/server/src/tracing.ts` — OpenTelemetry setup for 
  the API layer
- [ADR 006](../decisions/006-scale-and-cost-considerations.md) — 
  production observability stack reasoning