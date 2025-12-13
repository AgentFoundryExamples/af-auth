output "redis_enabled" {
  description = "Whether Redis is enabled"
  value       = var.enable_redis
}

output "redis_instance_id" {
  description = "Redis instance identifier"
  value       = var.enable_redis ? "af-auth-redis-${var.environment}" : null
}

output "redis_host" {
  description = "Redis host address"
  # NOTE: This is a placeholder for provider-agnostic module
  # Provider-specific implementations should override with actual host from resource
  value     = var.enable_redis ? "redis-host" : null
  sensitive = true
}

output "redis_port" {
  description = "Redis port"
  value       = var.enable_redis ? 6379 : null
}

output "redis_connection_name" {
  description = "Redis connection identifier (provider-specific)"
  value       = var.enable_redis ? "${var.project_id}:${var.region}:af-auth-redis-${var.environment}" : null
}
