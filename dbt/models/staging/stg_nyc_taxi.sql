-- stg_nyc_taxi.sql
-- DEPENDENCY: Requires migration 005 (005_create_pipeline_watermarks.sql)
-- to have been applied. The source_row_hash column is added by that migration.
SELECT
  id,
  vendor_id,
  pickup_datetime,
  dropoff_datetime,
  passenger_count,
  trip_distance,
  pickup_longitude,
  pickup_latitude,
  rate_code_id,
  store_and_fwd_flag,
  dropoff_longitude,
  dropoff_latitude,
  payment_type,
  fare_amount,
  extra,
  mta_tax,
  tip_amount,
  tolls_amount,
  total_amount,
  source_row_hash,
  loaded_at
FROM {{ source('staging', 'nyc_taxi') }}
