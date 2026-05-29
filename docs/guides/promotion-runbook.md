# Promotion Runbook: Local to Production

This document describes how to promote the data platform from the 
local Docker Compose environment to production GCP infrastructure. 
It is written as a decision guide, not a step-by-step tutorial — 
each phase requires engineering judgment about readiness, not just 
execution of commands.

---

## Promotion Philosophy

This repository is structured so that each component can be promoted 
independently. The data contracts, ADRs, and DEVELOPER_GUIDE 
conventions travel with each component. What changes between 
environments is infrastructure, not architecture.

The promotion path is designed to be incremental. You do not need 
to promote all components simultaneously. A common sequence is:

1. Promote infrastructure (Terraform → GCP)
2. Promote pipelines (local Python → Cloud Run Jobs)
3. Promote orchestration (local Airflow → Cloud Composer)
4. Promote transformations (local dbt → dbt Cloud)
5. Promote API and visualization (local Docker → Cloud Run)

Each phase is independently deployable and independently rollback-able.

---

## Prerequisites

Before any component is promoted, the following must be true:

- [ ] A GCP project exists with billing enabled
- [ ] Terraform state backend is configured (GCS bucket with versioning)
- [ ] GitHub Actions secrets are configured for GCP service account 
      credentials
- [ ] The Terraform modules in `infra/` have been validated with 
      `terraform plan` against the target project
- [ ] All data contracts in `docs/contracts/` have been reviewed and 
      approved by identified consumers
- [ ] The ADR collection is current — no pending architectural 
      decisions that would change the promoted design

---

## Phase 1 — Infrastructure

**What promotes:** `infra/modules/` and `infra/environments/`

**Target state:** BigQuery datasets, GCS staging bucket, service 
accounts, and IAM bindings exist in the GCP project.

**Promotion steps:**

```bash
cd infra/environments/dev

# Copy and configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: set project_id, project_prefix, location

# Initialize with remote state backend
terraform init \
  -backend-config="bucket=your-tfstate-bucket" \
  -backend-config="prefix=data-platform/dev"

# Review the plan — read every resource before applying
terraform plan -var-file=terraform.tfvars

# Apply
terraform apply -var-file=terraform.tfvars
```

**Readiness criteria:**
- `terraform plan` shows no unexpected changes
- Service accounts are created with least-privilege IAM bindings
- BigQuery datasets exist with correct retention settings
- GCS bucket exists with lifecycle rules active

**Rollback:** `terraform destroy` removes all provisioned resources. 
State is preserved in the GCS backend.

---

## Phase 2 — Pipelines

**What promotes:** `pipelines/titanic/ingest.py`, 
`pipelines/nyc_taxi/ingest.py`

**Target state:** Pipeline scripts run as Cloud Run Jobs triggered 
by Cloud Scheduler or Cloud Composer.

**Key differences from local:**

| Local | Production |
|---|---|
| Reads from Kaggle direct download | Reads from GCS staging bucket |
| Writes to Postgres | Writes to BigQuery staging dataset |
| Credentials from `~/.kaggle/kaggle.json` | Credentials from Secret Manager |
| SQLAlchemy + psycopg2 | BigQuery Python client |
| Full refresh or watermark from Postgres | Watermark from BigQuery orchestration table |

**What does not change:**
- Cleaning contract (same filters, same guarantees)
- `source_row_hash` computation
- Incremental loading logic
- Data contract guarantees in `docs/contracts/`

**Promotion steps:**
1. Add BigQuery write target to pipeline scripts alongside existing 
   Postgres write (dual-write pattern for validation)
2. Run dual-write for one full cycle and validate BigQuery output 
   matches Postgres output
3. Switch primary write target to BigQuery
4. Remove Postgres write target after one additional validation cycle
5. Deploy as Cloud Run Job with Cloud Scheduler trigger

**Readiness criteria:**
- Pipeline output in BigQuery matches expected row counts and 
  quality checks
- Great Expectations suite passes against BigQuery target
- Watermark state is correctly persisted and read from BigQuery 
  orchestration table

---

## Phase 3 — Orchestration

**What promotes:** `orchestration/airflow/dags/data_platform_dag.py`

**Target state:** DAG runs in Cloud Composer with the same task 
structure, retry logic, SLA callbacks, and operational metadata.

