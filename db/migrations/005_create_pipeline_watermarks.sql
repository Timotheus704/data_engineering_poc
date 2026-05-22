-- 005_create_pipeline_watermarks.sql
-- Tracks incremental load state for datasets with event/update timestamps.
-- Defensively creates orchestration schema in case 004 has not been applied.
-- Dependencies: 004_create_orchestration_metadata.sql (for orchestration schema)

CREATE SCHEMA IF NOT EXISTS orchestration;
CREATE SCHEMA IF NOT EXISTS airflow;

CREATE TABLE IF NOT EXISTS orchestration.pipeline_watermarks (
  dataset_name          TEXT PRIMARY KEY,
  source_schema         TEXT NOT NULL,
  source_table          TEXT NOT NULL,
  watermark_column      TEXT NOT NULL,
  watermark_value       TIMESTAMPTZ,
  last_successful_run   TEXT,
  last_rows_loaded      INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE staging.nyc_taxi
  ADD COLUMN IF NOT EXISTS source_row_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nyc_taxi_source_row_hash
  ON staging.nyc_taxi (source_row_hash);

INSERT INTO orchestration.pipeline_watermarks (
  dataset_name,
  source_schema,
  source_table,
  watermark_column
)
VALUES (
  'nyc_taxi',
  'staging',
  'nyc_taxi',
  'pickup_datetime'
)
ON CONFLICT (dataset_name) DO NOTHING;
