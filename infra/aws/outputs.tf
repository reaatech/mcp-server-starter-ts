output "api_endpoint" {
  description = "API Gateway invoke URL"
  value       = module.mcp_server.api_endpoint
}

output "function_name" {
  description = "Lambda function name"
  value       = module.mcp_server.function_name
}
