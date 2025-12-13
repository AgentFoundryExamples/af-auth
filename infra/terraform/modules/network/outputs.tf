output "network_id" {
  description = "Network/VPC identifier"
  value       = var.enable_private_networking ? "private-network" : "default-network"
}

output "network_name" {
  description = "Network/VPC name"
  value       = var.enable_private_networking ? "af-auth-${var.environment}-network" : "default"
}

output "private_subnet_id" {
  description = "Private subnet identifier for database/cache resources"
  value       = var.enable_private_networking ? "private-subnet" : null
}

output "vpc_connector_id" {
  description = "VPC connector identifier for serverless services (GCP-specific)"
  value       = var.enable_private_networking ? "vpc-connector-${var.environment}" : null
}
