# Module: bigquery
# HCA-style BigQuery module: provisions staging, analytics, and orchestration datasets,
# creates service accounts for pipeline execution and dbt, and a GCS staging bucket.
# Comments explain IAM scoping choices and operational defaults.

variable "project_id" {
  description = "GCP project id where datasets and resources will be created"
  type        = string
}

variable "prefix" {
  description = "Short name prefix used for dataset and service account naming"
  type        = string
  default     = "poc"
}

variable "location" {
  description = "BigQuery and GCS location (region or multi-region)"
  type        = string
  default     = "US"
}

variable "staging_dataset_id" {
  description = "Optional explicit dataset id for staging; if empty, computed from prefix"
  type        = string
  default     = ""
}

variable "analytics_dataset_id" {
  description = "Optional explicit dataset id for analytics; if empty, computed from prefix"
  type        = string
  default     = ""
}

variable "orchestration_dataset_id" {
  description = "Optional explicit dataset id for orchestration; if empty, computed from prefix"
  type        = string
  default     = ""
}

variable "bucket_name" {
  description = "GCS bucket name for pipeline staging files (must be globally unique). If empty, a sensible default is used but may collide."
  type        = string
  default     = ""
}

locals {
  staging_dataset_id     = var.staging_dataset_id != "" ? var.staging_dataset_id : "${var.prefix}_staging"
  analytics_dataset_id   = var.analytics_dataset_id != "" ? var.analytics_dataset_id : "${var.prefix}_analytics"
  orchestration_dataset_id = var.orchestration_dataset_id != "" ? var.orchestration_dataset_id : "${var.prefix}_orchestration"
  bucket_name_computed   = var.bucket_name != "" ? var.bucket_name : "${var.prefix}-pipeline-staging"
  # 90 days in milliseconds for default_table_expiration_ms
  ninety_days_ms         = 90 * 24 * 60 * 60 * 1000
}

# Staging dataset (bronze): raw ingested data. Tables expire by default to limit storage costs.
resource "google_bigquery_dataset" "staging" {
  project                    = var.project_id
  dataset_id                 = local.staging_dataset_id
  location                   = var.location
  description                = "Staging (bronze) dataset for raw ingested data. Default table expiration enforces lifecycle."
  default_table_expiration_ms = local.ninety_days_ms
}

# Analytics dataset (silver/gold): curated, transformed tables. No default expiration by design.
resource "google_bigquery_dataset" "analytics" {
  project     = var.project_id
  dataset_id  = local.analytics_dataset_id
  location    = var.location
  description = "Analytics dataset for transformed and curated tables. No default expiration."
}

# Orchestration dataset: metadata, run history, job tracking, etc.
resource "google_bigquery_dataset" "orchestration" {
  project     = var.project_id
  dataset_id  = local.orchestration_dataset_id
  location    = var.location
  description = "Orchestration dataset for pipeline metadata, run state, and scheduling artifacts."
}

# Service account used by ingestion/pipeline components.
resource "google_service_account" "pipeline_sa" {
  account_id   = "${var.prefix}-pipeline"
  display_name = "Pipeline execution service account"
  project      = var.project_id
}

# Service account used by dbt/transformation layer.
resource "google_service_account" "dbt_sa" {
  account_id   = "${var.prefix}-dbt"
  display_name = "DBT transformation service account"
  project      = var.project_id
}

# IAM: pipeline SA needs to modify staging (ingest) but only read analytics (least privilege).
# Pipeline gets dataEditor on staging and dataViewer on analytics.
# This single-sentence rationale signals principle of least privilege: pipeline ingests and mutates raw/staging tables but should not alter curated analytics tables.
resource "google_bigquery_dataset_iam_member" "staging_pipeline_data_editor" {
  dataset_id      = google_bigquery_dataset.staging.dataset_id
  dataset_project = var.project_id
  role            = "roles/bigquery.dataEditor"
  member          = "serviceAccount:${google_service_account.pipeline_sa.email}"
}

resource "google_bigquery_dataset_iam_member" "analytics_pipeline_data_viewer" {
  dataset_id      = google_bigquery_dataset.analytics.dataset_id
  dataset_project = var.project_id
  role            = "roles/bigquery.dataViewer"
  member          = "serviceAccount:${google_service_account.pipeline_sa.email}"
}

# DBT service account: needs to run jobs and have dataset-level permissions to write transformed tables.
# Grant project-level jobUser and dataset-level editor on analytics and viewer on staging.
resource "google_project_iam_member" "dbt_job_user" {
  project = var.project_id
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.dbt_sa.email}"
}

resource "google_bigquery_dataset_iam_member" "analytics_dbt_data_editor" {
  dataset_id      = google_bigquery_dataset.analytics.dataset_id
  dataset_project = var.project_id
  role            = "roles/bigquery.dataEditor"
  member          = "serviceAccount:${google_service_account.dbt_sa.email}"
}

resource "google_bigquery_dataset_iam_member" "staging_dbt_data_viewer" {
  dataset_id      = google_bigquery_dataset.staging.dataset_id
  dataset_project = var.project_id
  role            = "roles/bigquery.dataViewer"
  member          = "serviceAccount:${google_service_account.dbt_sa.email}"
}

# GCS bucket for pipeline staging files with lifecycle rule deleting objects older than 30 days.
resource "google_storage_bucket" "pipeline_staging_bucket" {
  name     = local.bucket_name_computed
  project  = var.project_id
  location = var.location

  uniform_bucket_level_access = true
  force_destroy               = false

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 30
    }
  }

  # Optional: set storage_class, retention_policy, logging, etc. as needed.
}

# Allow pipeline SA to create objects in the staging bucket (least privilege for write operations).
resource "google_storage_bucket_iam_member" "bucket_pipeline_writer" {
  bucket = google_storage_bucket.pipeline_staging_bucket.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.pipeline_sa.email}"
}

# Allow dbt SA to read staging objects if necessary (optional read access).
resource "google_storage_bucket_iam_member" "bucket_dbt_reader" {
  bucket = google_storage_bucket.pipeline_staging_bucket.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.dbt_sa.email}"
}

# Outputs
output "staging_dataset_id" {
  value = google_bigquery_dataset.staging.dataset_id
}

output "analytics_dataset_id" {
  value = google_bigquery_dataset.analytics.dataset_id
}

output "orchestration_dataset_id" {
  value = google_bigquery_dataset.orchestration.dataset_id
}

output "pipeline_service_account_email" {
  value = google_service_account.pipeline_sa.email
}

output "dbt_service_account_email" {
  value = google_service_account.dbt_sa.email
}

output "staging_bucket_name" {
  value = google_storage_bucket.pipeline_staging_bucket.name
}
