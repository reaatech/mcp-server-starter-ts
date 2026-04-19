output "service_url" {
  description = "URL of the Cloud Run service"
  value       = google_cloud_run_service.this.status[0].url
}

output "service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_service.this.name
}

output "service_location" {
  description = "Region of the Cloud Run service"
  value       = google_cloud_run_service.this.location
}

output "service_account_email" {
  description = "Service account email used by the service"
  value       = coalesce(var.service_account_email, google_service_account.this[0].email)
}
