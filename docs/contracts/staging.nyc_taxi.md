# Data Contract: staging.nyc_taxi

## Owner
**Individual:** Platform Engineering  
**Contact:** See repository maintainer in CONTRIBUTING.md  
**Last reviewed:** 2026-05-25

---

## Description

`staging.nyc_taxi` contains NYC taxi trip records ingested from the 
Kaggle NYC Taxi Fare Prediction dataset. It is the bronze layer for 
all taxi analytics in this platform. Records are loaded in batches 
of up to 50,000 rows for the PoC scope.

This table serves as the source for:
- `dbt/models/staging/stg_nyc_taxi.sql` — normalized staging model
- `analytics.nyc_taxi_hourly` — hourly aggregation view
- `/api/taxi` — REST API endpoints
- Airflow DAG `data_platform_batch` — scheduled ingestion

In production, this table would be partitioned by `pickup_datetime` 
date and the 50,000 row cap would be removed. See 
[ADR 006](../decisions/006-scale-and-cost-considerations.md) for 
production scale reasoning.

---

## Schema

| Column | Type | Nullable | Description | Stability |
|---|---|---|---|---|
| `id` | SERIAL | No | Surrogate primary key assigned at load time | Stable |
| `vendor_id` | SMALLINT | Yes | Taxi vendor identifier (1 or 2) | Stable |
| `pickup_datetime` | TIMESTAMPTZ | Yes | Trip start timestamp with timezone | Stable |
| `dropoff_datetime` | TIMESTAMPTZ | Yes | Trip end timestamp with timezone | Stable |
| `passenger_count` | SMALLINT | Yes | Number of passengers (1–6 after cleaning) | Stable |
| `trip_distance` | NUMERIC(8,2) | Yes | Trip distance in miles (>0 after cleaning) | Stable |
| `pickup_longitude` | NUMERIC(11,6) | Yes | GPS longitude of pickup location | Stable |
| `pickup_latitude` | NUMERIC(11,6) | Yes | GPS latitude of pickup location | Stable |
| `rate_code_id` | SMALLINT | Yes | Rate type code | Stable |
| `store_and_fwd_flag` | CHAR(1) | Yes | Y/N offline storage flag | Stable |
| `dropoff_longitude` | NUMERIC(11,6) | Yes | GPS longitude of dropoff location | Stable |
| `dropoff_latitude` | NUMERIC(11,6) | Yes | GPS latitude of dropoff location | Stable |
| `payment_type` | SMALLINT | Yes | Payment method code | Stable |
| `fare_amount` | NUMERIC(8,2) | Yes | Base fare in USD (>0 after cleaning) | Stable |
| `extra` | NUMERIC(8,2) | Yes | Surcharges and extras | Stable |
| `mta_tax` | NUMERIC(8,2) | Yes | MTA tax amount | Stable |
| `tip_amount` | NUMERIC(8,2) | Yes | Tip amount in USD | Stable |
| `tolls_amount` | NUMERIC(8,2) | Yes | Toll charges | Stable |
| `total_amount` | NUMERIC(8,2) | Yes | Total charged amount | Stable |
| `source_row_hash` | TEXT | Yes | Hash of source row for deduplication | Stable |
| `loaded_at` | TIMESTAMPTZ | No | Pipeline load timestamp | Stable |

---

## Cleaning Contract

The following transformations are applied during ingestion before 
records reach this table. Consumers may depend on these guarantees:

| Guarantee | Implementation | Failure mode if violated |
|---|---|---|
| `fare_amount > 0` | Rows with zero or negative fares are dropped | Fare aggregations include non-revenue trips |
| `trip_distance > 0` | Rows with zero distance are dropped | Distance aggregations are distorted |
| `passenger_count` between 1 and 6 inclusive | Out-of-range rows are dropped | Passenger analytics include data errors |
| `source_row_hash` is non-null | Computed from all source columns at load time | Incremental deduplication fails |

Consumers should not apply these filters downstream. If records 
violating these guarantees appear in the table, it indicates a 
pipeline regression and should be treated as a data incident.

---

## Quality Guarantees

The following expectations are enforced by the Great Expectations 
suite at `orchestration/great_expectations/expectations/nyc_taxi_staging.json` 
before any downstream dbt transformation runs:

- Row count between 1,000 and 50,000
- `pickup_datetime` is non-null for all rows
- `source_row_hash` is non-null and unique across all rows
- `passenger_count` is between 1 and 6
- `fare_amount` is greater than 0
- `trip_distance` is greater than 0
- Median `fare_amount` is between $8 and $15

If any expectation fails, the Airflow DAG halts before dbt runs. 
No analytics output is produced from bad staging data.

---

## SLA

**Freshness:** Updated on each DAG run. Default schedule is daily.  
**Latency:** Data is available in this table within the pipeline 
run window after source availability. Typical pipeline runtime 
is under 5 minutes for the PoC dataset size.  
**Availability:** This table is available whenever the Postgres 
instance is healthy. No high-availability guarantee exists in 
the local PoC deployment. In production, this maps to Cloud SQL 
or BigQuery availability SLAs.  
**Backfill behavior:** Full refresh mode truncates and reloads 
the entire table. Incremental mode appends only records newer 
than the current watermark. See 
`orchestration/pipeline_watermarks` for current watermark state.

---

## Breaking Change Policy

The following are breaking changes that require advance notice 
to all consumers before landing:

- Removing any column marked **Stable**
- Changing the type of any column marked **Stable**
- Changing the cleaning contract (adding or removing row filters)
- Changing the `source_row_hash` computation method

The following are non-breaking changes that do not require 
advance notice:

- Adding a new nullable column
- Changing a column marked **Unstable**
- Updating `loaded_at` timezone handling
- Changing pipeline performance characteristics without 
  affecting output

**Process for breaking changes:**  
1. Open a pull request with the proposed change
2. Update this contract document in the same PR
3. Identify all consumers listed below and notify them
4. Allow a minimum one-sprint deprecation window before 
   the breaking change lands in production

---

## Known Limitations

**50,000 row cap:** The PoC loads a maximum of 50,000 rows from 
the source dataset. The full Kaggle dataset contains approximately 
55 million rows. Analytics derived from this table are not 
representative of full production volumes.

**GPS coordinate validity:** Latitude and longitude columns are 
not validated for NYC bounding box in the staging table itself. 
This validation is applied in `stg_nyc_taxi` dbt model. Consumers 
reading directly from `staging.nyc_taxi` should apply their own 
coordinate validation.

**Timezone assumptions:** `pickup_datetime` and `dropoff_datetime` 
are stored as TIMESTAMPTZ. Source data is in US Eastern time. The 
pipeline does not explicitly set the timezone during load — it 
relies on the Postgres session timezone configuration. In a 
production deployment this should be made explicit.

---

## Consumers

| Consumer | Type | Contact |
|---|---|---|
| `dbt/models/staging/stg_nyc_taxi.sql` | dbt model | Platform |
| `analytics.nyc_taxi_hourly` | Postgres view | Platform |
| `web/server/src/routes/nyc_taxi.ts` | REST API | Platform |
| `orchestration/airflow/dags/data_platform_dag.py` | Airflow DAG | Platform |