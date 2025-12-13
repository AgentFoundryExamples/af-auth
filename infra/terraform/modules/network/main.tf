terraform {
  required_version = ">= 1.0"
}

# This is a provider-agnostic network module placeholder.
# The actual network resources are implemented in provider-specific examples.
# See infra/terraform/gcp/ for Google Cloud implementation.
# See infra/terraform/aws/ for AWS implementation stub.
# See infra/terraform/azure/ for Azure implementation stub.

locals {
  common_tags = merge(
    var.tags,
    {
      environment = var.environment
      managed_by  = "terraform"
      service     = "af-auth"
    }
  )
}

# Network outputs are defined based on configuration
# Provider-specific implementations create actual VPC, subnets, and connectors
