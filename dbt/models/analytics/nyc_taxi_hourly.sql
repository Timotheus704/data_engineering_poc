SELECT
  DATE_TRUNC('hour', pickup_datetime) AS hour,
  COUNT(*) AS total_trips,
  ROUND(AVG(trip_distance), 2) AS avg_distance_miles,
  ROUND(AVG(total_amount), 2) AS avg_fare_usd,
  ROUND(AVG(tip_amount), 2) AS avg_tip_usd,
  SUM(passenger_count) AS total_passengers
FROM {{ ref('stg_nyc_taxi') }}
WHERE pickup_datetime IS NOT NULL
GROUP BY 1
