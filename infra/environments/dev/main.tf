# Dev environment — instantiates the BigQuery module with dev-specific naming.
# In production this file would live in environments/prod/ with different
# naming, retention settings, and additional security controls.
# See environments/prod/README.md for what prod would add.

module "bigquery" {
  source     = "../../modules/bigquery"
  project_id = var.project_id
  prefix     = var.project_prefix
  location   = var.location

  # Explicit dataset IDs for dev — avoids naming collisions if you run
  # multiple environments in the same GCP project during development.
  staging_dataset_id       = "${var.project_prefix}_staging"
  analytics_dataset_id     = "${var.project_prefix}_analytics"
  orchestration_dataset_id = "${var.project_prefix}_orchestration"
  bucket_name              = "${var.project_prefix}-pipeline-staging"
}

# Surface the module outputs at the environment level so they can be
# referenced by other modules or consumed by CI/CD pipelines.
output "staging_dataset_id"             { value = module.bigquery.staging_dataset_id }
output "analytics_dataset_id"           { value = module.bigquery.analytics_dataset_id }
output "orchestration_dataset_id"       { value = module.bigquery.orchestration_dataset_id }
output "pipeline_service_account_email" { value = module.bigquery.pipeline_service_account_email }
output "dbt_service_account_email"      { value = module.bigquery.dbt_service_account_email }
output "staging_bucket_name"            { value = module.bigquery.staging_bucket_name }