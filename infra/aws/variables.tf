variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "api_name" {
  description = "HTTP API name"
  type        = string
  default     = "mcp-server-api"
}

variable "function_name" {
  description = "Lambda function name"
  type        = string
  default     = "mcp-server"
}

variable "container_image" {
  description = "Container image URI"
  type        = string
}

variable "environment_variables" {
  description = "Plaintext Lambda environment variables"
  type        = map(string)
  default     = {}
}

variable "create_secret" {
  description = "Whether to create a Secrets Manager secret"
  type        = bool
  default     = true
}

variable "secret_values" {
  description = "Secrets to store in Secrets Manager"
  type        = map(string)
  sensitive   = true
  default     = {}
}
