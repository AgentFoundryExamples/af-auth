output "service_name" {
  description = "Name of the deployed service"
  value       = var.service_name
}

output "service_url" {
  description = "Public URL of the deployed service"
  # NOTE: This is a placeholder for provider-agnostic module
  # Provider-specific implementations should override with actual service URL
  value = "https://${var.service_name}-${var.environment}.example.com"
}

output "service_id" {
  description = "Service identifier"
  value       = "${var.service_name}-${var.environment}"
}

output "container_image" {
  description = "Container image URI used for deployment"
  value       = var.container_image
}

output "region" {
  description = "Region where service is deployed"
  value       = var.region
}
