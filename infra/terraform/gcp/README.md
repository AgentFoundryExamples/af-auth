# AF Auth - Google Cloud Platform Deployment

Complete Terraform configuration for deploying AF Auth to Google Cloud Platform using Cloud Run, Cloud SQL, and Cloud Memorystore.

## Architecture

```mermaid
graph TB
    subgraph "Internet"
        Users[Users/Clients]
        GitHub[GitHub OAuth]
    end
    
    subgraph "Google Cloud Platform"
        subgraph "Cloud Run"
            Service[AF Auth Service<br/>Auto-scaling containers]
        end
        
        subgraph "Cloud SQL"
            DB[(PostgreSQL<br/>Database)]
        end
        
        subgraph "Cloud Memorystore"
            Redis[(Redis Cache<br/>OAuth state & rate limiting)]
        end
        
        subgraph "VPC"
            VPC[Private Network]
            Connector[VPC Connector]
        end
        
        subgraph "Secret Manager"
            Secrets[Encrypted Secrets:<br/>- GitHub OAuth<br/>- JWT Keys<br/>- Session Secret<br/>- Encryption Keys]
        end
        
        subgraph "IAM"
            SA[Service Account<br/>Cloud Run]
        end
    end
    
    Users -->|HTTPS| Service
    Service -->|OAuth Flow| GitHub
    Service -.->|IAM Read| Secrets
    Service -->|VPC Connector| VPC
    VPC --> DB
    VPC --> Redis
    SA -.->|IAM Roles| DB
    SA -.->|IAM Roles| Secrets
```

## Prerequisites

1. **Google Cloud Project**: Active GCP project with billing enabled
2. **gcloud CLI**: Installed and authenticated
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```
3. **Terraform**: Version 1.0 or later
4. **Docker**: For building container images
5. **Required APIs**: Enable all necessary GCP APIs
   ```bash
   gcloud services enable \
     run.googleapis.com \
     artifactregistry.googleapis.com \
     secretmanager.googleapis.com \
     sqladmin.googleapis.com \
     compute.googleapis.com \
     redis.googleapis.com \
     logging.googleapis.com \
     monitoring.googleapis.com
   ```

## Quick Start

### 1. Build and Push Container Image

```bash
# Create Artifact Registry repository
gcloud artifacts repositories create af-auth \
  --repository-format=docker \
  --location=us-central1 \
  --description="AF Auth container images"

# Configure Docker authentication
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build image
docker build -t af-auth:latest .

# Tag and push
docker tag af-auth:latest \
  us-central1-docker.pkg.dev/YOUR_PROJECT_ID/af-auth/af-auth:latest
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/af-auth/af-auth:latest
```

### 2. Create Secrets in Secret Manager

```bash
# GitHub OAuth credentials
echo -n "your_github_client_id" | \
  gcloud secrets create github-client-id --data-file=-

echo -n "your_github_client_secret" | \
  gcloud secrets create github-client-secret --data-file=-

# Session secret (CSRF protection)
openssl rand -hex 32 | \
  gcloud secrets create session-secret --data-file=-

# Generate and store JWT keys
openssl genpkey -algorithm RSA -out jwt-private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in jwt-private.pem -out jwt-public.pem

# Store JWT keys (base64-encoded)
base64 -w 0 jwt-private.pem | \
  gcloud secrets create jwt-private-key --data-file=-
base64 -w 0 jwt-public.pem | \
  gcloud secrets create jwt-public-key --data-file=-

# GitHub token encryption key
openssl rand -hex 32 | \
  gcloud secrets create github-token-encryption-key --data-file=-

# Metrics authentication token
openssl rand -hex 32 | \
  gcloud secrets create metrics-auth-token --data-file=-

# Clean up local key files (NEVER commit these)
rm jwt-private.pem jwt-public.pem
```

### 3. Create State Bucket

```bash
# Create bucket for Terraform state
gsutil mb -p YOUR_PROJECT_ID \
  -c STANDARD \
  -l us-central1 \
  gs://YOUR_PROJECT_ID-terraform-state

# Enable versioning
gsutil versioning set on gs://YOUR_PROJECT_ID-terraform-state

# Create lifecycle policy to keep only last 10 versions
cat > lifecycle.json << 'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {
          "numNewerVersions": 10,
          "isLive": false
        }
      }
    ]
  }
}
EOF

gsutil lifecycle set lifecycle.json gs://YOUR_PROJECT_ID-terraform-state
rm lifecycle.json
```

### 4. Configure Terraform

```bash
# Copy example files
cp terraform.tfvars.example terraform.tfvars
cp backend.tf.example backend.tf

# Edit backend.tf with your bucket name
vi backend.tf

