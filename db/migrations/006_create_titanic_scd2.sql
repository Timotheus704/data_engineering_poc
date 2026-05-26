-- 006_create_titanic_scd2.sql
-- STATUS: Schema reference implementation. This migration creates the
-- table structure and convenience views for a Type 2 Slowly Changing
-- Dimension pattern. Population of this table is intentionally deferred
-- to a future pipeline implementation.
--
-- Design reference: docs/guides/scd2-pattern.md
-- Macro reference: dbt/macros/scd2_merge.sql
--
-- This pattern is documented here to demonstrate SCD2 schema design
-- without conflating schema lifecycle (migrations) with data lifecycle
-- (pipelines). In production, a dbt snapshot or a Python pipeline
-- using the scd2_merge macro would populate this table after ingestion.

CREATE TABLE IF NOT EXISTS analytics.dim_titanic_scd2 (
  -- Surrogate key: unique per row (a passenger can have multiple rows)
  surrogate_key         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Natural key: identifies the real-world entity (a specific passenger)
  passenger_id          INTEGER NOT NULL,

  -- The actual dimension attributes
  survived              BOOLEAN,
  passenger_class       VARCHAR(10),
  full_name             TEXT,
  sex                   VARCHAR(10),
  age_years             NUMERIC(5,2),
  family_size           INTEGER,
  fare_gbp              NUMERIC(10,4),
  cabin_number          VARCHAR(20),
  embarkation_port      VARCHAR(20),

  -- SCD2 metadata columns
  valid_from            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to              TIMESTAMPTZ,        -- NULL means this is the current record
  is_current            BOOLEAN NOT NULL DEFAULT TRUE,
  change_reason         TEXT,              -- Why was this record updated?
  record_hash           TEXT NOT NULL,     -- Hash of all attributes for change detection

  -- Audit columns
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on natural key + is_current for fast lookups of current records
CREATE INDEX IF NOT EXISTS idx_dim_titanic_scd2_passenger_current
  ON analytics.dim_titanic_scd2 (passenger_id, is_current);

-- Index on valid_from/valid_to for time-travel queries
CREATE INDEX IF NOT EXISTS idx_dim_titanic_scd2_valid_range
  ON analytics.dim_titanic_scd2 (passenger_id, valid_from, valid_to);

-- Convenience view: only current records (equivalent to the point-in-time snapshot)
CREATE OR REPLACE VIEW analytics.dim_titanic_current AS
SELECT
  surrogate_key,
  passenger_id,
  survived,
  passenger_class,
  full_name,
  sex,
  age_years,
  family_size,
  fare_gbp,
  cabin_number,
  embarkation_port,
  valid_from            AS effective_from,
  created_at
FROM analytics.dim_titanic_scd2
WHERE is_current = TRUE;

-- Convenience view: history for any passenger (all versions)
CREATE OR REPLACE VIEW analytics.dim_titanic_history AS
SELECT
  surrogate_key,
  passenger_id,
  survived,
  passenger_class,
  full_name,
  sex,
  age_years,
  fare_gbp,
  valid_from,
  COALESCE(valid_to, 'infinity'::timestamptz) AS valid_until,
  is_current,
  change_reason,
  ROW_NUMBER() OVER (
    PARTITION BY passenger_id
    ORDER BY valid_from
  )                                           AS version_number
FROM analytics.dim_titanic_scd2
ORDER BY passenger_id, valid_from;