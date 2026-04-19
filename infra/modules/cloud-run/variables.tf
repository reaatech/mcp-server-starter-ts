variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
}

variable "region" {
  description = "GCP region to deploy in"
  type        = string
  default     = "us-central1"
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "container_image" {
  description = "Container image URL (e.g., gcr.io/project/image:tag)"
  type        = string
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 8080
}

variable "container_concurrency" {
  description = "Maximum concurrent requests per instance"
  type        = number
  default     = 80
}

variable "timeout_seconds" {
  description = "Request timeout in seconds"
  type        = number
  default     = 300
}

variable "min_instances" {
  description = "Minimum number of instances (0 for scale-to-zero)"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 10
}

variable "memory" {
  description = "Memory limit (e.g., '512Mi', '1Gi')"
  type        = string
  default     = "512Mi"
}

variable "cpu" {
  description = "CPU limit (e.g., '1000m' for 1 vCPU)"
  type        = string
  default     = "1000m"
}

variable "resource_limits" {
  description = "Resource limits map"
  type        = map(string)
  default = {
    memory = "512Mi"
    cpu    = "1000m"
  }
}

variable "environment_variables" {
  description = "Map of environment variables"
  type        = map(string)
  default     = {}
}

variable "secret_environment_variables" {
  description = "List of secret environment variables"
  type = list(object({
    name        = string
    secret_name = string
    key         = string
  }))
  default = []
}

variable "service_account_email" {
  description = "Existing service account email (leave empty to create one)"
  type        = string
  default     = ""
}

variable "allow_unauthenticated" {
  description = "Allow unauthenticated invocations"
  type        = bool
  default     = false
}

variable "annotations" {
  description = "Annotations for the Cloud Run service"
  type        = map(string)
  default     = {}
}

variable "labels" {
  description = "Labels for the Cloud Run service"
  type        = map(string)
  default     = {}
}

variable "vpc_network" {
  description = "VPC network name for VPC connector"
  type        = string
  default     = ""
}

variable "vpc_connector_name" {
  description = "Existing VPC connector name (leave empty to create one)"
  type        = string
  default     = ""
}

variable "vpc_connector_cidr" {
  description = "CIDR range for VPC connector"
  type        = string
  default     = "10.8.0.0/28"
}
