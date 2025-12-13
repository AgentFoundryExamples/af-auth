terraform {
  required_version = ">= 1.0"
}

# This is a provider-agnostic database module placeholder.
# The actual database resources (Cloud SQL, RDS, Azure Database) are implemented
# in provider-specific examples.
# See infra/terraform/gcp/ for Google Cloud SQL implementation.
# See infra/terraform/aws/ for AWS RDS implementation stub.
# See infra/terraform/azure/ for Azure Database implementation stub.

locals {
  common_tags = merge(
    var.tags,
    {
      environment = var.environment
      managed_by  = "terraform"
      service     = "af-auth"
      component   = "database"
    }
  )

  instance_name = "af-auth-db-${var.environment}"
}

# Database configuration parameters
locals {
  db_config = {
    name              = var.database_name
    user              = var.database_user
    tier              = var.database_tier
    version           = var.database_version
    backup_enabled    = var.backup_enabled
    backup_retention  = var.backup_retention_days
    high_availability = var.high_availability
    ssl_enabled       = var.enable_ssl
  }
}

# Database instance outputs are defined based on configuration
# Provider-specific implementations create actual database instances
