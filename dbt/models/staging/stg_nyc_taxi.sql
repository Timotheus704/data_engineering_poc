-- stg_nyc_taxi.sql
-- Staging model for NYC Taxi trip data.
-- DEPENDENCY: Requires migration 005 for source_row_hash column.
-- Applies type standardization, derived fields, and data quality filters.

WITH source AS (
  SELECT * FROM {{ source('staging', 'nyc_taxi') }}
),

cleaned AS (
  SELECT
    id                                              AS trip_key,
    source_row_hash,
    loaded_at,

    -- Vendor: expand numeric code to name
    CASE vendor_id
      WHEN 1 THEN 'Creative Mobile Technologies'
      WHEN 2 THEN 'VeriFone Inc'
      ELSE 'Unknown'
    END                                             AS vendor_name,
    vendor_id,

    -- Timestamps: cast and validate
    pickup_datetime,
    dropoff_datetime,

    -- Trip duration in minutes (derived)
    CASE
      WHEN dropoff_datetime IS NOT NULL AND pickup_datetime IS NOT NULL
        AND dropoff_datetime > pickup_datetime
      THEN ROUND(
        EXTRACT(EPOCH FROM (dropoff_datetime - pickup_datetime)) / 60.0,
        2
      )
      ELSE NULL
    END                                             AS trip_duration_minutes,

    passenger_count,
    trip_distance                                   AS trip_distance_miles,

    -- Geographic coordinates: keep only valid NYC bounding box values
    CASE
      WHEN pickup_longitude BETWEEN -74.3 AND -73.7
       AND pickup_latitude  BETWEEN  40.5 AND  40.9
      THEN pickup_longitude ELSE NULL
    END                                             AS pickup_longitude,
    CASE
      WHEN pickup_longitude BETWEEN -74.3 AND -73.7
       AND pickup_latitude  BETWEEN  40.5 AND  40.9
      THEN pickup_latitude ELSE NULL
    END                                             AS pickup_latitude,
    CASE
      WHEN dropoff_longitude BETWEEN -74.3 AND -73.7
       AND dropoff_latitude  BETWEEN  40.5 AND  40.9
      THEN dropoff_longitude ELSE NULL
    END                                             AS dropoff_longitude,
    CASE
      WHEN dropoff_longitude BETWEEN -74.3 AND -73.7
       AND dropoff_latitude  BETWEEN  40.5 AND  40.9
      THEN dropoff_latitude ELSE NULL
    END                                             AS dropoff_latitude,

    -- Rate code: expand to name
    CASE rate_code_id
      WHEN 1 THEN 'Standard Rate'
      WHEN 2 THEN 'JFK'
      WHEN 3 THEN 'Newark'
      WHEN 4 THEN 'Nassau/Westchester'
      WHEN 5 THEN 'Negotiated Fare'
      WHEN 6 THEN 'Group Ride'
      ELSE 'Unknown'
    END                                             AS rate_type,

    -- Payment type: expand to name
    CASE payment_type
      WHEN 1 THEN 'Credit Card'
      WHEN 2 THEN 'Cash'
      WHEN 3 THEN 'No Charge'
      WHEN 4 THEN 'Dispute'
      WHEN 5 THEN 'Unknown'
      WHEN 6 THEN 'Voided Trip'
      ELSE 'Other'
    END                                             AS payment_method,

    -- Financials: ensure non-negative
    GREATEST(fare_amount,   0)                      AS fare_amount_usd,
    GREATEST(tip_amount,    0)                      AS tip_amount_usd,
    GREATEST(tolls_amount,  0)                      AS tolls_amount_usd,
    GREATEST(mta_tax,       0)                      AS mta_tax_usd,
    GREATEST(extra,         0)                      AS extras_usd,
    GREATEST(total_amount,  0)                      AS total_amount_usd,

    -- Tip percentage (derived, useful for analytics)
    CASE
      WHEN fare_amount > 0
      THEN ROUND((tip_amount / fare_amount) * 100, 1)
      ELSE 0
    END                                             AS tip_pct

  FROM source
  WHERE
    -- Apply the same quality filters as the Python pipeline for consistency
    fare_amount > 0
    AND trip_distance > 0
    AND passenger_count BETWEEN 1 AND 6
)

SELECT * FROM cleaned