# Edit terraform.tfvars with your configuration
vi terraform.tfvars
```

### 5. Deploy Infrastructure

```bash
# Initialize Terraform
terraform init

# Review the execution plan
terraform plan

# Apply the configuration
terraform apply
```

### 6. Run Database Migrations

After deployment, run Prisma migrations:

```bash
# Get the service URL from Terraform output
export SERVICE_URL=$(terraform output -raw service_url)

# Option 1: Create a Cloud Run Job for migrations
gcloud run jobs create af-auth-migrate \
  --image=$(terraform output -raw container_image) \
  --region=us-central1 \
  --command=npm \
  --args="run,db:migrate" \
  --set-cloudsql-instances=$(terraform output -raw database_connection_name) \
  --set-env-vars="NODE_ENV=production,DATABASE_URL=postgresql://..."

gcloud run jobs execute af-auth-migrate --region=us-central1

# Option 2: Run migrations locally with Cloud SQL Proxy
cloud-sql-proxy $(terraform output -raw database_connection_name) &
npm run db:migrate
```

## Configuration

### terraform.tfvars

Required variables:

```hcl
project_id      = "your-gcp-project-id"
region          = "us-central1"
environment     = "production"
container_image = "us-central1-docker.pkg.dev/your-project/af-auth/af-auth:latest"

# Database password (or use Secret Manager)
database_password = "CHANGE_ME"

# Secret references
secret_environment_variables = {
  GITHUB_CLIENT_ID            = "github-client-id"
  GITHUB_CLIENT_SECRET        = "github-client-secret"
  SESSION_SECRET              = "session-secret"
  JWT_PRIVATE_KEY             = "jwt-private-key"
  JWT_PUBLIC_KEY              = "jwt-public-key"
  GITHUB_TOKEN_ENCRYPTION_KEY = "github-token-encryption-key"
  METRICS_AUTH_TOKEN          = "metrics-auth-token"
}
```

See `terraform.tfvars.example` for all available options.

### Environment-Specific Configurations

#### Development

```hcl
environment               = "development"
database_tier             = "db-f1-micro"
redis_tier                = "BASIC"
redis_memory_size_gb      = 1
min_instances             = 0
max_instances             = 3
high_availability         = false
backup_enabled            = true
enable_private_networking = false  # Simpler for dev
```

#### Staging

```hcl
environment               = "staging"
database_tier             = "db-g1-small"
redis_tier                = "BASIC"
redis_memory_size_gb      = 2
min_instances             = 0
max_instances             = 5
high_availability         = false
backup_enabled            = true
enable_private_networking = true
```

#### Production

```hcl
environment               = "production"
database_tier             = "db-n1-standard-1"
redis_tier                = "STANDARD_HA"
redis_memory_size_gb      = 5
min_instances             = 1
max_instances             = 10
high_availability         = true
backup_enabled            = true
backup_retention_days     = 30
enable_private_networking = true
```

## Resources Created

This Terraform configuration creates:

1. **VPC Network** (if `enable_private_networking = true`)
   - Private VPC network
   - Private subnet for resources
   - VPC Access Connector for Cloud Run

2. **Cloud SQL PostgreSQL**
   - PostgreSQL 15 instance
   - Database and user
   - Automated backups
   - Private IP (if VPC enabled)

3. **Cloud Memorystore Redis** (if `enable_redis = true`)
   - Redis 7.0 instance
   - Private VPC attachment

4. **Cloud Run Service**
   - Auto-scaling container service
   - VPC connector attachment
   - Environment variables and secrets
   - Public HTTPS endpoint

5. **IAM Resources**
   - Service account for Cloud Run
   - IAM roles for Cloud SQL and Secret Manager

## Outputs

After applying, Terraform outputs:

```bash
# View all outputs
terraform output

# Specific outputs
terraform output service_url           # Public URL of your service
terraform output database_connection_name
terraform output service_account_email
```

## Cost Estimation

### Minimal Configuration (Development)

- **Cloud Run**: ~$0-5/month (scale to zero)
- **Cloud SQL** (db-f1-micro): ~$7-10/month
- **Redis** (1GB BASIC): ~$20/month
- **Total**: ~$27-35/month

### Production Configuration

- **Cloud Run**: ~$20-100/month (depending on traffic)
- **Cloud SQL** (db-n1-standard-1 HA): ~$200-300/month
- **Redis** (5GB STANDARD_HA): ~$150/month
- **Networking**: ~$10-50/month
- **Total**: ~$380-600/month

Cost can be reduced by:
- Setting `enable_redis = false` (not recommended for multi-instance)
- Using smaller database tiers
- Scaling to zero with `min_instances = 0`
- Disabling high availability in non-production

## Updates and Rollbacks

### Update Container Image

```bash
# Build new version
docker build -t af-auth:v2 .
docker push us-central1-docker.pkg.dev/PROJECT/af-auth/af-auth:v2

