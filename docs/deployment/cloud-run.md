# Cloud Run Deployment Guide

This guide provides comprehensive instructions for deploying the AF Auth service to Google Cloud Run, including container building, secret management, IAM configuration, and production best practices.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Overview](#architecture-overview)
- [Initial Setup](#initial-setup)
- [Building and Pushing Container](#building-and-pushing-container)
- [Database Setup](#database-setup)
- [Secret Manager Configuration](#secret-manager-configuration)
- [IAM and Service Accounts](#iam-and-service-accounts)
- [Deploying to Cloud Run](#deploying-to-cloud-run)
- [Environment Variables](#environment-variables)
- [Networking and VPC](#networking-and-vpc)
- [HTTPS and Custom Domains](#https-and-custom-domains)
- [Scaling Configuration](#scaling-configuration)
- [Monitoring and Logging](#monitoring-and-logging)
- [Updates and Rollbacks](#updates-and-rollbacks)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying to Cloud Run, ensure you have:

- **Google Cloud Project**: Active GCP project with billing enabled
- **gcloud CLI**: Installed and authenticated ([Install Guide](https://cloud.google.com/sdk/docs/install))
- **Docker**: Installed locally for building containers
- **Project Permissions**: Editor or Owner role on the GCP project
- **APIs Enabled**:
  - Cloud Run API
  - Artifact Registry API
  - Secret Manager API
  - Cloud SQL Admin API
  - Cloud Logging API

Enable all required APIs:

```bash
gcloud services enable run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  logging.googleapis.com \
  compute.googleapis.com
```

## Architecture Overview

```mermaid
graph TB
    subgraph "Internet"
        Users[Users/CLI]
        GitHub[GitHub OAuth]
    end
    
    subgraph "Google Cloud Platform"
        subgraph "Cloud Run"
            Service[AF Auth Service<br/>Container]
        end
        
        subgraph "Artifact Registry"
            Registry[Container Images]
        end
        
        subgraph "Cloud SQL"
            DB[(PostgreSQL<br/>Database)]
        end
        
        subgraph "Secret Manager"
            Secrets[Secrets:<br/>- GitHub OAuth<br/>- DB Credentials<br/>- JWT Keys<br/>- Session Secret]
        end
        
        subgraph "Cloud Logging"
            Logs[Structured Logs<br/>& Metrics]
        end
    end
    
    Users -->|HTTPS| Service
    Service -->|OAuth Flow| GitHub
    Service -->|Read| Secrets
    Service -->|Query| DB
    Service -->|Stream| Logs
    Registry -->|Pull| Service
```

## Initial Setup

### 1. Set Environment Variables

Define your GCP project and region:

```bash
# Set your project ID
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export SERVICE_NAME="af-auth"

# Configure gcloud
gcloud config set project ${PROJECT_ID}
gcloud config set run/region ${REGION}
```

### 2. Create Artifact Registry Repository

Create a Docker repository for storing container images:

```bash
# Create repository
gcloud artifacts repositories create ${SERVICE_NAME} \
  --repository-format=docker \
  --location=${REGION} \
  --description="AF Auth service container images"

# Configure Docker authentication
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

Verify the repository was created:

```bash
gcloud artifacts repositories list --location=${REGION}
```

## Building and Pushing Container

### 1. Dockerfile

The project includes a production-ready Dockerfile. If you need to create or customize it, here's the recommended structure:

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY prisma ./prisma

# Generate Prisma client
RUN npm run db:generate

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port (Cloud Run will inject PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "dist/server.js"]
```

### 2. Build Container Locally (Optional)

Test the build locally:

```bash
# Build the container
docker build -t ${SERVICE_NAME}:latest .

# Test locally (requires .env file)
docker run -p 3000:3000 --env-file .env ${SERVICE_NAME}:latest

# Test health endpoint
curl http://localhost:3000/health
```

### 3. Build and Push to Artifact Registry

#### Option A: Using Cloud Build (Recommended)

Cloud Build is recommended for production as it handles everything server-side:

```bash
# Build and push in one command
gcloud builds submit \
  --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:latest

# Tag with version for rollback capability
gcloud builds submit \
  --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:v1.1.0
```

#### Option B: Using Docker Locally

Alternatively, build locally and push:

```bash
# Tag the image
docker tag ${SERVICE_NAME}:latest \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:latest

# Push to Artifact Registry
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:latest
```

### 4. Verify Image Upload

```bash
gcloud artifacts docker images list \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}
```

## Database Setup

See [Database Deployment Guide](../database.md#cloud-sql-setup) for detailed Cloud SQL setup instructions.

Quick setup:

```bash
# Create Cloud SQL instance
gcloud sql instances create ${SERVICE_NAME}-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=${REGION} \
  --root-password="$(openssl rand -base64 32)"

# Create database
gcloud sql databases create af_auth \
  --instance=${SERVICE_NAME}-db

# Get connection name
gcloud sql instances describe ${SERVICE_NAME}-db \
  --format='value(connectionName)'
```

## Redis Setup (Cloud Memorystore)

Redis is **required** for production multi-instance deployments to store OAuth state tokens across instances.

### 1. Create Redis Instance

```bash
# Create a basic Redis instance (production should use higher tier)
gcloud redis instances create ${SERVICE_NAME}-redis \
  --size=1 \
  --region=${REGION} \
  --redis-version=redis_7_0 \
  --tier=basic

# For production, use standard tier with high availability
gcloud redis instances create ${SERVICE_NAME}-redis \
  --size=1 \
  --region=${REGION} \
  --redis-version=redis_7_0 \
  --tier=standard \
  --replica-count=1

# Get Redis instance details
gcloud redis instances describe ${SERVICE_NAME}-redis \
  --region=${REGION}

# Note the host IP and port (default 6379)
export REDIS_HOST=$(gcloud redis instances describe ${SERVICE_NAME}-redis \
  --region=${REGION} \
  --format='value(host)')
export REDIS_PORT=$(gcloud redis instances describe ${SERVICE_NAME}-redis \
  --region=${REGION} \
  --format='value(port)')

echo "Redis Host: ${REDIS_HOST}"
echo "Redis Port: ${REDIS_PORT}"
```

### 2. Create VPC Connector

Cloud Run needs a VPC connector to access Memorystore (Redis):

```bash
# Create VPC connector
gcloud compute networks vpc-access connectors create ${SERVICE_NAME}-connector \
  --region=${REGION} \
  --network=default \
  --range=10.8.0.0/28

# Verify connector is ready
gcloud compute networks vpc-access connectors describe ${SERVICE_NAME}-connector \
  --region=${REGION}
```

### 3. Configure Redis Auth (Optional but Recommended)

```bash
# Enable AUTH for Redis instance
gcloud redis instances update ${SERVICE_NAME}-redis \
  --region=${REGION} \
  --auth-enabled

# Get AUTH string
export REDIS_PASSWORD=$(gcloud redis instances get-auth-string ${SERVICE_NAME}-redis \
  --region=${REGION} \
  --format='value(authString)')

# Store in Secret Manager
echo -n "${REDIS_PASSWORD}" | \
  gcloud secrets create redis-password --data-file=-
```

## Secret Manager Configuration

### 1. Create Required Secrets

AF Auth requires the following secrets. **Note**: JWT keys, GitHub App private key, and GitHub token encryption key must be base64-encoded.

```bash
# Database URL with SSL enabled for production
# Recommended: Use IAM database authentication with SSL
# Example for IAM auth: postgresql://af-auth-sa@project-id.iam.gserviceaccount.com@/af_auth?host=/cloudsql/PROJECT:REGION:INSTANCE&sslmode=require
# Example for password auth: postgresql://USER:PASSWORD@/af_auth?host=/cloudsql/PROJECT:REGION:INSTANCE&sslmode=require
echo -n "postgresql://af-auth-sa@project-id.iam.gserviceaccount.com@/af_auth?host=/cloudsql/PROJECT:REGION:INSTANCE&sslmode=require" | \
  gcloud secrets create database-url --data-file=-

# GitHub App ID
echo -n "123456" | \
  gcloud secrets create github-app-id --data-file=-

# GitHub Installation ID
echo -n "12345678" | \
  gcloud secrets create github-installation-id --data-file=-

# GitHub App Private Key (base64-encoded)
base64 -w 0 < /path/to/your-app.private-key.pem | \
  gcloud secrets create github-app-private-key --data-file=-

# GitHub OAuth Client ID
echo -n "your_github_client_id" | \
  gcloud secrets create github-client-id --data-file=-

# GitHub OAuth Client Secret
echo -n "your_github_client_secret" | \
  gcloud secrets create github-client-secret --data-file=-

# GitHub Token Encryption Key (NEW - for encrypting tokens in database)
# Generate a strong 256-bit key
openssl rand -hex 32 | \
  gcloud secrets create github-token-encryption-key --data-file=-

# Session Secret (for CSRF protection)
openssl rand -hex 32 | \
  gcloud secrets create session-secret --data-file=-

# JWT Keys - MUST be base64-encoded PEM format
# Step 1: Generate RSA key pair if you don't have one
openssl genpkey -algorithm RSA -out /tmp/jwt-private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in /tmp/jwt-private.pem -out /tmp/jwt-public.pem

# Step 2: Base64 encode and store in Secret Manager
base64 -w 0 /tmp/jwt-private.pem | \
  gcloud secrets create jwt-private-key --data-file=-

base64 -w 0 /tmp/jwt-public.pem | \
  gcloud secrets create jwt-public-key --data-file=-

# Step 3: Clean up temporary files
rm /tmp/jwt-private.pem /tmp/jwt-public.pem
```

**Security Note**: 
- JWT private key is base64-encoded for environment variable transmission
- GitHub tokens are encrypted at rest in the database using AES-256-GCM
- Database connections use SSL/TLS by default in production

### 2. Verify Secrets

```bash
gcloud secrets list
```

Expected output should include:
- database-url
- github-client-id
- github-client-secret
- github-token-encryption-key (NEW)
- session-secret
- jwt-private-key
- jwt-public-key

### 3. Secret Versioning

Secrets support versioning for rotation:

```bash
# Add new version
echo -n "new_secret_value" | \
  gcloud secrets versions add github-client-secret --data-file=-

# List versions
gcloud secrets versions list github-client-secret

# Access specific version
gcloud secrets versions access 2 --secret=github-client-secret
```

## IAM and Service Accounts

### 1. Create Service Account

Create a dedicated service account for Cloud Run:

```bash
# Create service account
gcloud iam service-accounts create ${SERVICE_NAME}-sa \
  --description="Service account for AF Auth Cloud Run service" \
  --display-name="AF Auth Service Account"

# Get the service account email
export SA_EMAIL="${SERVICE_NAME}-sa@${PROJECT_ID}.iam.gserviceaccount.com"
```

### 2. Grant Secret Manager Access

```bash
# Grant permission to access all secrets
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor"

# OR grant per-secret permissions (more secure - RECOMMENDED)
for secret in database-url github-client-id github-client-secret github-token-encryption-key session-secret jwt-private-key jwt-public-key; do
  gcloud secrets add-iam-policy-binding ${secret} \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 3. Grant Cloud SQL Access

```bash
# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudsql.client"
```

### 4. Grant Logging Access

```bash
# Grant Log Writer role (usually automatic, but explicit is safer)
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/logging.logWriter"
```

## Deploying to Cloud Run

### 1. Initial Deployment

Deploy the service with all configuration including Redis:

```bash
gcloud run deploy ${SERVICE_NAME} \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:latest \
  --platform=managed \
  --region=${REGION} \
  --service-account=${SA_EMAIL} \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,LOG_LEVEL=info,LOG_PRETTY=false" \
  --set-env-vars="BASE_URL=https://${SERVICE_NAME}-PROJECT_HASH-${REGION}.a.run.app" \
  --set-env-vars="GITHUB_CALLBACK_URL=https://${SERVICE_NAME}-PROJECT_HASH-${REGION}.a.run.app/auth/github/callback" \
  --set-env-vars="JWT_EXPIRES_IN=30d,JWT_ISSUER=https://${SERVICE_NAME}-PROJECT_HASH-${REGION}.a.run.app" \
  --set-env-vars="REDIS_HOST=${REDIS_HOST},REDIS_PORT=${REDIS_PORT},REDIS_DB=0" \
  --set-env-vars="REDIS_STATE_TTL_SECONDS=600" \
  --set-secrets="DATABASE_URL=database-url:latest" \
  --set-secrets="GITHUB_APP_ID=github-app-id:latest" \
  --set-secrets="GITHUB_INSTALLATION_ID=github-installation-id:latest" \
  --set-secrets="GITHUB_APP_PRIVATE_KEY=github-app-private-key:latest" \
  --set-secrets="GITHUB_CLIENT_ID=github-client-id:latest" \
  --set-secrets="GITHUB_CLIENT_SECRET=github-client-secret:latest" \
  --set-secrets="GITHUB_TOKEN_ENCRYPTION_KEY=github-token-encryption-key:latest" \
  --set-secrets="SESSION_SECRET=session-secret:latest" \
  --set-secrets="REDIS_PASSWORD=redis-password:latest" \
  --set-secrets="JWT_PRIVATE_KEY=jwt-private-key:latest" \
  --set-secrets="JWT_PUBLIC_KEY=jwt-public-key:latest" \
  --add-cloudsql-instances=${PROJECT_ID}:${REGION}:${SERVICE_NAME}-db \
  --vpc-connector=${SERVICE_NAME}-connector \
  --min-instances=1 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300 \
  --concurrency=80 \
  --port=3000
```

**Important Notes**:
- `--vpc-connector` is required for Cloud Run to access Memorystore (Redis)
- `--min-instances=1` is recommended to keep Redis connection warm
- After first deployment, get the actual service URL and update `BASE_URL` and `GITHUB_CALLBACK_URL`
- Update GitHub App callback URL in GitHub settings to match the actual Cloud Run URL

### 2. Get Service URL

```bash
export SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --format='value(status.url)')

echo "Service URL: ${SERVICE_URL}"
```

### 3. Update Environment Variables with Actual URL

```bash
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --set-env-vars="BASE_URL=${SERVICE_URL}" \
  --set-env-vars="GITHUB_CALLBACK_URL=${SERVICE_URL}/auth/github/callback" \
  --set-env-vars="JWT_ISSUER=${SERVICE_URL}" \
  --set-env-vars="JWT_AUDIENCE=${SERVICE_URL}"
```

### 4. Run Database Migrations

After initial deployment, run migrations:

```bash
# Option A: Using Cloud SQL Proxy locally
cloud_sql_proxy -instances=${PROJECT_ID}:${REGION}:${SERVICE_NAME}-db=tcp:5432 &

# Run migrations
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/af_auth" npm run db:migrate

# Stop proxy
kill %1
```

```bash
# Option B: Using Cloud Run Jobs (recommended)
gcloud run jobs create ${SERVICE_NAME}-migrate \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:latest \
  --region=${REGION} \
  --service-account=${SA_EMAIL} \
  --set-secrets="DATABASE_URL=database-url:latest" \
  --add-cloudsql-instances=${PROJECT_ID}:${REGION}:${SERVICE_NAME}-db \
  --task-timeout=5m \
  --command=npm \
  --args="run,db:migrate"

# Execute migration job
gcloud run jobs execute ${SERVICE_NAME}-migrate --region=${REGION}
```

### 5. Verify Deployment

```bash
# Test health endpoint
curl ${SERVICE_URL}/health

# Expected response:
# {"status":"healthy","timestamp":"...","database":{"connected":true,"healthy":true}}
```

## Environment Variables

### Environment Variables vs Secrets

- **Environment Variables**: Non-sensitive configuration (NODE_ENV, LOG_LEVEL, etc.)
- **Secrets**: Sensitive data (passwords, API keys, encryption keys, etc.)

### Required Environment Variables

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | Env | `production` | Node environment |
| `LOG_LEVEL` | Env | `info` | Logging level |
| `LOG_PRETTY` | Env | `false` | Pretty print logs (false for prod) |
| `BASE_URL` | Env | `https://auth.example.com` | Service base URL |
| `GITHUB_CALLBACK_URL` | Env | `https://auth.example.com/auth/github/callback` | OAuth callback URL |
| `JWT_ISSUER` | Env | `https://auth.example.com` | JWT issuer claim |
| `JWT_AUDIENCE` | Env | `https://auth.example.com` | JWT audience claim |
| `JWT_EXPIRES_IN` | Env | `30d` | JWT token validity period |
| `DATABASE_URL` | Secret | `postgresql://...?sslmode=require` | Database connection string (with SSL) |
| `GITHUB_CLIENT_ID` | Secret | `Iv1.abc123...` | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | Secret | `secret123...` | GitHub OAuth client secret |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Secret | `hex_string` | Token encryption key (64 hex chars) |
| `SESSION_SECRET` | Secret | `hex_string` | CSRF token secret (64 hex chars) |
| `JWT_PRIVATE_KEY` | Secret | `base64_pem` | JWT signing key (base64-encoded RSA PEM) |
| `JWT_PUBLIC_KEY` | Secret | `base64_pem` | JWT verification key (base64-encoded RSA PEM) |

**New in v1.2**:
- `GITHUB_TOKEN_ENCRYPTION_KEY`: Required for encrypting GitHub tokens at rest
- `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY`: Now require base64-encoded PEM format
- Database SSL enabled by default in production

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (Cloud Run injects automatically) |
| `HOST` | `0.0.0.0` | Server host |
| `DB_POOL_MIN` | `2` | Min database connections |
| `DB_POOL_MAX` | `10` | Max database connections |
| `DB_SSL_ENABLED` | `true` (prod) | Enable database SSL/TLS |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` | Reject invalid SSL certificates |
| `DB_SSL_CA` | - | CA certificate (base64-encoded) |
| `DB_SSL_CERT` | - | Client certificate (base64-encoded) |
| `DB_SSL_KEY` | - | Client key (base64-encoded) |
| `JWT_CLOCK_TOLERANCE_SECONDS` | `60` | Clock skew tolerance |
| `ADMIN_CONTACT_EMAIL` | `admin@example.com` | Admin contact email |
| `ADMIN_CONTACT_NAME` | `Administrator` | Admin contact name |

### Multi-Instance Deployment Considerations

When deploying to Cloud Run with auto-scaling (multiple instances):

1. **Session State**: OAuth state tokens are stored in-memory per instance. For production, consider:
   - Using Redis/Memcached for distributed session storage
   - Or accepting that OAuth flows must complete on the same instance (generally not an issue with Cloud Run's session affinity)

2. **Secret Rotation**: All instances receive new secrets simultaneously via Secret Manager
   - Zero downtime for most secret rotations
   - JWT key rotation requires coordination (see docs/security.md)

3. **Database Connections**: Each instance maintains its own connection pool
   - Configure `DB_POOL_MAX` appropriately (e.g., 10 connections/instance)
   - Monitor total connections: max_instances × DB_POOL_MAX

### Updating Environment Variables

```bash
# Update environment variable
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --set-env-vars="LOG_LEVEL=debug,DB_SSL_ENABLED=true"

# Update secret reference
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --update-secrets="GITHUB_CLIENT_SECRET=github-client-secret:latest,GITHUB_TOKEN_ENCRYPTION_KEY=github-token-encryption-key:latest"

# Update multiple secrets at once
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --update-secrets="DATABASE_URL=database-url:latest" \
  --update-secrets="JWT_PRIVATE_KEY=jwt-private-key:latest" \
  --update-secrets="JWT_PUBLIC_KEY=jwt-public-key:latest"
```

## Networking and VPC

### Public Access (Default)

By default, Cloud Run services are publicly accessible:

```bash
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --allow-unauthenticated
```

### VPC Connector (Private Database Access)

For enhanced security with Cloud SQL private IP:

#### 1. Create VPC Connector

```bash
gcloud compute networks vpc-access connectors create ${SERVICE_NAME}-connector \
  --region=${REGION} \
  --network=default \
  --range=10.8.0.0/28
```

#### 2. Configure Cloud Run to Use Connector

```bash
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --vpc-connector=${SERVICE_NAME}-connector \
  --vpc-egress=private-ranges-only
```

### Regional Limitations

Some regions have specific VPC connector requirements. Common supported regions:

- **us-central1**: Full VPC support
- **us-east1**: Full VPC support  
- **europe-west1**: Full VPC support
- **asia-northeast1**: Check quota limits

Verify region support:

```bash
gcloud compute networks vpc-access connectors locations list
```

## HTTPS and Custom Domains

### Default HTTPS

Cloud Run provides automatic HTTPS on the default `.run.app` domain:

```
https://af-auth-{hash}-us-central1.a.run.app
```

### Custom Domain

#### 1. Verify Domain Ownership

```bash
gcloud domains verify auth.example.com
```

#### 2. Map Custom Domain

```bash
gcloud run domain-mappings create \
  --service=${SERVICE_NAME} \
  --domain=auth.example.com \
  --region=${REGION}
```

#### 3. Configure DNS

Add the DNS records shown in the mapping output:

```bash
gcloud run domain-mappings describe \
  --domain=auth.example.com \
  --region=${REGION}
```

Typically:

```
Type: A
Name: auth
Value: 216.239.32.21

Type: AAAA
Name: auth
Value: 2001:4860:4802:32::15
```

#### 4. Update Environment Variables

```bash
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --set-env-vars="BASE_URL=https://auth.example.com" \
  --set-env-vars="GITHUB_CALLBACK_URL=https://auth.example.com/auth/github/callback" \
  --set-env-vars="JWT_ISSUER=https://auth.example.com"
```

#### 5. Update GitHub App

Update callback URL in GitHub App settings to match new domain.

## Scaling Configuration

### Auto-Scaling Parameters

Cloud Run auto-scales based on:

- **Request concurrency**: Number of simultaneous requests per instance
- **CPU utilization**: Percentage of CPU used
- **Memory usage**: Memory consumption

### Recommended Settings

#### Development/Staging

```bash
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --min-instances=0 \
  --max-instances=3 \
  --concurrency=80 \
  --memory=512Mi \
  --cpu=1
```

#### Production (Low Traffic)

```bash
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --min-instances=1 \
  --max-instances=10 \
  --concurrency=80 \
  --memory=512Mi \
  --cpu=1
```

#### Production (High Traffic)

```bash
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --min-instances=2 \
  --max-instances=100 \
  --concurrency=100 \
  --memory=1Gi \
  --cpu=2 \
  --cpu-throttling \
  --timeout=60
```

### Important Limitation: OAuth State Storage

⚠️ **CRITICAL**: The current implementation stores OAuth state tokens in-memory, which **DOES NOT** work correctly with `max-instances > 1`.

**For Production Multi-Instance Deployments**, you must:

1. **Option A**: Deploy with `--max-instances=1` (simplest, works for low-traffic)
2. **Option B**: Implement distributed state storage (Redis/Memorystore)

See [GitHub App Setup - Production Considerations](../github-app-setup.md#production-deployment-considerations) for implementation details.

### Concurrency Tuning

The concurrency value determines how many requests a single instance handles:

- **Lower concurrency (40-60)**: More instances, better isolation, higher cost
- **Higher concurrency (80-100)**: Fewer instances, lower cost, potential performance impact

Monitor and adjust based on application behavior and latency requirements.

## Monitoring and Logging

### Cloud Logging

Logs are automatically collected from stdout/stderr:

```bash
# View recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME}" \
  --limit=50 \
  --format=json

# Filter by severity
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit=20

# Filter by custom fields
gcloud logging read "jsonPayload.userId=\"550e8400-e29b-41d4-a716-446655440000\"" \
  --limit=10
```

### Structured Logging

The service uses Pino for structured JSON logging. All logs include:

```json
{
  "level": "info",
  "time": "2024-12-11T10:30:00.000Z",
  "service": "af-auth",
  "revision": "af-auth-00001-abc",
  "msg": "User authenticated successfully",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "githubId": "12345678"
}
```

### Key Metrics to Monitor

- **Request count**: Total requests per minute
- **Error rate**: 4xx/5xx responses
- **Latency**: P50, P95, P99 response times
- **Instance count**: Number of active instances
- **Database connections**: Active connections to Cloud SQL
- **Memory usage**: Container memory consumption

### Log-Based Metrics

Create custom metrics from logs:

```bash
gcloud logging metrics create auth_failures \
  --description="Failed authentication attempts" \
  --log-filter='resource.type="cloud_run_revision"
    AND resource.labels.service_name="af-auth"
    AND jsonPayload.msg="Authentication failed"'
```

## Updates and Rollbacks

### Zero-Downtime Updates

Cloud Run performs zero-downtime deployments by default:

```bash
# Deploy new version
gcloud run deploy ${SERVICE_NAME} \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:v1.1.0 \
  --region=${REGION}
```

### Traffic Splitting

Test new versions with traffic splitting:

```bash
# Deploy new revision without traffic
gcloud run deploy ${SERVICE_NAME} \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:v2.0.0 \
  --region=${REGION} \
  --no-traffic \
  --tag=v2

# Split traffic 90% old, 10% new
gcloud run services update-traffic ${SERVICE_NAME} \
  --region=${REGION} \
  --to-revisions=LATEST=10,PREVIOUS=90

# After validation, route 100% to new
gcloud run services update-traffic ${SERVICE_NAME} \
  --region=${REGION} \
  --to-latest
```

### Rollback

Rollback to previous revision:

```bash
# List revisions
gcloud run revisions list \
  --service=${SERVICE_NAME} \
  --region=${REGION}

# Rollback to specific revision
gcloud run services update-traffic ${SERVICE_NAME} \
  --region=${REGION} \
  --to-revisions=af-auth-00042-abc=100
```

## Troubleshooting

### Service Won't Start

**Check deployment logs**:

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME}" \
  --limit=50 \
  --format=json
```

**Common causes**:
1. Missing environment variables
2. Invalid secret references
3. Database connection failure
4. Port mismatch (ensure app listens on `process.env.PORT`)

### Database Connection Errors

**Verify Cloud SQL instance**:

```bash
gcloud sql instances describe ${SERVICE_NAME}-db \
  --format='value(state)'
```

**Check IAM permissions**:

```bash
gcloud projects get-iam-policy ${PROJECT_ID} \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:${SA_EMAIL}"
```

### Secret Access Denied

**Verify service account has access**:

```bash
gcloud secrets get-iam-policy github-client-secret
```

**Grant access if missing**:

```bash
gcloud secrets add-iam-policy-binding github-client-secret \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor"
```

### OAuth Failures with Multiple Instances

**Symptoms**: "Invalid or expired authentication session" errors with `max-instances > 1`.

**Solutions**:
1. **Short-term**: Set `--max-instances=1`
2. **Long-term**: Implement Redis-based state storage

## Best Practices

### Security

1. **Principle of Least Privilege**: Grant minimal IAM permissions
2. **Secret Rotation**: Rotate secrets regularly (30-90 days)
3. **Network Isolation**: Use VPC connectors for private database access
4. **Audit Logging**: Enable Cloud Audit Logs
5. **HTTPS Only**: Never expose HTTP endpoints

### Cost Optimization

1. **Right-size Resources**: Start minimal, scale up as needed
2. **Min Instances**: Set to 0 for dev, 1+ for prod
3. **Request Concurrency**: Tune to maximize instance utilization
4. **Connection Pooling**: Configure appropriate pool sizes

### Reliability

1. **Health Checks**: Implement comprehensive health endpoints
2. **Graceful Shutdown**: Handle SIGTERM properly
3. **Database Retries**: Use exponential backoff (already implemented)
4. **Monitoring**: Set up alerts for errors and latency
5. **Backups**: Automate database backups

## Next Steps

After successful deployment:

1. **Configure GitHub App**: Update callback URLs
2. **Pre-load Users**: Whitelist initial users
3. **Set Up Monitoring**: Create dashboards and alerts
4. **Test OAuth Flow**: Verify end-to-end authentication
5. **Document Runbooks**: Create operational procedures

## References

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Cloud SQL for PostgreSQL](https://cloud.google.com/sql/docs/postgres)
- [Database Setup Guide](../database.md)
- [Security Guide](../security.md)
- [Operations Guide](../operations.md)
