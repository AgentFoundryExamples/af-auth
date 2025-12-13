terraform {
  required_version = ">= 1.0"
}

# This is a provider-agnostic auth service module placeholder.
# The actual service resources (Cloud Run, ECS, Container Apps) are implemented
# in provider-specific examples.
# See infra/terraform/gcp/ for Google Cloud Run implementation.
# See infra/terraform/aws/ for AWS ECS/Fargate implementation stub.
# See infra/terraform/azure/ for Azure Container Apps implementation stub.

locals {
  common_tags = merge(
    var.tags,
    {
      environment = var.environment
      managed_by  = "terraform"
      service     = "af-auth"
      component   = "api"
    }
  )

  service_full_name = "${var.service_name}-${var.environment}"
}

# Service configuration parameters
locals {
  service_config = {
    container_image = var.container_image
    container_port  = var.container_port
    cpu_limit       = var.cpu_limit
    memory_limit    = var.memory_limit
    min_instances   = var.min_instances
    max_instances   = var.max_instances
    concurrency     = var.concurrency
    timeout_seconds = var.timeout_seconds
    public_access   = var.allow_public_access
  }

  # Merge base environment variables with computed values
  all_env_vars = merge(
    var.environment_variables,
    {
      NODE_ENV                 = var.environment == "production" ? "production" : "development"
      PORT                     = tostring(var.container_port)
      DATABASE_CONNECTION_NAME = var.database_connection_name
      REDIS_ENABLED            = var.redis_enabled ? "true" : "false"
      REDIS_HOST               = var.redis_enabled ? var.redis_host : ""
      REDIS_PORT               = var.redis_enabled ? tostring(var.redis_port) : ""
    }
  )
}

# Service deployment outputs are defined based on configuration
# Provider-specific implementations create actual container service resources
