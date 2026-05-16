# Database Migrations Guide

This guide explains what database migrations are, how they work in this project, and how to write new ones.

---

## What is a database migration?

A migration is a versioned SQL script that makes a specific, intentional change to the database schema (its structure). Instead of modifying the database by hand and hoping everyone else does the same, migrations create a recorded history of every change — like version control for your database.

**Without migrations:**
- Developer A adds a table on their laptop
- Developer B doesn't know about it
- CI has a different schema than local
- Production has yet another version
- Nobody knows what the "correct" state is

**With migrations:**
- Every schema change is a file in the repo
- Anyone can recreate the exact schema by running the files in order
- CI uses the same process as local
- The history of every change is preserved in git

---

## How migrations work in this project

Migration files live in `db/migrations/` and are numbered sequentially:

```
db/migrations/
├── 001_init_schemas.sql
├── 002_create_titanic.sql
└── 003_create_nyc_taxi.sql
```

### On first Docker startup

When `docker compose up -d postgres` runs against an empty volume, Postgres automatically executes every `.sql` file in its init directory. In this project, `db/migrations/` is mounted there via Docker Compose:

```yaml
volumes:
  - ./db/migrations:/docker-entrypoint-initdb.d
```

**Important:** this only happens once — when the data volume is empty. After that, Postgres ignores the init directory. To re-run migrations from scratch, you must delete the volume:

```bash
docker compose down -v   # removes the postgres_data volume
docker compose up -d postgres  # recreates it, runs all migrations again
```

### In CI

The GitHub Actions workflow runs migrations manually using a shell loop:

```bash
for f in $(ls db/migrations/*.sql | sort); do
  psql -h localhost -U poc_user -d poc_db -f "$f"
done
```

This works the same in CI as it does locally.

---

## Writing a new migration

### Step 1: Choose the next number

If the last file is `003_create_nyc_taxi.sql`, your new file must be `004_`.

```bash
ls db/migrations/
# 001_init_schemas.sql
# 002_create_titanic.sql
# 003_create_nyc_taxi.sql
# → Next file: 004_your_description.sql
```

### Step 2: Create the file

Use a descriptive name that explains what the migration does:

```bash
touch db/migrations/004_add_weather_table.sql
```

Good names:
- `004_add_weather_table.sql`
- `005_add_index_on_titanic_pclass.sql`
- `006_create_analytics_weather_summary.sql`

Bad names:
- `004_changes.sql` (too vague)
- `004_fix.sql` (fix what?)

### Step 3: Write the SQL

Use `IF NOT EXISTS` / `IF EXISTS` on every statement so the migration is safe to run multiple times (idempotent):

```sql
-- 004_add_weather_table.sql
-- Adds a staging table for weather data and its analytics view

CREATE TABLE IF NOT EXISTS staging.weather (
  id          SERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL,
  city        VARCHAR(100) NOT NULL,
  temp_c      NUMERIC(5, 2),
  humidity_pct SMALLINT,
  condition   VARCHAR(50),
  loaded_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weather_city_date
  ON staging.weather (city, recorded_at);

CREATE OR REPLACE VIEW analytics.weather_daily AS
SELECT
  DATE_TRUNC('day', recorded_at) AS day,
  city,
  ROUND(AVG(temp_c), 1)         AS avg_temp_c,
  ROUND(AVG(humidity_pct), 0)   AS avg_humidity_pct,
  COUNT(*)                      AS readings
FROM staging.weather
GROUP BY 1, 2
ORDER BY 1, 2;
```

### Step 4: Test locally

```bash
# Make sure postgres is running
docker compose up -d postgres

# Run your new migration manually
PGPASSWORD=poc_password psql -h localhost -U poc_user -d poc_db \
  -f db/migrations/004_add_weather_table.sql

# Verify the table exists
PGPASSWORD=poc_password psql -h localhost -U poc_user -d poc_db \
  -c "\dt staging.*"
```

### Step 5: Commit and push

```bash
git add db/migrations/004_add_weather_table.sql
git commit -m "feat: add staging.weather table and daily analytics view"
git push
```

The `db-migrate.yml` CI workflow will automatically run all migrations against a fresh Postgres instance and verify the result.

---

## SQL patterns and conventions

### Always use `IF NOT EXISTS`

```sql
-- ✅ Safe to run multiple times
CREATE TABLE IF NOT EXISTS staging.my_table (...);
CREATE INDEX IF NOT EXISTS idx_name ON staging.my_table (...);

-- ❌ Fails on second run
CREATE TABLE staging.my_table (...);
```

### Always include `loaded_at`

Every staging table gets a timestamp column recording when the row was inserted:

```sql
loaded_at TIMESTAMPTZ DEFAULT NOW()
```

This lets you track data freshness and debug pipeline runs.

### Prefer `NUMERIC` over `FLOAT` for money and measurements

```sql
fare  NUMERIC(10, 4)   -- ✅ exact decimal arithmetic
fare  FLOAT            -- ❌ floating point rounding errors
```

`NUMERIC(10, 4)` means up to 10 total digits, 4 after the decimal point.

### Use `TIMESTAMPTZ`, not `TIMESTAMP`

```sql
recorded_at TIMESTAMPTZ   -- ✅ stores timezone info; safe across timezones
recorded_at TIMESTAMP     -- ❌ naive timestamp; can cause issues with DST
```

### `CREATE OR REPLACE VIEW` for views

Views can always be updated with `CREATE OR REPLACE`:

```sql
CREATE OR REPLACE VIEW analytics.titanic_survival_summary AS
SELECT ...;
```

If you need to change a view's column list (adding/removing/renaming columns), you must `DROP VIEW` first and then recreate it — `CREATE OR REPLACE` only allows changing the query body, not the output columns.

---

## What goes in seeds vs migrations?

| Type | Folder | Purpose | Runs |
|---|---|---|---|
| **Migration** | `db/migrations/` | Schema changes (CREATE TABLE, ALTER TABLE, CREATE VIEW) | Once, in order, tracked |
| **Seed** | `db/seeds/` | Sample data for development and testing | Manually, via `npx ts-node src/index.ts seed` |

Seeds are not migrations. They are convenience data for local development. Never put sample data in a migration file.

---

## What NOT to do

**Never rename or renumber an existing migration file.** If `002_create_titanic.sql` has already run on any environment, renaming it breaks everything — the next run won't know `002_` already executed and may skip or re-run it.

**Never modify an existing migration file.** If you need to change the schema, write a new migration. For example, to add a column to `staging.titanic`:

```sql
-- ❌ Don't edit 002_create_titanic.sql
-- ✅ Create 004_add_titanic_country_col.sql:

ALTER TABLE staging.titanic
  ADD COLUMN IF NOT EXISTS country VARCHAR(100);
```

**Never put credentials or secrets in migration files.** Migrations are committed to git and visible to everyone with repo access.

**Never write DROP TABLE without strong justification.** Dropping a table in a migration permanently deletes data in any environment where that migration runs. If you need to remove a table, discuss it first and ensure all environments have backups.

---

## Running seeds

Seeds are separate from migrations and must be run manually:

```bash
cd app
npx ts-node src/index.ts seed
```

This runs every `.sql` file in `db/seeds/` in alphabetical order. The seed command is safe to run multiple times because the SQL uses `ON CONFLICT DO NOTHING`.
