terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

module "mcp_server" {
  source = "../modules/aws-lambda"

  api_name               = var.api_name
  function_name          = var.function_name
  region                 = var.region
  container_image        = var.container_image
  environment_variables  = var.environment_variables
  create_secret          = var.create_secret
  secret_values          = var.secret_values
}
