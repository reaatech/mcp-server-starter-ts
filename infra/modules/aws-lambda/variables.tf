variable "api_name" {
  description = "Name of the API Gateway"
  type        = string
}

variable "function_name" {
  description = "Name of the Lambda function (defaults to api_name)"
  type        = string
  default     = ""
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "container_image" {
  description = "Container image URI (e.g., account.dkr.ecr.region.amazonaws.com/repo:tag)"
  type        = string
}

variable "memory_size" {
  description = "Lambda memory in MB"
  type        = number
  default     = 512
}

variable "timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 30
}

variable "ephemeral_storage_size" {
  description = "Ephemeral storage size in MB"
  type        = number
  default     = 512
}

variable "environment_variables" {
  description = "Map of environment variables"
  type        = map(string)
  default     = {}
}

variable "tracing_enabled" {
  description = "Enable X-Ray tracing"
  type        = bool
  default     = true
}

variable "vpc_subnet_ids" {
  description = "VPC subnet IDs for Lambda"
  type        = list(string)
  default     = []
}

variable "vpc_security_group_ids" {
  description = "Security group IDs for Lambda VPC"
  type        = list(string)
  default     = []
}

variable "stage_name" {
  description = "API Gateway stage name"
  type        = string
  default     = "prod"
}

variable "api_description" {
  description = "API Gateway description"
  type        = string
  default     = "MCP Server API Gateway"
}

variable "create_secret" {
  description = "Create Secrets Manager secret"
  type        = bool
  default     = true
}

variable "secret_values" {
  description = "Key-value pairs for secrets"
  type        = map(string)
  sensitive   = true
  default     = {}
}

variable "secret_recovery_window" {
  description = "Secrets Manager recovery window in days"
  type        = number
  default     = 30
}
