-- 003_create_nyc_taxi.sql
-- Staging table for NYC Taxi trips dataset

CREATE TABLE IF NOT EXISTS staging.nyc_taxi (
  id                  SERIAL PRIMARY KEY,
  vendor_id           SMALLINT,
  pickup_datetime     TIMESTAMPTZ,
  dropoff_datetime    TIMESTAMPTZ,
  passenger_count     SMALLINT,
  trip_distance       NUMERIC(8, 2),
  pickup_longitude    NUMERIC(11, 6),
  pickup_latitude     NUMERIC(11, 6),
  rate_code_id        SMALLINT,
  store_and_fwd_flag  CHAR(1),
  dropoff_longitude   NUMERIC(11, 6),
  dropoff_latitude    NUMERIC(11, 6),
  payment_type        SMALLINT,
  fare_amount         NUMERIC(8, 2),
  extra               NUMERIC(8, 2),
  mta_tax             NUMERIC(8, 2),
  tip_amount          NUMERIC(8, 2),
  tolls_amount        NUMERIC(8, 2),
  total_amount        NUMERIC(8, 2),
  loaded_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_nyc_taxi_pickup_dt  ON staging.nyc_taxi (pickup_datetime);
CREATE INDEX IF NOT EXISTS idx_nyc_taxi_passenger  ON staging.nyc_taxi (passenger_count);

-- Analytics view: hourly trip summary
CREATE OR REPLACE VIEW analytics.nyc_taxi_hourly AS
SELECT
  DATE_TRUNC('hour', pickup_datetime)   AS hour,
  COUNT(*)                              AS total_trips,
  ROUND(AVG(trip_distance), 2)          AS avg_distance_miles,
  ROUND(AVG(total_amount), 2)           AS avg_fare_usd,
  ROUND(AVG(tip_amount), 2)             AS avg_tip_usd,
  SUM(passenger_count)                  AS total_passengers
FROM staging.nyc_taxi
WHERE pickup_datetime IS NOT NULL
GROUP BY 1
ORDER BY 1;
