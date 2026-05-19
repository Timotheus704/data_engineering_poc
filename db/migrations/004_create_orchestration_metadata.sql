-- 004_create_orchestration_metadata.sql
-- Metadata tables used by Airflow callbacks and local pipeline observability.

CREATE SCHEMA IF NOT EXISTS orchestration;
CREATE SCHEMA IF NOT EXISTS airflow;

CREATE TABLE IF NOT EXISTS orchestration.pipeline_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dag_id            TEXT NOT NULL,
  task_id           TEXT NOT NULL,
  run_id            TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,
  duration_seconds  NUMERIC(12, 3),
  rows_ingested     INTEGER,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dag_id, task_id, run_id)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started_at
  ON orchestration.pipeline_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status
  ON orchestration.pipeline_runs (status);

CREATE OR REPLACE VIEW orchestration.latest_pipeline_runs AS
SELECT DISTINCT ON (dag_id, task_id)
  dag_id,
  task_id,
  run_id,
  status,
  started_at,
  ended_at,
  duration_seconds,
  rows_ingested,
  error_message
FROM orchestration.pipeline_runs
ORDER BY dag_id, task_id, started_at DESC;
