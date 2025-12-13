output "instance_id" {
  description = "Database instance identifier"
  value       = "af-auth-db-${var.environment}"
}

output "instance_name" {
  description = "Database instance name"
  value       = "af-auth-db-${var.environment}"
}

output "database_name" {
  description = "Database name"
  value       = var.database_name
}

output "connection_name" {
  description = "Database connection identifier (for Cloud SQL connector)"
  value       = "${var.project_id}:${var.region}:af-auth-db-${var.environment}"
}

output "private_ip" {
  description = "Private IP address of database instance"
  # NOTE: This is a placeholder for provider-agnostic module
  # Provider-specific implementations should override with actual IP from resource
  value     = var.network_id != null ? "10.0.1.10" : null
  sensitive = true
}

output "public_ip" {
  description = "Public IP address of database instance (if enabled)"
  # NOTE: This is a placeholder for provider-agnostic module
  # Provider-specific implementations should override with actual IP from resource
  value     = var.network_id == null ? "0.0.0.0" : null
  sensitive = true
}

output "port" {
  description = "Database port"
  value       = 5432
}

output "database_url_template" {
  description = "Template for database URL (replace PASSWORD with actual secret)"
  value       = "postgresql://${var.database_user}:PASSWORD@HOST:5432/${var.database_name}?sslmode=${var.enable_ssl ? "require" : "disable"}"
}
