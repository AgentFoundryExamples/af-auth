# Provider-Agnostic Terraform Modules

This directory contains abstract, provider-agnostic Terraform modules that define the interface and structure for AF Auth infrastructure components.

## Purpose

These modules serve as **interface definitions** and **documentation** for implementing AF Auth on different cloud providers. They are **not meant to be used directly** but rather serve as templates for provider-specific implementations.

## Module Structure

Each module defines:

1. **variables.tf**: Input parameters that work across all providers
2. **outputs.tf**: Output values expected by consumers
3. **main.tf**: Minimal structure and documentation

## Important Notes

### ⚠️ Placeholder Values

The output values in these modules contain **placeholder strings** (e.g., `"redis-host"`, `"10.0.1.10"`, `"example.com"`). These are intentional and serve as:

- **Documentation**: Show what type of data each output should contain
- **Interface Contract**: Define the expected output structure for provider implementations
- **Validation**: Allow `terraform validate` to pass without actual resources

### ✅ Provider Implementations

See the provider-specific directories for actual resource implementations:

- **`../gcp/`**: Complete Google Cloud Platform implementation
- **`../aws/`**: AWS implementation guide (not yet implemented)
- **`../azure/`**: Azure implementation guide (not yet implemented)

Provider implementations:
1. Use the same variable names and types
2. Override output values with actual resource references
3. Create real cloud resources (VPCs, databases, etc.)
4. Follow the same logical structure

## Modules

### network

Defines VPC, subnets, and private connectivity requirements.

**Key Variables**:
- `enable_private_networking`: Toggle for private VPC vs public access
- `vpc_cidr`: CIDR block for network

**Key Outputs**:
- `network_id`: Network/VPC identifier
- `network_name`: Network/VPC name
- `vpc_connector_id`: For serverless private connectivity

**Provider Implementations**:
- GCP: Creates VPC, subnet, VPC Access Connector
- AWS: Would create VPC, public/private subnets, NAT gateway
- Azure: Would create Virtual Network, subnets

### database

Defines PostgreSQL database requirements.

**Key Variables**:
- `database_tier`: Instance size (provider-specific format)
- `high_availability`: Multi-zone/regional deployment
- `backup_enabled`: Automated backups

**Key Outputs**:
- `instance_name`: Database instance identifier
- `connection_name`: Connection identifier for proxies
- `private_ip`: Private network IP address
- `database_url_template`: Connection string template

**Provider Implementations**:
- GCP: Creates Cloud SQL PostgreSQL instance
- AWS: Would create RDS PostgreSQL instance
- Azure: Would create Azure Database for PostgreSQL

### redis

Defines Redis cache requirements with optional toggle.

**Key Variables**:
- `enable_redis`: Toggle to disable for minimal deployments
- `redis_tier`: Basic vs high availability
- `redis_memory_size_gb`: Memory allocation

**Key Outputs**:
- `redis_enabled`: Whether Redis is provisioned
- `redis_host`: Connection host
- `redis_port`: Connection port

**Provider Implementations**:
- GCP: Creates Cloud Memorystore Redis instance
- AWS: Would create ElastiCache Redis cluster
- Azure: Would create Azure Cache for Redis

### auth-service

Defines container service deployment requirements.

**Key Variables**:
- `container_image`: Full image URI
- `min_instances`: Minimum for scale-to-zero
- `max_instances`: Maximum for auto-scaling
- `secret_environment_variables`: Secret Manager references

**Key Outputs**:
- `service_url`: Public HTTPS endpoint
- `service_name`: Service identifier

**Provider Implementations**:
- GCP: Creates Cloud Run service with VPC connector
- AWS: Would create ECS/Fargate service with ALB
- Azure: Would create Container Apps with ingress

## Usage Example

**DON'T DO THIS** (modules are placeholders):
```hcl
module "network" {
  source = "./modules/network"
  # This won't create actual resources
}
```

**DO THIS** (use provider implementation):
```hcl
# In gcp/main.tf - creates real resources
resource "google_compute_network" "vpc" {
  name = "af-auth-${var.environment}-network"
  # ... actual GCP resource configuration
}
```

## Extending for New Providers

To add support for a new cloud provider:

1. **Study the modules**: Understand the required inputs and expected outputs
2. **Create provider directory**: e.g., `../digitalocean/`
3. **Implement resources**: Create actual cloud resources using provider-specific APIs
4. **Match the interface**: Use same variable names, provide same output types
5. **Document differences**: Note any provider-specific quirks or limitations

Example for a new provider (DigitalOcean):

```hcl
# digitalocean/main.tf
terraform {
  required_providers {
    digitalocean = {
      source = "digitalocean/digitalocean"
    }
  }
}

# Implement network (VPC)
resource "digitalocean_vpc" "main" {
  name   = "af-auth-${var.environment}"
  region = var.region
  # Use same variables as modules/network
}

# Implement database (Managed PostgreSQL)
resource "digitalocean_database_cluster" "postgres" {
  name       = "af-auth-db-${var.environment}"
  engine     = "pg"
  version    = "15"
  size       = var.database_tier
  # Use same variables as modules/database
}

# Override outputs with actual values
output "database_host" {
  value = digitalocean_database_cluster.postgres.host
}
```

## Validation

These modules pass `terraform validate` despite having placeholder values:

```bash
cd modules/network
terraform init -backend=false
terraform validate
# ✓ Success! The configuration is valid.
```

This allows CI/CD pipelines to validate Terraform syntax without requiring cloud credentials.

## Benefits of This Approach

1. **Portability**: Easy to implement on new providers
2. **Documentation**: Self-documenting infrastructure interface
3. **Validation**: Can validate without credentials
4. **Consistency**: Enforces consistent variable naming across providers
5. **Flexibility**: Provider implementations can optimize for platform-specific features

## Related Documentation

- [Provider Implementation Guide](../README.md)
- [GCP Implementation](../gcp/README.md)
- [AWS Implementation Plan](../aws/README.md)
- [Azure Implementation Plan](../azure/README.md)
