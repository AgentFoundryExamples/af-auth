# AF Auth - Terraform Infrastructure

This directory contains Terraform modules and provider-specific examples for deploying AF Auth to various cloud platforms.

## Overview

The infrastructure is organized into:

- **`modules/`**: Provider-agnostic reusable modules (network, database, redis, auth-service)
- **`gcp/`**: Google Cloud Platform implementation (Cloud Run, Cloud SQL, Memorystore)
- **`aws/`**: AWS implementation stub (ECS/Fargate, RDS, ElastiCache) - *not yet implemented*
- **`azure/`**: Azure implementation stub (Container Apps, PostgreSQL, Redis) - *not yet implemented*

## Quick Start

### Prerequisites

1. **Terraform**: Install Terraform 1.0 or later
   ```bash
   # macOS
   brew install terraform
   
   # Linux
   wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
   unzip terraform_1.6.0_linux_amd64.zip
   sudo mv terraform /usr/local/bin/
   ```

2. **Cloud Provider CLI**: Install the CLI for your chosen provider
   - **GCP**: [gcloud CLI](https://cloud.google.com/sdk/docs/install)
   - **AWS**: [AWS CLI](https://aws.amazon.com/cli/)
   - **Azure**: [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)

3. **Container Image**: Build and push your AF Auth container image
   ```bash
   # Build the image
   docker build -t af-auth:latest .
   
   # Push to your container registry (see provider-specific docs)
   ```

### Google Cloud Platform (GCP)

Comprehensive GCP deployment is available now.

```bash
cd infra/terraform/gcp

# Copy example files
cp terraform.tfvars.example terraform.tfvars
cp backend.tf.example backend.tf

# Edit terraform.tfvars with your values
vi terraform.tfvars

# Initialize Terraform
terraform init

# Review the plan
terraform plan

# Apply the configuration
terraform apply
```

See [`gcp/README.md`](./gcp/README.md) for detailed GCP deployment instructions.

### AWS (Coming Soon)

AWS deployment using ECS/Fargate is planned but not yet implemented.

See [`aws/README.md`](./aws/README.md) for the implementation plan and resource mapping.

### Azure (Coming Soon)

Azure deployment using Container Apps is planned but not yet implemented.

See [`azure/README.md`](./azure/README.md) for the implementation plan and resource mapping.

## Architecture

### Modules

The infrastructure uses provider-agnostic modules that can be implemented with different cloud providers:

```
modules/
├── network/          # VPC, subnets, private connectivity
├── database/         # PostgreSQL database (Cloud SQL, RDS, Azure Database)
├── redis/            # Redis cache (Memorystore, ElastiCache, Azure Cache)
└── auth-service/     # Container service (Cloud Run, ECS, Container Apps)
```

Each module defines variables and outputs that work across providers, while provider-specific implementations handle the actual resource creation.

### Provider Implementations

#### Google Cloud Platform (GCP)

- **Cloud Run**: Serverless container hosting with auto-scaling
- **Cloud SQL**: Managed PostgreSQL with automated backups
- **Cloud Memorystore**: Managed Redis for OAuth state and rate limiting
- **VPC Connector**: Private connectivity between Cloud Run and databases
- **Secret Manager**: Secure secret storage with IAM integration
- **IAM**: Service accounts and role bindings

#### AWS (Planned)

- **ECS on Fargate**: Serverless container orchestration
- **RDS PostgreSQL**: Managed PostgreSQL database
- **ElastiCache**: Managed Redis cluster
- **Application Load Balancer**: HTTPS load balancing with ACM certificates
- **VPC**: Virtual private cloud with public/private subnets
- **Secrets Manager**: Secret storage and rotation

#### Azure (Planned)

- **Azure Container Apps**: Serverless container hosting
- **Azure Database for PostgreSQL**: Managed PostgreSQL Flexible Server
- **Azure Cache for Redis**: Managed Redis service
- **Virtual Network**: Private networking with service integration
- **Key Vault**: Secret management with managed identity access
- **Azure Container Registry**: Private container image storage

## Configuration

### Required Variables

All provider implementations require these core variables:

- `project_id`: Cloud provider project/account identifier
- `region`: Primary deployment region
- `environment`: Environment name (production, staging, development)
- `container_image`: Full container image URI
- `database_password`: Database password (use Secret Manager)

### Optional Toggles

- `enable_private_networking`: Enable VPC/private networking (default: `true`)
- `enable_redis`: Enable Redis cache (default: `true`, set to `false` for minimal cost)
- `high_availability`: Enable multi-zone deployment (default: `false`)
- `backup_enabled`: Enable automated backups (default: `true`)

### Secret Management

Secrets should **never** be committed to version control. Use one of these methods:

1. **Cloud Secret Manager** (Recommended)
   - Store secrets in Secret Manager/Key Vault
   - Reference secrets in Terraform with `secret_environment_variables`

2. **Terraform Variables** (Development Only)
   - Pass secrets via `-var` flags or `terraform.tfvars` (gitignored)
   - Not recommended for production

3. **Environment Variables**
   - Export `TF_VAR_*` environment variables
   - Useful for CI/CD pipelines

Example using Secret Manager:

```hcl
secret_environment_variables = {
  GITHUB_CLIENT_ID     = "github-client-id"      # Secret Manager key
  GITHUB_CLIENT_SECRET = "github-client-secret"
  SESSION_SECRET       = "session-secret"
  JWT_PRIVATE_KEY      = "jwt-private-key"
}
```

## State Management

### Backend Configuration

Terraform state files contain sensitive data and should be stored securely:

#### GCP - Cloud Storage

```hcl
terraform {
  backend "gcs" {
    bucket = "your-terraform-state-bucket"
    prefix = "terraform/af-auth"
  }
}
```

#### AWS - S3 with DynamoDB Locking

```hcl
terraform {
  backend "s3" {
    bucket         = "your-terraform-state-bucket"
    key            = "af-auth/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}
```

#### Azure - Azure Storage

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

#### Local Backend (Development/Testing)

For local testing without cloud credentials:

```hcl
terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}
```

### State File Security

- **Never commit** `terraform.tfstate` or `terraform.tfstate.backup`
- Enable versioning on state storage buckets
- Use encryption at rest for state files
- Restrict access with IAM policies
- Enable state locking to prevent concurrent modifications

## Validation

### Terraform Validation

Validate your configuration before applying:

```bash
# Format Terraform files
terraform fmt -recursive

# Validate configuration
terraform validate

# Check for security issues
terraform plan -out=plan.tfplan
```

### npm Scripts

Add these scripts to `package.json` for convenience:

```json
{
  "scripts": {
    "terraform:validate": "cd infra/terraform/gcp && terraform validate",
    "terraform:fmt": "terraform fmt -recursive infra/terraform",
    "terraform:plan": "cd infra/terraform/gcp && terraform plan",
    "terraform:apply": "cd infra/terraform/gcp && terraform apply"
  }
}
```

Usage:

```bash
npm run terraform:validate
npm run terraform:fmt
npm run terraform:plan
```

## Deployment Workflow

### Initial Deployment

1. **Create Secrets** in your cloud provider's secret manager
   ```bash
   # GCP example
   echo -n "your_client_id" | gcloud secrets create github-client-id --data-file=-
   echo -n "your_client_secret" | gcloud secrets create github-client-secret --data-file=-
   openssl rand -hex 32 | gcloud secrets create session-secret --data-file=-
   ```

2. **Build and Push Container Image**
   ```bash
   docker build -t af-auth:latest .
   # Push to your container registry (GCR, ECR, ACR)
   ```

3. **Initialize Terraform**
   ```bash
   cd infra/terraform/gcp  # or aws/ or azure/
   terraform init
   ```

4. **Configure Variables**
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   ```

5. **Plan and Apply**
   ```bash
   terraform plan -out=plan.tfplan
   terraform apply plan.tfplan
   ```

6. **Run Database Migrations**
   ```bash
   # Connect to your service and run migrations
   # GCP example:
   gcloud run services proxy af-auth-production --port=3000
   # Then run: npm run db:migrate
   ```

### Updates and Changes

1. **Update Container Image**
   ```bash
   docker build -t af-auth:v2 .
   # Push new version
   ```

2. **Update Terraform Variables**
   ```bash
   # Edit terraform.tfvars with new image tag
   container_image = "gcr.io/project/af-auth:v2"
   ```

3. **Apply Changes**
   ```bash
   terraform plan
   terraform apply
   ```

### Rollback

If a deployment fails:

```bash
# Revert to previous container image
terraform plan -var="container_image=gcr.io/project/af-auth:v1"
terraform apply -var="container_image=gcr.io/project/af-auth:v1"

# Or use Terraform state to rollback
terraform state list
terraform state show google_cloud_run_v2_service.auth_service
```

## Cost Optimization

### Minimal Deployment

For development or low-traffic environments, reduce costs by:

```hcl
# Disable Redis (not recommended for production multi-instance)
enable_redis = false

# Use smallest database tier
database_tier = "db-f1-micro"  # GCP

# Disable high availability
high_availability = false

# Scale to zero when idle
min_instances = 0

# Disable backups (dev only)
backup_enabled = false
```

### Production Deployment

For production, ensure reliability:

```hcl
# Enable Redis for multi-instance deployments
enable_redis = true
redis_tier = "STANDARD_HA"  # High availability

# Use production-grade database
database_tier = "db-n1-standard-1"  # GCP
high_availability = true

# Prevent cold starts
min_instances = 1

# Enable backups
backup_enabled = true
backup_retention_days = 7
```

## Troubleshooting

### Common Issues

#### 1. Terraform Init Fails

**Problem**: Cannot initialize without cloud credentials

**Solution**: Use local backend for validation

```hcl
# backend.tf
terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}
```

#### 2. Container Image Not Found

**Problem**: Service fails to deploy with image pull errors

**Solution**: Verify image exists and IAM permissions

```bash
# GCP: Grant Cloud Run access to Artifact Registry
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.reader"
```

#### 3. Database Connection Fails

**Problem**: Service cannot connect to database

**Solution**: Check network configuration and Cloud SQL proxy

- Verify VPC connector is attached to Cloud Run
- Ensure service account has `cloudsql.client` role
- Check database connection string format

#### 4. Secrets Not Available

**Problem**: Service fails with missing environment variables

**Solution**: Verify Secret Manager configuration

```bash
# GCP: Check secret exists
gcloud secrets list

# Grant service account access
gcloud secrets add-iam-policy-binding SECRET_NAME \
  --member="serviceAccount:SERVICE_ACCOUNT@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Validation Commands

```bash
# Check Terraform syntax
terraform fmt -check

# Validate configuration
terraform validate

# Show current state
terraform show

# List all resources
terraform state list

# Check specific resource
terraform state show google_cloud_run_v2_service.auth_service

# Refresh state from cloud
terraform refresh
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy with Terraform

on:
  push:
    branches: [main]

jobs:
  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2
        with:
          terraform_version: 1.6.0
      
      - name: Terraform Init
        run: |
          cd infra/terraform/gcp
          terraform init
      
      - name: Terraform Plan
        run: |
          cd infra/terraform/gcp
          terraform plan -out=plan.tfplan
      
      - name: Terraform Apply
        if: github.ref == 'refs/heads/main'
        run: |
          cd infra/terraform/gcp
          terraform apply -auto-approve plan.tfplan
```

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use separate environments** (dev, staging, production) with different projects
3. **Enable audit logging** for all infrastructure changes
4. **Use least-privilege IAM** roles and service accounts
5. **Enable encryption** at rest and in transit
6. **Rotate secrets regularly** according to security policies
7. **Review Terraform plans** carefully before applying
8. **Use state locking** to prevent concurrent modifications
9. **Back up state files** with versioning enabled
10. **Scan for vulnerabilities** in container images

## Contributing

To add support for a new cloud provider:

1. Create a new directory under `infra/terraform/` (e.g., `digitalocean/`)
2. Implement the same resources as GCP but using provider-specific APIs
3. Use consistent variable names and module interfaces
4. Add a comprehensive README with setup instructions
5. Include example `.tfvars` and `backend.tf` files
6. Document any provider-specific quirks or limitations
7. Test with both minimal and production configurations

## Resources

- [Terraform Documentation](https://www.terraform.io/docs)
- [Google Cloud Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Azure Provider](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)
- [AF Auth Documentation](../../README.md)
- [Cloud Run Deployment Guide](../../docs/deployment/cloud-run.md)
