# Production Architecture Roadmap

This document describes what the PoC architecture would evolve into at production
scale. Understanding the gap between a PoC and a production system is a key
senior engineering competency.

---

## Current PoC vs Production Comparison

| Concern | PoC (Current) | Production Target |
|---|---|---|
| Storage | Postgres only | Postgres + object storage (S3/GCS) + columnar format |
| Data format | CSV → Postgres rows | Parquet/Delta Lake/Iceberg on object storage |
| Ingestion | Full refresh or simple watermark | Event streaming (Kafka) + batch |
| Scale | 50k rows | Billions of rows |
| Orchestration | Airflow local | Airflow on Kubernetes (MWAA/Composer) |
| Serving | Postgres analytics views | Dedicated OLAP (Snowflake/BigQuery/Redshift) |
| Observability | pino logs + /metrics | OpenTelemetry → Jaeger/Grafana stack |
| CI/CD | GitHub Actions (migrations + TS) | Terraform for infra + dbt Cloud for transforms |

---

## The Data Lakehouse Pattern

The most significant architectural evolution would be adopting the **data lakehouse**
pattern, which combines the low cost and flexibility of a data lake with the SQL
accessibility of a data warehouse.

```
Raw Data Sources
      │
      ▼
[Kafka Topics]  ←── Streaming events (user actions, IoT, etc.)
[S3 Raw Zone]   ←── Batch files (CSV, JSON, Parquet)
      │
      ▼
[Apache Spark / Flink]
   Extract → Transform → Load
      │
      ▼
[Delta Lake / Apache Iceberg]
   Columnar Parquet on S3 with ACID transactions
   Time travel, schema evolution, partition pruning
      │
      ▼
[dbt on Databricks / Snowflake]
   Transformation layer (currently on Postgres)
      │
      ▼
[Serving Layer]
   - BI tools (Tableau, Looker) → OLAP warehouse
   - APIs → Postgres read replica
   - ML features → Feature store (Feast)
```

**Why Delta Lake / Iceberg instead of just Postgres?**
At 50k rows, Postgres is ideal. At 50 billion rows, a columnar format on object
storage is 100-1000x cheaper to query and store. Iceberg specifically adds:
- **ACID transactions** on object storage (prevents partial writes)
- **Time travel** (query data as of any point in time)
- **Schema evolution** (add columns without rewriting all data)
- **Partition pruning** (skip reading irrelevant data files)

---

## Streaming Architecture

The NYC taxi pipeline currently processes batch CSV files. A production system
would use streaming:

```
Taxi Dispatch System
      │  Kafka Producer
      ▼
[Kafka Topic: taxi.trips.raw]
      │
      ├──► [Flink Job: Real-time aggregation]
      │         └── Sliding window trip counts, avg fare
      │         └── Writes to Redis for live dashboard
      │
      └──► [Spark Streaming: Micro-batch to lakehouse]
                └── Deduplication via source_row_hash
                └── Writes to Delta Lake partition by pickup_date
                └── Triggers dbt incremental models
```

**Why Kafka?** Decouples producers from consumers. The taxi dispatch system doesn't
need to know about our analytics pipeline — it just publishes events. Multiple
consumers can read the same events independently.

---

## Observability Stack

The current PoC has structured logging via pino and a `/metrics` endpoint.
Production would wire these into a full observability stack:

```
Fastify API
  │  OpenTelemetry SDK
  │  (traces, metrics, logs)
  ▼
[OpenTelemetry Collector]
      │
      ├──► Jaeger (distributed tracing)
      ├──► Prometheus (metrics scraping)
      └──► Loki (log aggregation)
              │
              ▼
          Grafana (unified dashboard)
```

The X-Request-Id correlation ID already in this codebase is the first step —
it would become an OpenTelemetry trace ID that propagates through every service.

---

## Data Quality at Scale

Great Expectations works well for batch validation. At scale:

- **Monte Carlo / Bigeye** for automated anomaly detection on production tables
- **dbt tests** remain but run as part of Airflow DAG, not just on-demand
- **Data contracts** (using Protobuf or Avro schemas on Kafka topics) prevent
  upstream producers from silently changing schemas
- **PagerDuty integration** on GX failures — not just a pipeline stop

---

## Next Steps for This Repo

If you want to take this PoC further, the highest-value additions in order are:

1. **Add Apache Kafka** with a simple producer/consumer demo using the taxi data
2. **Add OpenTelemetry** instrumentation to the Fastify API
3. **Add a Delta Lake / Iceberg layer** via DuckDB (runs locally, no Spark needed)
4. **Add a Feature Store demo** using Feast with the titanic survival prediction features
5. **Add Terraform** for infra-as-code demonstration (even just for the Docker network config)