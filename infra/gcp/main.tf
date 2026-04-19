terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "mcp_server" {
  source = "../modules/cloud-run"

  service_name              = var.service_name
  project_id                = var.project_id
  region                    = var.region
  container_image           = var.container_image
  environment_variables     = var.environment_variables
  secret_environment_variables = var.secret_environment_variables
  allow_unauthenticated     = var.allow_unauthenticated
}
