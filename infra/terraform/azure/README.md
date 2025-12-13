# Azure Deployment (Placeholder)

This directory contains a placeholder for Azure deployment using Azure Container Apps, Azure Database for PostgreSQL, and Azure Cache for Redis.

## Status

⚠️ **Not Yet Implemented** - This is a stub to demonstrate provider portability.

## Planned Resources

When implemented, this will provision:

- **Azure Container Apps**: Serverless container hosting for the AF Auth service
- **Azure Database for PostgreSQL**: Managed PostgreSQL database
- **Azure Cache for Redis**: Managed Redis cache
- **Azure Virtual Network**: Virtual network for private connectivity
- **Azure Key Vault**: Secret storage and rotation
- **Azure Managed Identity**: Service authentication

## Implementation Guide

To implement Azure support, create the following files:

### Required Files

1. **main.tf**: Azure resource definitions
   - Container Apps environment and app
   - PostgreSQL Flexible Server
   - Azure Cache for Redis
   - Virtual Network and subnets
   - Key Vault for secrets
   - Managed Identity and role assignments

2. **variables.tf**: Input variables
   - Azure region
   - Container image URI (Azure Container Registry)
   - Database configuration
   - Redis configuration
   - Scaling parameters

3. **outputs.tf**: Output values
   - Service URL
   - Database endpoint
   - Redis endpoint

4. **terraform.tfvars.example**: Example variable values
   - Copy from GCP example and adapt for Azure

5. **backend.tf.example**: Azure Storage backend configuration
   ```hcl
   terraform {
     backend "azurerm" {
       resource_group_name  = "terraform-state-rg"
       storage_account_name = "terraformstate"
       container_name       = "tfstate"
       key                  = "af-auth.terraform.tfstate"
     }
   }
   ```

## Key Differences from GCP

- **Container Apps** instead of Cloud Run
- **PostgreSQL Flexible Server** instead of Cloud SQL
- **Azure Cache for Redis** instead of Cloud Memorystore
- **Azure Container Registry (ACR)** for container images
- **Key Vault** for secrets (different API from Secret Manager)
- **Managed Identity** for service authentication
- **Virtual Network Integration** for private connectivity

## Resource Mapping

| GCP Resource | Azure Equivalent |
|--------------|------------------|
| Cloud Run | Azure Container Apps |
| Cloud SQL | Azure Database for PostgreSQL |
| Cloud Memorystore | Azure Cache for Redis |
| VPC Connector | Virtual Network Integration |
| Secret Manager | Key Vault |
| Artifact Registry | Azure Container Registry (ACR) |
| IAM Service Account | Managed Identity |

## Container Image

Build and push to Azure Container Registry:

```bash
# Create ACR
az acr create \
  --resource-group af-auth-rg \
  --name afauthacr \
  --sku Basic

# Login to ACR
az acr login --name afauthacr

# Build and push
docker build -t af-auth .
docker tag af-auth:latest afauthacr.azurecr.io/af-auth:latest
docker push afauthacr.azurecr.io/af-auth:latest
```

## Secrets Management

Create secrets in Azure Key Vault:

```bash
# Create Key Vault
az keyvault create \
  --name af-auth-kv \
  --resource-group af-auth-rg \
  --location eastus

# GitHub OAuth credentials
az keyvault secret set \
  --vault-name af-auth-kv \
  --name github-client-id \
  --value "your_client_id"

az keyvault secret set \
  --vault-name af-auth-kv \
  --name github-client-secret \
  --value "your_client_secret"

# Session secret
az keyvault secret set \
  --vault-name af-auth-kv \
  --name session-secret \
  --value "$(openssl rand -hex 32)"

# JWT keys (base64-encoded PEM)
az keyvault secret set \
  --vault-name af-auth-kv \
  --name jwt-private-key \
  --value "$(base64 jwt-private.pem)"

az keyvault secret set \
  --vault-name af-auth-kv \
  --name jwt-public-key \
  --value "$(base64 jwt-public.pem)"
```

## Network Configuration

AF Auth requires:
- Virtual Network with subnets for Container Apps, PostgreSQL, and Redis
- Private endpoints for database and cache
- Virtual Network integration for Container Apps
- Network Security Groups for traffic control

## Container Apps Configuration

Azure Container Apps features:
- **Scale to zero**: Similar to Cloud Run min_instances=0
- **Ingress**: HTTPS endpoints with custom domains
- **Secrets**: Environment variables from Key Vault
- **Managed Identity**: Authentication without credentials
- **Dapr integration**: Optional for service mesh features

## Contributing

If you implement Azure support, please:
1. Use the same variable naming conventions as GCP
2. Follow Azure best practices for security and networking
3. Document any Azure-specific configuration
4. Test with both private and public networking modes
5. Ensure Redis can be toggled for minimal deployments
6. Consider using Azure Front Door for CDN/WAF if needed