# Update terraform.tfvars
container_image = "us-central1-docker.pkg.dev/PROJECT/af-auth/af-auth:v2"

# Apply update
terraform apply
```

### Rollback

```bash
# Revert to previous image
terraform apply -var="container_image=...previous_image..."

# Or edit terraform.tfvars and apply
```

### Database Backup/Restore

```bash
# List backups
gcloud sql backups list --instance=af-auth-db-production

# Restore from backup
gcloud sql backups restore BACKUP_ID \
  --backup-instance=af-auth-db-production \
  --backup-instance-region=us-central1
```

## Monitoring and Logging

### Cloud Logging

```bash
# View Cloud Run logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=af-auth-production" \
  --limit=50 \
  --format=json

# View error logs
gcloud logging read \
  "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit=50
```

### Cloud Monitoring

Access metrics at:
- Cloud Console: https://console.cloud.google.com/monitoring
- Metrics Explorer: Filter by `cloud_run_revision`

Key metrics:
- Request count
- Request latency
- Error rate
- Container CPU/memory utilization

### Prometheus Metrics

```bash
# Get service URL
export SERVICE_URL=$(terraform output -raw service_url)

# Get metrics auth token from Secret Manager
export METRICS_TOKEN=$(gcloud secrets versions access latest --secret=metrics-auth-token)

# Fetch metrics
curl -H "Authorization: Bearer $METRICS_TOKEN" $SERVICE_URL/metrics
```

## Troubleshooting

### Cloud Run Deploy Fails

```bash
# Check Cloud Run logs
gcloud run services logs tail af-auth-production --region=us-central1

# Check service status
gcloud run services describe af-auth-production --region=us-central1
```

### Database Connection Issues

```bash
# Test Cloud SQL connection
gcloud sql instances describe af-auth-db-production

# Check VPC connector
gcloud compute networks vpc-access connectors describe \
  af-auth-production-vpc-connector \
  --region=us-central1

# Test with Cloud SQL Proxy
cloud-sql-proxy $(terraform output -raw database_connection_name)
```

### Redis Connection Issues

```bash
# Check Redis instance
gcloud redis instances describe af-auth-redis-production --region=us-central1

# Test Redis connectivity (from Cloud Shell or Compute Engine VM in same VPC)
telnet $(terraform output -raw redis_host) 6379
```

### Secret Access Issues

```bash
# Check secret exists
gcloud secrets describe github-client-id

# Verify IAM permissions
gcloud secrets get-iam-policy github-client-id

# Grant service account access
gcloud secrets add-iam-policy-binding github-client-id \
  --member="serviceAccount:$(terraform output -raw service_account_email)" \
  --role="roles/secretmanager.secretAccessor"
```

## Security Best Practices

1. **Use Private Networking**: Set `enable_private_networking = true`
2. **Enable SSL**: Set `enable_ssl = true` for database connections
3. **Rotate Secrets**: Regularly rotate secrets in Secret Manager
4. **Least Privilege IAM**: Service account only has required permissions
5. **Audit Logging**: Enable Cloud Audit Logs for all resources
6. **Restrict Database Access**: Use private IP and firewall rules
7. **Enable Deletion Protection**: Set for production databases
8. **Use HTTPS**: Cloud Run provides HTTPS by default
9. **Rate Limiting**: Configure appropriate rate limits
10. **Monitor Alerts**: Set up Cloud Monitoring alerts for errors

## Cleanup

To destroy all resources:

```bash
# Review what will be destroyed
terraform plan -destroy

# Destroy all resources
terraform destroy

# Note: Deletion protection must be disabled for production databases
# Edit main.tf and set deletion_protection = false, then apply before destroying
```

## Next Steps

After deployment:

1. **Configure GitHub OAuth**: Update callback URL in GitHub App settings
2. **Whitelist Users**: Add users to the database whitelist
3. **Set Up Monitoring**: Configure Cloud Monitoring alerts
4. **Custom Domain**: Map a custom domain to Cloud Run
5. **CI/CD Pipeline**: Automate deployments with Cloud Build or GitHub Actions
6. **Load Testing**: Test with expected traffic patterns
7. **Backup Strategy**: Document backup and restore procedures

## Support

For issues or questions:
- Check the [main documentation](../../../README.md)
- Review [Cloud Run deployment guide](../../../docs/deployment/cloud-run.md)
- File an issue on GitHub
