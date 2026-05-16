# CLI Reference

Complete reference for all commands in the TypeScript CLI application.

All commands are run from the `app/` directory:
```bash
npx ts-node src/index.ts <command> [options]
```

---

## Global options

| Option | Description |
|---|---|
| `--version` | Print the app version |
| `--help` | Print help for a command or subcommand |

```bash
npx ts-node src/index.ts --help
npx ts-node src/index.ts titanic --help
npx ts-node src/index.ts titanic list --help
```

---

## `ping`

Check database connectivity and print the Postgres server version.

```bash
npx ts-node src/index.ts ping
```

**Example output:**
```
✅ Connected to: PostgreSQL 16.3 on aarch64-unknown-linux-musl, compiled by gcc...
```

**Use this to:** verify your environment is set up correctly before running other commands.

---

## `tables`

List all tables in the `staging` and `analytics` schemas along with their row counts.

```bash
npx ts-node src/index.ts tables
```

**Example output:**
```
Schema          Table                     Rows
───────────────────────────────────────────────────────
staging         nyc_taxi                  48921
staging         titanic                   891
```

**Note:** Row counts come from `pg_stat_user_tables`, which Postgres updates periodically. After a bulk insert the count may lag briefly. Run `ANALYZE staging.titanic;` to force an update.

---

## `seed`

Load sample data from the `db/seeds/` SQL files into the database.

```bash
npx ts-node src/index.ts seed
```

**Example output:**
```
Running seed: 001_sample_data.sql
✅ Seed complete.
```

Seeds are idempotent (`ON CONFLICT DO NOTHING`) — safe to run multiple times. Use this to get sample data without needing a Kaggle account.

---

## `titanic`

Commands for the Titanic passenger dataset.

### `titanic list`

List passengers from `staging.titanic`.

```bash
npx ts-node src/index.ts titanic list [options]
```

| Option | Default | Description |
|---|---|---|
| `-l, --limit <n>` | `10` | Number of rows to return |
| `-o, --offset <n>` | `0` | Number of rows to skip (for pagination) |

**Examples:**
```bash
# First 10 passengers (default)
npx ts-node src/index.ts titanic list

# First 25 passengers
npx ts-node src/index.ts titanic list --limit 25

# Passengers 21–40 (second page of 20)
npx ts-node src/index.ts titanic list --limit 20 --offset 20
```

**Example output:**
```
Titanic passengers (891 total)

  ❌ [1] Braund, Mr. Owen Harris — Class 3, Age 22
  ✅ [2] Cumings, Mrs. John Bradley — Class 1, Age 38
  ✅ [3] Heikkinen, Miss. Laina — Class 3, Age 26
```

✅ = survived, ❌ = did not survive

### `titanic summary`

Show survival rates broken down by passenger class and sex, from `analytics.titanic_survival_summary`.

```bash
npx ts-node src/index.ts titanic summary
```

**Example output:**
```
Survival summary

Class  Sex       Total  Survived  Rate     Avg Age  Avg Fare
─────────────────────────────────────────────────────────────────
1      female    85     80        94.12    34.6     $106.13
1      male      101    36        35.64    41.3     $67.23
2      female    74     70        94.59    28.7     $21.97
2      male      108    17        15.74    30.8     $19.74
3      female    144    72        50.0     21.8     $12.46
3      male      300    47        15.67    26.5     $8.10
```

---

## `taxi`

Commands for the NYC Taxi trip dataset.

### `taxi list`

List taxi trips from `staging.nyc_taxi`.

```bash
npx ts-node src/index.ts taxi list [options]
```

| Option | Default | Description |
|---|---|---|
| `-l, --limit <n>` | `10` | Number of rows to return |
| `--min-fare <n>` | `0` | Only show trips with fare ≥ this amount (USD) |

**Examples:**
```bash
# First 10 trips
npx ts-node src/index.ts taxi list

# 20 trips with fare over $20
npx ts-node src/index.ts taxi list --limit 20 --min-fare 20
```

**Example output:**
```
NYC Taxi trips (48921 total)

  2015-01-15T09:32  2 pax  3.5mi  $14.30
  2015-01-15T09:41  1 pax  1.2mi  $7.80
  2015-01-15T10:02  4 pax  12.1mi $42.00
```

### `taxi hourly`

Show hourly aggregations from `analytics.nyc_taxi_hourly`.

```bash
npx ts-node src/index.ts taxi hourly
```

**Example output:**
```
NYC Taxi — hourly summary

Hour                 Trips   Avg Dist  Avg Fare  Avg Tip
────────────────────────────────────────────────────────────
2015-01-01T00     142     2.31      $11.20    $1.45
2015-01-01T01     98      3.10      $13.80    $1.22
2015-01-01T02     76      2.89      $12.40    $0.98
```

---

## `query <sql>`

Run an arbitrary `SELECT` query against the database and print results as a table.

```bash
npx ts-node src/index.ts query "<sql>"
```

**Safety:** Only `SELECT` and `WITH` (CTE) statements are allowed. The command will reject any other statement type.

**Examples:**
```bash
# Count rows
npx ts-node src/index.ts query "SELECT COUNT(*) FROM staging.titanic"

# View the analytics view directly
npx ts-node src/index.ts query "SELECT * FROM analytics.titanic_survival_summary"

# Multi-schema join
npx ts-node src/index.ts query "SELECT pclass, COUNT(*) FROM staging.titanic GROUP BY pclass ORDER BY pclass"

# CTE example
npx ts-node src/index.ts query "WITH survivors AS (SELECT * FROM staging.titanic WHERE survived = 1) SELECT sex, COUNT(*) FROM survivors GROUP BY sex"
```

**Example output:**
```
3 row(s)

┌─────────┬────────┐
│ pclass  │ count  │
├─────────┼────────┤
│ 1       │ 216    │
│ 2       │ 184    │
│ 3       │ 491    │
└─────────┴────────┘
```

**Tip:** Wrap your SQL in double quotes. If your query contains double quotes, use single quotes inside the SQL string.

---

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Error — details printed to stderr |

CI and shell scripts can use these to detect failures:
```bash
npx ts-node src/index.ts ping && echo "DB is up" || echo "DB is down"
```
