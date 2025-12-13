terraform {
  required_version = ">= 1.0"
}

# This is a provider-agnostic Redis/cache module placeholder.
# The actual Redis resources (Cloud Memorystore, ElastiCache, Azure Cache) are 
# implemented in provider-specific examples.
# See infra/terraform/gcp/ for Google Cloud Memorystore implementation.
# See infra/terraform/aws/ for AWS ElastiCache implementation stub.
# See infra/terraform/azure/ for Azure Cache for Redis implementation stub.

locals {
  common_tags = merge(
    var.tags,
    {
      environment = var.environment
      managed_by  = "terraform"
      service     = "af-auth"
      component   = "cache"
    }
  )

  instance_name = var.enable_redis ? "af-auth-redis-${var.environment}" : null
}

# Redis configuration parameters
locals {
  redis_config = var.enable_redis ? {
    tier              = var.redis_tier
    memory_size_gb    = var.redis_memory_size_gb
    version           = var.redis_version
    high_availability = var.high_availability
  } : null
}

# Redis instance outputs are defined based on configuration
# When enable_redis is false, minimal deployments can skip Redis to reduce costs
# Provider-specific implementations create actual Redis/cache instances
