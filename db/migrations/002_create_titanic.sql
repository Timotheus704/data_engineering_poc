-- 002_create_titanic.sql
-- Staging table for raw Titanic dataset ingestion

CREATE TABLE IF NOT EXISTS staging.titanic (
  id          SERIAL PRIMARY KEY,
  passenger_id INTEGER,
  survived    SMALLINT,
  pclass      SMALLINT,
  name        TEXT,
  sex         VARCHAR(10),
  age         NUMERIC(5, 2),
  sib_sp      SMALLINT,
  parch       SMALLINT,
  ticket      VARCHAR(50),
  fare        NUMERIC(10, 4),
  cabin       VARCHAR(20),
  embarked    CHAR(1),
  loaded_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics view: survival rate by class and sex
CREATE OR REPLACE VIEW analytics.titanic_survival_summary AS
SELECT
  pclass,
  sex,
  COUNT(*)                                          AS total_passengers,
  SUM(survived)                                     AS survivors,
  ROUND(AVG(survived) * 100, 2)                     AS survival_rate_pct,
  ROUND(AVG(age), 1)                                AS avg_age,
  ROUND(AVG(fare), 2)                               AS avg_fare
FROM staging.titanic
WHERE age IS NOT NULL
GROUP BY pclass, sex
ORDER BY pclass, sex;
