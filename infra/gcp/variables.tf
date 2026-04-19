variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "mcp-server"
}

variable "container_image" {
  description = "Container image to deploy"
  type        = string
}

variable "environment_variables" {
  description = "Plaintext environment variables for the container"
  type        = map(string)
  default     = {}
}

variable "secret_environment_variables" {
  description = "Secret-backed environment variables"
  type = list(object({
    name        = string
    secret_name = string
    key         = string
  }))
  default = []
}

variable "allow_unauthenticated" {
  description = "Whether to allow unauthenticated invocations"
  type        = bool
  default     = false
}