**Key differences from local:**

| Local | Production |
|---|---|
| LocalExecutor | CeleryExecutor or KubernetesExecutor |
| SQLite or Postgres metadata DB | Cloud SQL (managed) |
| File-based logs | Cloud Logging |
| Manual trigger | Cloud Scheduler or event-driven trigger |

**What does not change:**
- DAG structure and task dependencies
- Retry and backfill configuration
- SLA callback behavior
- `orchestration.pipeline_runs` metadata writes

**Readiness criteria:**
- DAG imports without errors in Composer environment
- All tasks succeed on a full manual trigger
- `orchestration.pipeline_runs` is populated correctly
- SLA miss callbacks reach the configured notification channel

---

## Phase 4 — Transformations

**What promotes:** `dbt/` directory

**Target state:** dbt models run in dbt Cloud on a scheduled job, 
with CI checks on pull requests.

**Key differences from local:**

| Local | Production |
|---|---|
| `dbt run --profiles-dir .` | dbt Cloud job with environment credentials |
| Manual trigger | Scheduled after pipeline completion |
| Console output | dbt Cloud run history and artifacts |

**What does not change:**
- All model SQL
- Source definitions and freshness checks
- Schema tests
- Macro implementations

**Readiness criteria:**
- All models compile without errors in dbt Cloud environment
- `dbt test` passes on full run
- Freshness checks pass for all sources
- dbt docs are generated and accessible

---

## Phase 5 — API and Visualization

**What promotes:** `web/server/` and `web/client/`

**Target state:** Fastify API runs as a Cloud Run service. React 
app is served from Cloud Storage + Cloud CDN or Firebase Hosting.

**Key differences from local:**

| Local | Production |
|---|---|
| Postgres connection | Cloud SQL connection via Cloud SQL Auth Proxy |
| CORS origin is localhost | CORS origin is production domain |
| pino-pretty logging | Structured JSON logging to Cloud Logging |
| No authentication | Identity-Aware Proxy or API key authentication |

**Readiness criteria:**
- API health check returns 200 from Cloud Run URL
- CORS configuration allows only production origin
- OpenTelemetry traces are visible in Cloud Trace
- All API endpoints return correct results against production data

---

## Rollback Strategy

Each phase has an independent rollback path:

| Phase | Rollback |
|---|---|
| Infrastructure | `terraform destroy` or revert to previous state |
| Pipelines | Redeploy previous Cloud Run Job revision |
| Orchestration | Pause DAG in Composer, redeploy previous version |
| Transformations | Revert dbt Cloud job to previous commit |
| API | Redeploy previous Cloud Run service revision |

Cloud Run's revision model makes API rollback instantaneous. 
Terraform state versioning makes infrastructure rollback 
recoverable. dbt Cloud's run history makes transformation 
rollback auditable.

---

## Cost Checkpoints

Before each phase completes, validate the cost profile:

**After Phase 1:** Confirm BigQuery dataset storage costs are 
within expected bounds. Empty datasets cost nothing but 
confirm billing is enabled and alerts are configured.

**After Phase 2:** Confirm pipeline job costs per run. A 
Cloud Run Job running the NYC taxi pipeline at full dataset 
scale (55M rows) will have meaningfully different cost 
characteristics than the 50,000 row PoC. See 
[ADR 006](../decisions/006-scale-and-cost-considerations.md) 
for scale cost reasoning.

**After Phase 3:** Confirm Composer environment costs. 
Cloud Composer is the most expensive component in this 
architecture. If cost is a constraint, consider Cloud 
Workflows or Cloud Scheduler as lighter orchestration 
alternatives for simpler DAGs.

**After Phase 4:** Confirm dbt Cloud tier is appropriate 
for run frequency and seat count.

**After Phase 5:** Confirm Cloud Run scaling configuration 
prevents runaway costs from unexpected traffic spikes. 
Set maximum instance counts explicitly.

---

## References

- [ADR 006 — Scale and Cost](../decisions/006-scale-and-cost-considerations.md)
- [ADR 007 — Streaming Architecture](../decisions/007-streaming-architecture.md)
- [infra/modules/bigquery/main.tf](../../infra/modules/bigquery/main.tf)
- [Data Contracts](../contracts/)
- [Architecture Overview](../architecture/overview.md)