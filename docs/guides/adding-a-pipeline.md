# Adding a New Data Pipeline

This guide walks you through adding a brand new Kaggle dataset to the project — from finding the dataset to querying it from the TypeScript CLI.

---

## Overview

Adding a new dataset involves four steps:

1. Create a database migration for the new table
2. Write the Python ingestion script
3. Add the service to `docker-compose.yml`
4. Add TypeScript query functions and a CLI command

We will use a fictional `weather_data` dataset as the example throughout.

---

## Step 1 — Find your Kaggle dataset

1. Go to https://www.kaggle.com/datasets and find a dataset you want to use
2. Note the dataset slug — it appears in the URL: `kaggle.com/datasets/USERNAME/DATASET-SLUG`
3. Make sure you have accepted the dataset's terms (click "Download" on the Kaggle website at least once)

For competition datasets, the slug is the competition name (e.g. `titanic`, `new-york-city-taxi-fare-prediction`).

---

## Step 2 — Write the database migration

Create a new migration file with the next available number:

```bash
# Check the last migration number
ls db/migrations/
# 001_init_schemas.sql
# 002_create_titanic.sql
# 003_create_nyc_taxi.sql
# → Next: 004_create_weather.sql
```

```sql
-- db/migrations/004_create_weather.sql
-- Staging table and analytics view for weather data

CREATE TABLE IF NOT EXISTS staging.weather (
  id           SERIAL PRIMARY KEY,
  city         VARCHAR(100) NOT NULL,
  country      VARCHAR(100),
  recorded_at  TIMESTAMPTZ NOT NULL,
  temp_c       NUMERIC(5, 2),
  humidity_pct SMALLINT,
  wind_kph     NUMERIC(6, 2),
  condition    VARCHAR(100),
  loaded_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weather_city      ON staging.weather (city);
CREATE INDEX IF NOT EXISTS idx_weather_recorded  ON staging.weather (recorded_at);

CREATE OR REPLACE VIEW analytics.weather_city_summary AS
SELECT
  city,
  country,
  COUNT(*)                        AS total_readings,
  ROUND(AVG(temp_c), 1)          AS avg_temp_c,
  ROUND(MIN(temp_c), 1)          AS min_temp_c,
  ROUND(MAX(temp_c), 1)          AS max_temp_c,
  ROUND(AVG(humidity_pct), 0)    AS avg_humidity_pct
FROM staging.weather
GROUP BY city, country
ORDER BY city;
```

Apply the migration locally:

```bash
PGPASSWORD=poc_password psql -h localhost -U poc_user -d poc_db \
  -f db/migrations/004_create_weather.sql
```

---

## Step 3 — Write the Python ingestion script

Create a new folder and `ingest.py`:

```bash
mkdir -p pipelines/weather
touch pipelines/weather/ingest.py
```

```python
# pipelines/weather/ingest.py
"""
Weather pipeline: download from Kaggle → clean → load into staging.weather
Run: python weather/ingest.py
"""
import sys
import subprocess
import pandas as pd
from pathlib import Path
from db import get_engine

# Update these to match your actual Kaggle dataset
KAGGLE_TYPE   = "datasets"                  # "datasets" or "competitions"
KAGGLE_SLUG   = "username/weather-dataset"  # from the Kaggle URL
DATA_DIR      = Path(__file__).parent / "data"
CSV_FILE      = DATA_DIR / "weather_data.csv"  # filename inside the zip
TABLE         = "weather"
SCHEMA        = "staging"


def download_data() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    if CSV_FILE.exists():
        print(f"[weather] Data already downloaded: {CSV_FILE}")
        return
    print("[weather] Downloading from Kaggle...")
    result = subprocess.run(
        ["kaggle", KAGGLE_TYPE, "download", "-d", KAGGLE_SLUG,
         "-p", str(DATA_DIR), "--unzip"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"[weather] Download failed:\n{result.stderr}")
        sys.exit(1)
    print("[weather] Download complete.")


def load_and_clean() -> pd.DataFrame:
    df = pd.read_csv(CSV_FILE, parse_dates=["recorded_at"])

    # Rename columns to match your DB schema
    df = df.rename(columns={
        "City":        "city",
        "Country":     "country",
        "RecordedAt":  "recorded_at",
        "TempC":       "temp_c",
        "Humidity":    "humidity_pct",
        "WindKPH":     "wind_kph",
        "Condition":   "condition",
    })

    # Drop rows missing critical fields
    df = df.dropna(subset=["city", "recorded_at"])

    # Clamp values to reasonable ranges
    df["humidity_pct"] = df["humidity_pct"].clip(0, 100)

    print(f"[weather] Loaded {len(df):,} rows after cleaning")
    return df


def ingest(df: pd.DataFrame) -> None:
    engine = get_engine()
    with engine.begin() as conn:
        conn.exec_driver_sql(f"TRUNCATE {SCHEMA}.{TABLE} RESTART IDENTITY")
    df.to_sql(
        TABLE, engine, schema=SCHEMA,
        if_exists="append", index=False,
        method="multi", chunksize=1000
    )
    print(f"[weather] Inserted {len(df):,} rows into {SCHEMA}.{TABLE}")


def run_analysis(df: pd.DataFrame) -> None:
    import matplotlib.pyplot as plt

    reports = Path(__file__).parent.parent / "reports"
    reports.mkdir(exist_ok=True)

    fig, ax = plt.subplots(figsize=(12, 5))
    city_temps = df.groupby("city")["temp_c"].mean().sort_values(ascending=False).head(15)
    city_temps.plot(kind="bar", ax=ax, color="steelblue", edgecolor="white")
    ax.set_title("Top 15 Cities — Average Temperature")
    ax.set_ylabel("°C")
    ax.set_xlabel("")
    plt.xticks(rotation=45, ha="right")

    out = reports / "weather_analysis.png"
    fig.savefig(out, dpi=120, bbox_inches="tight")
    print(f"[weather] Saved chart to {out}")


if __name__ == "__main__":
    download_data()
    df = load_and_clean()
    ingest(df)
    run_analysis(df)
    print("[weather] Pipeline complete ✅")
```

