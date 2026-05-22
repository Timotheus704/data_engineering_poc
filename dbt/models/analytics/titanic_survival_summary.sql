SELECT
  passenger_class_num,
  sex,
  COUNT(*) AS total_passengers,
  count(CASE WHEN did_survive THEN 1 END) AS survivors,
  ROUND(AVG(CAST(did_survive AS integer)) * 100, 2) AS survival_rate_pct,
  ROUND(AVG(age_years), 1) AS avg_age,
  ROUND(AVG(fare_gbp), 2) AS avg_fare
FROM {{ ref('stg_titanic') }}
WHERE age_years IS NOT NULL
GROUP BY passenger_class_num, sex
