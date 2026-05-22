# Dev environment example - main.tf

module "bigquery" {
  source     = "../../modules/bigquery"
  project_id = var.project_id
  dataset_id = "${var.project_prefix}_analytics"
  location   = var.location
}

module "gcs" {
  source      = "../../modules/gcs"
  project_id  = var.project_id
  bucket_name = "${var.project_prefix}-staging"
}