**Test it locally (outside Docker):**

```bash
cd pipelines
pip install -r requirements.txt

# Override host to localhost since we're running outside Docker
POSTGRES_HOST=localhost python weather/ingest.py
```

---

## Step 4 — Add to docker-compose.yml

Open `docker-compose.yml` and add a new service following the same pattern as the other pipelines:

```yaml
  pipeline_weather:
    build:
      context: ./pipelines
      dockerfile: Dockerfile
    container_name: poc_pipeline_weather
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./pipelines:/pipelines
      - ${HOME}/.kaggle:/root/.kaggle:ro
    command: python weather/ingest.py
    profiles: [pipeline]
```

Test it with Docker:

```bash
docker compose --profile pipeline up pipeline_weather
```

---

## Step 5 — Add TypeScript types

Open `app/src/db/types.ts` and add interfaces for the new table:

```typescript
/** Raw row from staging.weather */
export interface WeatherRow {
  id: number;
  city: string;
  country: string | null;
  recorded_at: Date;
  temp_c: number | null;
  humidity_pct: number | null;
  wind_kph: number | null;
  condition: string | null;
  loaded_at: Date;
}

/** Row from analytics.weather_city_summary */
export interface WeatherCitySummary {
  city: string;
  country: string | null;
  total_readings: number;
  avg_temp_c: number;
  min_temp_c: number;
  max_temp_c: number;
  avg_humidity_pct: number;
}
```

---

## Step 6 — Add query functions

Create `app/src/queries/weather.ts`:

```typescript
import { query } from '../db/client';
import type { WeatherRow, WeatherCitySummary } from '../db/types';

/** Fetch recent weather readings, optionally filtered by city */
export async function getWeatherReadings(
  limit = 20,
  city?: string
): Promise<WeatherRow[]> {
  if (city) {
    return query<WeatherRow>(
      `SELECT * FROM staging.weather
       WHERE LOWER(city) = LOWER($1)
       ORDER BY recorded_at DESC LIMIT $2`,
      [city, limit]
    );
  }
  return query<WeatherRow>(
    `SELECT * FROM staging.weather ORDER BY recorded_at DESC LIMIT $1`,
    [limit]
  );
}

/** City temperature summary from analytics view */
export async function getWeatherCitySummary(): Promise<WeatherCitySummary[]> {
  return query<WeatherCitySummary>(
    `SELECT * FROM analytics.weather_city_summary`
  );
}

/** Count total rows in staging.weather */
export async function getWeatherCount(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM staging.weather`
  );
  return parseInt(rows[0].count, 10);
}
```

---

## Step 7 — Add CLI commands

Open `app/src/index.ts` and add a command group (follow the same pattern as the `titanic` and `taxi` groups):

```typescript
import { getWeatherReadings, getWeatherCitySummary, getWeatherCount } from './queries/weather';

const weather = program.command('weather').description('Weather dataset commands');

weather
  .command('list')
  .description('List recent weather readings')
  .option('-l, --limit <n>', 'number of rows', '10')
  .option('-c, --city <name>', 'filter by city name')
  .action(async (opts) => {
    const rows = await getWeatherReadings(parseInt(opts.limit), opts.city);
    const total = await getWeatherCount();
    console.log(`\nWeather readings (${total} total)\n`);
    for (const r of rows) {
      const dt = new Date(r.recorded_at).toISOString().slice(0, 10);
      const temp = r.temp_c != null ? `${r.temp_c}°C` : 'N/A';
      console.log(`  ${dt}  ${r.city.padEnd(20)} ${temp.padEnd(8)} ${r.condition ?? ''}`);
    }
  });

weather
  .command('summary')
  .description('Temperature summary by city from analytics view')
  .action(async () => {
    const rows = await getWeatherCitySummary();
    console.log('\nWeather — city summary\n');
    console.log('City                 Country        Readings  Avg °C  Min °C  Max °C');
    console.log('─'.repeat(72));
    for (const r of rows) {
      console.log(
        `${r.city.padEnd(21)}${(r.country ?? '').padEnd(15)}` +
        `${String(r.total_readings).padEnd(10)}${String(r.avg_temp_c).padEnd(8)}` +
        `${String(r.min_temp_c).padEnd(8)}${r.max_temp_c}`
      );
    }
  });
```

Test the new commands:

```bash
cd app
npx ts-node src/index.ts weather list
npx ts-node src/index.ts weather list --city London --limit 5
npx ts-node src/index.ts weather summary
```

---

## Checklist

Use this to verify you haven't missed anything:

- [ ] Created migration file with correct numeric prefix
- [ ] Used `IF NOT EXISTS` on all DDL statements
- [ ] Added `loaded_at TIMESTAMPTZ DEFAULT NOW()` to staging table
- [ ] Applied migration locally and verified table exists
- [ ] Created `pipelines/<dataset>/ingest.py`
- [ ] Script truncates before inserting (idempotent)
- [ ] Script reads from `db.get_engine()`, not hardcoded credentials
- [ ] Added service to `docker-compose.yml` with `profiles: [pipeline]`
- [ ] Added TypeScript interfaces to `db/types.ts` with correct nullable types
- [ ] Created `queries/<dataset>.ts` with typed query functions
- [ ] Added CLI commands to `index.ts`
- [ ] Ran `npx tsc --noEmit` and it passes with no errors
- [ ] Updated `CLAUDE.md` to mention the new dataset
