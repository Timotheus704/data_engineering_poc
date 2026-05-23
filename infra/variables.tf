variable "project_id" {
  description = "GCP project id"
  type        = string
}

variable "location" {
  description = "Primary location/region"
  type        = string
  default     = "US"
}

variable "environment" {
  description = "Environment name (dev/qa/prod)"
  type        = string
  default     = "dev"
}

variable "project_prefix" {
  description = "Short prefix used for naming in the environment"
  type = string
  default = "pocdev"
}