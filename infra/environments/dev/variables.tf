variable "project_id" {
  description = "GCP project id for the development environment"
  type        = string
}

variable "project_prefix" {
  description = "Short prefix used for naming in the dev environment"
  type        = string
  default     = "pocdev"
}

variable "location" {
  description = "GCP region/locations for resources"
  type        = string
  default     = "US"
}
