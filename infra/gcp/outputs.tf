output "service_url" {
  description = "Cloud Run service URL"
  value       = module.mcp_server.service_url
}

output "service_name" {
  description = "Cloud Run service name"
  value       = module.mcp_server.service_name
}
