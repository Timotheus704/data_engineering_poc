SELECT
  pclass,
  sex,
  COUNT(*) AS total_passengers,
  SUM(survived) AS survivors,
  ROUND(AVG(survived) * 100, 2) AS survival_rate_pct,
  ROUND(AVG(age), 1) AS avg_age,
  ROUND(AVG(fare), 2) AS avg_fare
FROM {{ ref('stg_titanic') }}
WHERE age IS NOT NULL
GROUP BY pclass, sex
