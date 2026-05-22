variable "project_id" {
  description = "GCP project id"
  type = string
}

variable "dataset_id" {
  description = "BigQuery dataset id"
  type = string
}

variable "location" {
  description = "Default BigQuery location"
  type = string
  default = "US"
}
