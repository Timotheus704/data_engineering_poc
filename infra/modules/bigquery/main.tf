# Module: bigquery
# ─────────────────────────────────────────────────────────────────────────────
# BigQuery module: provisions staging, analytics, and orchestration
# datasets, creates service accounts for pipeline execution and dbt, and a GCS
# staging bucket.
#
# Design decisions documented inline. Comments explain WHY, not WHAT.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  staging_dataset_id       = var.staging_dataset_id != "" ? var.staging_dataset_id : "${var.prefix}_staging"
  analytics_dataset_id     = var.analytics_dataset_id != "" ? var.analytics_dataset_id : "${var.prefix}_analytics"
  orchestration_dataset_id = var.orchestration_dataset_id != "" ? var.orchestration_dataset_id : "${var.prefix}_orchestration"
  bucket_name_computed     = var.bucket_name != "" ? var.bucket_name : "${var.prefix}-pipeline-staging"

  # 90 days in milliseconds for default_table_expiration_ms
  ninety_days_ms = 90 * 24 * 60 * 60 * 1000
}

# ─── Datasets ─────────────────────────────────────────────────────────────────

# Staging dataset (bronze): raw ingested data.
# default_table_expiration_ms enforces lifecycle — raw data doesn't need to live
# forever and auto-expiry reduces storage cost without manual cleanup jobs.
resource "google_bigquery_dataset" "staging" {
  project                     = var.project_id
  dataset_id                  = local.staging_dataset_id
  location                    = var.location
  description                 = "Staging (bronze) dataset for raw ingested data. Tables expire after 90 days by default."
  default_table_expiration_ms = local.ninety_days_ms
}

# Analytics dataset (silver/gold): curated, transformed tables.
# No default expiration — analytics tables are the product; they should not
# disappear automatically. Retention is managed explicitly by the team.
resource "google_bigquery_dataset" "analytics" {
  project     = var.project_id
  dataset_id  = local.analytics_dataset_id
  location    = var.location
  description = "Analytics (silver/gold) dataset for dbt-transformed and curated tables."
}

# Orchestration dataset: pipeline metadata, run history, watermarks.
# Mirrors the orchestration schema in the Postgres local stack.
resource "google_bigquery_dataset" "orchestration" {
  project     = var.project_id
  dataset_id  = local.orchestration_dataset_id
  location    = var.location
  description = "Orchestration dataset for pipeline metadata, run state, and watermarks."
}

# ─── Service Accounts ─────────────────────────────────────────────────────────

# Pipeline service account: used by ingestion jobs (Cloud Run, Airflow workers).
# Principle of least privilege: this SA can write to staging but only read
# analytics. It has no reason to modify curated tables — that's dbt's job.
resource "google_service_account" "pipeline_sa" {
  account_id   = "${var.prefix}-pipeline"
  display_name = "Pipeline execution service account"
  project      = var.project_id
}

# dbt service account: used by the transformation layer.
# Needs dataEditor on analytics to create/replace views and tables,
# but only dataViewer on staging — dbt reads raw data, it doesn't write it.
resource "google_service_account" "dbt_sa" {
  account_id   = "${var.prefix}-dbt"
  display_name = "dbt transformation service account"
  project      = var.project_id
}

# ─── IAM: Dataset-level bindings ──────────────────────────────────────────────
#
# We use dataset-level IAM (not project-level) because:
# 1. It's more granular — an SA that writes to staging has no implicit access
#    to analytics or any other dataset in the project.
# 2. It's easier to audit — you can see exactly who can access what dataset
#    without scanning project-level IAM policies.
# 3. It follows the principle of least privilege more faithfully.

resource "google_bigquery_dataset_iam_member" "staging_pipeline_editor" {
  project    = var.project_id
  dataset_id = google_bigquery_dataset.staging.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${google_service_account.pipeline_sa.email}"
}

resource "google_bigquery_dataset_iam_member" "analytics_pipeline_viewer" {
  project    = var.project_id
  dataset_id = google_bigquery_dataset.analytics.dataset_id
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${google_service_account.pipeline_sa.email}"
}

# dbt needs jobUser at project level to run queries — this cannot be scoped
# to a dataset. We accept this as a necessary exception to dataset-level IAM.
resource "google_project_iam_member" "dbt_job_user" {
  project = var.project_id
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.dbt_sa.email}"
}

resource "google_bigquery_dataset_iam_member" "analytics_dbt_editor" {
  project    = var.project_id
  dataset_id = google_bigquery_dataset.analytics.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${google_service_account.dbt_sa.email}"
}

resource "google_bigquery_dataset_iam_member" "staging_dbt_viewer" {
  project    = var.project_id
  dataset_id = google_bigquery_dataset.staging.dataset_id
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${google_service_account.dbt_sa.email}"
}

# ─── GCS Staging Bucket ───────────────────────────────────────────────────────

# Pipeline staging bucket: used for intermediate files between ingestion steps.
# 30-day lifecycle rule: staging files are transient. Keeping them longer
# increases storage cost with no analytical value.
resource "google_storage_bucket" "pipeline_staging" {
  name     = local.bucket_name_computed
  project  = var.project_id
  location = var.location

  # Uniform bucket-level access disables per-object ACLs and enforces IAM only.
  # This is the recommended setting for new buckets — it's simpler to audit and
  # consistent with how we manage BigQuery dataset access.
  uniform_bucket_level_access = true

  # Do not auto-destroy bucket contents when Terraform destroys the bucket.
  # Accidental terraform destroy should not delete pipeline data.
  force_destroy = false

  lifecycle_rule {
    action { type = "Delete" }
    condition { age = 30 }
  }
}

resource "google_storage_bucket_iam_member" "staging_bucket_pipeline_writer" {
  bucket = google_storage_bucket.pipeline_staging.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.pipeline_sa.email}"
}

resource "google_storage_bucket_iam_member" "staging_bucket_dbt_reader" {
  bucket = google_storage_bucket.pipeline_staging.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.dbt_sa.email}"
}