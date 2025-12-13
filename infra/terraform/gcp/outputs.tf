output "service_url" {
  description = "URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.auth_service.uri
}

output "service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_v2_service.auth_service.name
}

output "database_instance_name" {
  description = "Name of the Cloud SQL instance"
  value       = google_sql_database_instance.postgres.name
}

output "database_connection_name" {
  description = "Connection name for Cloud SQL instance"
  value       = google_sql_database_instance.postgres.connection_name
}

output "database_private_ip" {
  description = "Private IP address of Cloud SQL instance"
  value       = var.enable_private_networking ? google_sql_database_instance.postgres.private_ip_address : null
  sensitive   = true
}

output "database_public_ip" {
  description = "Public IP address of Cloud SQL instance"
  value       = !var.enable_private_networking ? google_sql_database_instance.postgres.public_ip_address : null
  sensitive   = true
}

output "redis_host" {
  description = "Redis host address"
  value       = var.enable_redis ? google_redis_instance.cache[0].host : null
  sensitive   = true
}

output "redis_port" {
  description = "Redis port"
  value       = var.enable_redis ? google_redis_instance.cache[0].port : null
}

output "vpc_network_name" {
  description = "Name of the VPC network"
  value       = var.enable_private_networking ? google_compute_network.vpc[0].name : null
}

output "vpc_connector_id" {
  description = "ID of the VPC connector"
  value       = var.enable_private_networking ? google_vpc_access_connector.connector[0].id : null
}

output "service_account_email" {
  description = "Email of the Cloud Run service account"
  value       = google_service_account.cloud_run.email
}
