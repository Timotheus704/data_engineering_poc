# ─── Outputs ──────────────────────────────────────────────────────────────────

output "staging_dataset_id" {
  value       = google_bigquery_dataset.staging.dataset_id
  description = "Dataset ID for the staging (bronze) layer"
}

output "analytics_dataset_id" {
  value       = google_bigquery_dataset.analytics.dataset_id
  description = "Dataset ID for the analytics (silver/gold) layer"
}

output "orchestration_dataset_id" {
  value       = google_bigquery_dataset.orchestration.dataset_id
  description = "Dataset ID for pipeline orchestration metadata"
}

output "pipeline_service_account_email" {
  value       = google_service_account.pipeline_sa.email
  description = "Email of the pipeline execution service account"
}

output "dbt_service_account_email" {
  value       = google_service_account.dbt_sa.email
  description = "Email of the dbt transformation service account"
}

output "staging_bucket_name" {
  value       = google_storage_bucket.pipeline_staging.name
  description = "Name of the GCS staging bucket"
}