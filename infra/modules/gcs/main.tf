variable "project_id" { type = string }
variable "bucket_name" { type = string }

resource "google_storage_bucket" "this" {
  name     = var.bucket_name
  project  = var.project_id
  location = "US"
  uniform_bucket_level_access = true
  force_destroy = false
}
