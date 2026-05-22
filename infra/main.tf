terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

# Add provider and backend configuration (example GCS backend) before running terraform init.

# This root file is intentionally minimal. See environments/dev/ for an example instantiation.
