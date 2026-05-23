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
  description = "GCS bucket name for pipeline staging files (must be globally unique)"
  type        = string
  default     = ""
}