output "network_id" {
  description = "Network/VPC identifier"
  # NOTE: This is a placeholder for provider-agnostic module
  # Provider-specific implementations should override with actual resource IDs
  value = var.enable_private_networking ? "private-network" : "default-network"
}

output "network_name" {
  description = "Network/VPC name"
  # NOTE: This is a placeholder for provider-agnostic module
  # Provider-specific implementations should override with actual resource names
  value = var.enable_private_networking ? "af-auth-${var.environment}-network" : "default"
}

output "private_subnet_id" {
  description = "Private subnet identifier for database/cache resources"
  value       = var.enable_private_networking ? "private-subnet" : null
}

output "vpc_connector_id" {
  description = "VPC connector identifier for serverless services (GCP-specific)"
  value       = var.enable_private_networking ? "vpc-connector-${var.environment}" : null
}
