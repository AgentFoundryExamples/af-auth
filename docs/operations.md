# Operations Guide

This guide provides operational runbooks for managing the AF Auth service, including logging, monitoring, whitelist management, and troubleshooting common issues.

## Table of Contents

- [Daily Operations](#daily-operations)
- [Logging and Monitoring](#logging-and-monitoring)
- [Whitelist Management](#whitelist-management)
- [JWT Token Revocation](#jwt-token-revocation)
- [Service Registry Operations](#service-registry-operations)
- [Backup and Recovery](#backup-and-recovery)
- [Performance Tuning](#performance-tuning)
- [Troubleshooting](#troubleshooting)

## Daily Operations

### Health Check Verification

The service provides three health endpoints for monitoring and orchestration:

#### `/health` - Comprehensive Health Check

Returns detailed status of all components. Use this for monitoring dashboards and alerts.

```bash
# Check service health
export SERVICE_URL=$(gcloud run services describe af-auth \
  --region=us-central1 \
  --format='value(status.url)')

curl ${SERVICE_URL}/health

# Expected response (healthy):
# {
#   "status": "healthy",
#   "timestamp": "2024-12-12T10:30:00.000Z",
#   "uptime": 42.5,
#   "environment": "production",
#   "components": {
#     "database": {
#       "status": "healthy",
#       "details": {
#         "connected": true,
#         "sslEnabled": true
#       }
#     },
#     "redis": {
#       "status": "healthy",
#       "details": {
#         "connectionStatus": "ready"
#       }
#     },
#     "encryption": {
#       "status": "healthy",
#       "details": {
#         "githubTokenEncryptionKeyLength": 64,
#         "jwtKeysConfigured": true
#       }
#     },
#     "githubApp": {
#       "status": "healthy",
#       "details": {
#         "appIdConfigured": true,
#         "privateKeyConfigured": true,
#         "installationIdConfigured": true
#       }
#     }
#   }
# }
```

**Status Codes:**
- `200` - Service is healthy or degraded (partially operational)
- `503` - Service is unhealthy (critical components failing)

**Health States:**
- `healthy` - All components operational
- `degraded` - Service operational but some non-critical components failing (e.g., GitHub App)
- `unhealthy` - Critical components failing (database, Redis, or encryption)

**GitHub App Health Check Caching:**

The GitHub App health check is cached for 60 seconds to avoid rate limiting:
- Successful checks are cached for 1 minute
- Failed checks are also cached to prevent API hammering during outages
- Cache is instance-specific (each Cloud Run instance maintains its own cache)
- Cache is cleared on service restart or instance replacement
- This instance-level caching is acceptable since health checks are evaluated per-instance

**Note on GitHub App Validation:**

The health check validates that the GitHub App private key is properly formatted and can sign JWTs. It does NOT make actual GitHub API calls to avoid rate limiting and performance impact. This validates the service's ability to mint installation access tokens when needed. Monitor actual GitHub API connectivity separately through OAuth flow metrics and application logs.

#### `/ready` - Readiness Probe

Cloud Run readiness probe endpoint. Checks if the service is ready to accept traffic.

```bash
curl ${SERVICE_URL}/ready

# Expected response (ready):
# {
#   "status": "ready",
#   "components": {
#     "database": "healthy",
#     "redis": "healthy",
#     "encryption": "healthy"
#   }
# }

# Expected response (not ready):
# {
#   "status": "not ready",
#   "reason": "Unhealthy components: database, redis",
#   "components": {
#     "database": "unhealthy",
#     "redis": "unhealthy",
#     "encryption": "healthy"
#   }
# }
```

**Status Codes:**
- `200` - Service is ready
- `503` - Service is not ready

**Readiness Criteria:**
- Database must be healthy
- Redis must be healthy
- Encryption keys must be configured

Note: GitHub App status does not affect readiness. The service can operate without GitHub App functionality for existing authenticated users.

#### `/live` - Liveness Probe

Cloud Run liveness probe endpoint. Always returns 200 if the process is running.

```bash
curl ${SERVICE_URL}/live

# Expected response:
# {
#   "status": "alive"
# }
```

**Status Code:** Always `200`

This endpoint is used by Cloud Run to determine if the container should be restarted. It checks only that the process is responsive, not the health of dependencies.

#### Recommended Cloud Run Probe Settings

Configure Cloud Run health checks in your service YAML:

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: af-auth
spec:
  template:
    spec:
      containers:
      - image: gcr.io/PROJECT_ID/af-auth:latest
        ports:
        - containerPort: 3000
        livenessProbe:
          httpGet:
            path: /live
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
```

**Probe Configuration Guidelines:**
- **Liveness Probe**: Longer initial delay (10s) to allow for startup, less frequent checks (10s)
- **Readiness Probe**: Shorter initial delay (5s), more frequent checks (5s) for faster traffic routing
- **Timeouts**: Keep at 3s to avoid false positives from slow networks
- **Failure Thresholds**: Readiness can be more sensitive (2) than liveness (3)

#### Health Check Monitoring and Alerts

Set up Cloud Monitoring alerts based on health check results:

```bash
# Create uptime check
gcloud monitoring uptime-configs create af-auth-health \
  --resource-type=uptime-url \
  --hostname=${SERVICE_URL#https://} \
  --path=/health \
  --period=60 \
  --timeout=10

# Create alert policy for unhealthy status
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="AF Auth - Unhealthy Status" \
  --condition-display-name="Health check returns 503" \
  --condition-threshold-value=1 \
  --condition-threshold-duration=180s \
  --condition-threshold-filter='resource.type="uptime_url" AND metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND resource.label.check_id="af-auth-health"'
```

#### Interpreting Health Check Failures

**Database Unhealthy:**
```json
{
  "database": {
    "status": "unhealthy",
    "message": "Database is not responding",
    "details": {
      "connected": false,
      "sslEnabled": true
    }
  }
}
```
**Actions:**
1. Check Cloud SQL instance status: `gcloud sql instances describe af-auth-db`
2. Verify network connectivity and firewall rules
3. Check database logs for errors
4. Verify SSL certificates are valid

**Database Degraded (SSL disabled in production):**
```json
{
  "database": {
    "status": "degraded",
    "message": "Database SSL is not enabled",
    "details": {
      "connected": true,
      "sslEnabled": false
    }
  }
}
```
**Actions:**
1. Enable SSL in production environment: Set `DB_SSL_ENABLED=true`
2. Restart the service to apply changes
3. This is a security concern and should be addressed immediately

**Redis Unhealthy:**
```json
{
  "redis": {
    "status": "unhealthy",
    "message": "Redis is not connected",
    "details": {
      "connectionStatus": "disconnected"
    }
  }
}
```
**Actions:**
1. Check Redis/Memorystore instance status
2. Verify network connectivity
3. Check Redis logs for connection errors
4. Review Redis configuration (host, port, password)
5. Monitor for Redis reconnection (automatic with exponential backoff)

**Encryption Unhealthy:**
```json
{
  "encryption": {
    "status": "unhealthy",
    "message": "Encryption key not configured"
  }
}
```
**Actions:**
1. Verify `GITHUB_TOKEN_ENCRYPTION_KEY` environment variable is set
2. Ensure key is at least 32 characters
3. Verify `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` are configured
4. Restart the service after fixing configuration

**GitHub App Unhealthy:**
```json
{
  "githubApp": {
    "status": "unhealthy",
    "message": "GitHub App configuration incomplete"
  }
}
```
**Actions:**
1. Verify `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, and `GITHUB_APP_PRIVATE_KEY` are set
2. Check GitHub App installation is active
3. Verify private key is valid and properly base64-encoded
4. Note: This does not affect existing authenticated users, only new OAuth flows

**GitHub App Cached Results:**

When you see `"cached": true` in the GitHub App health check:
```json
{
  "githubApp": {
    "status": "healthy",
    "details": {
      "cached": true,
      "cacheAge": 45000
    }
  }
}
```
This indicates the result is from cache (up to 60 seconds old). To force a fresh check, restart the service or wait for cache expiration.

### Service Status Check

```bash
# Check Cloud Run service status
gcloud run services describe af-auth \
  --region=us-central1 \
  --format=yaml

# Check active revisions
gcloud run revisions list \
  --service=af-auth \
  --region=us-central1

# Check current traffic split
gcloud run services describe af-auth \
  --region=us-central1 \
  --format='get(status.traffic)'
```

### Database Status

```bash
# Check Cloud SQL instance
gcloud sql instances describe af-auth-db \
  --format='value(state)'

# Check database size
gcloud sql instances describe af-auth-db \
  --format='value(currentDiskSize,maxDiskSize)'

# View recent operations
gcloud sql operations list --instance=af-auth-db --limit=10
```

## Logging and Monitoring

### Cloud Logging Configuration

#### Viewing Logs

```bash
# Real-time logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=af-auth" \
  --format=json \
  --freshness=5m

# Filter by severity
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit=50

# Filter by time range
gcloud logging read "resource.type=cloud_run_revision \
  AND timestamp>="2024-12-11T00:00:00Z" \
  AND timestamp<="2024-12-11T23:59:59Z"" \
  --format=json
```

#### Key Log Queries

```bash
# Authentication failures
gcloud logging read 'jsonPayload.action="authentication_failed"' \
  --limit=20 \
  --format=json

# User authentication by GitHub ID
gcloud logging read 'jsonPayload.githubId="12345678"' \
  --limit=100

# Database connection issues
gcloud logging read 'severity>=WARNING AND textPayload=~"database"' \
  --limit=50

# OAuth flow completions
gcloud logging read 'jsonPayload.msg="User authenticated successfully"' \
  --limit=100
```

### Severity Levels and Filtering

Configure log ingestion with severity filters to reduce noise and costs:

```bash
# Create log sink for ERROR and above
gcloud logging sinks create af-auth-errors \
  bigquery.googleapis.com/projects/PROJECT_ID/datasets/af_auth_errors \
  --log-filter='resource.type="cloud_run_revision"
    AND resource.labels.service_name="af-auth"
    AND severity>=ERROR'

# Create log sink for audit events
gcloud logging sinks create af-auth-audit \
  bigquery.googleapis.com/projects/PROJECT_ID/datasets/af_auth_audit \
  --log-filter='resource.type="cloud_run_revision"
    AND jsonPayload.action!=""'
```

### Sensitive Data Redaction

The service automatically redacts sensitive fields in logs:

- `password`
- `token` (all variations)
- `githubAccessToken`
- `githubRefreshToken`
- `secret`
- `apiKey`
- `authorization`
- `cookie`
- `sessionId`

Verify redaction is working:

```bash
# Should see [REDACTED] for sensitive fields
gcloud logging read 'jsonPayload.githubAccessToken!=""' \
  --limit=1 \
  --format=json
```

### Monitoring Dashboards

Create custom dashboards for key metrics:

```bash
# View request count
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_count"
    AND resource.labels.service_name="af-auth"' \
  --format=json

# View request latencies
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_latencies"
    AND resource.labels.service_name="af-auth"' \
  --format=json

# View instance count
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/instance_count"
    AND resource.labels.service_name="af-auth"' \
  --format=json
```

### Alerting

Configure alerts for critical metrics:

```bash
# Create error rate alert
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="AF Auth High Error Rate" \
  --condition-display-name="4xx/5xx errors > 5% of requests" \
  --condition-ratio-filter='metric.type="run.googleapis.com/request_count" resource.type="cloud_run_revision" resource.label.service_name="af-auth" metric.label.response_code_class!="2xx"' \
  --condition-ratio-denominator-filter='metric.type="run.googleapis.com/request_count" resource.type="cloud_run_revision" resource.label.service_name="af-auth"' \
  --condition-comparison="GREATER_THAN" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s

# Create latency alert
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="AF Auth High Latency" \
  --condition-display-name="P95 latency > 2 seconds" \
  --condition-threshold-value=2000 \
  --condition-threshold-duration=300s
```

## Whitelist Management

### Pre-Loading Users

Before users attempt to authenticate, pre-load them into the whitelist:

#### Option A: Using Prisma Studio (Development)

```bash
# Start Prisma Studio
npm run db:studio

# Navigate to users table
# Add new user record:
# - github_user_id: User's GitHub ID
# - is_whitelisted: true
# - created_at: now()
# - updated_at: now()
```

#### Option B: Using SQL (Production)

```bash
# Connect via Cloud SQL Proxy
cloud_sql_proxy -instances=PROJECT:REGION:af-auth-db=tcp:5432

# Run SQL
psql -h localhost -U postgres -d af_auth << 'EOFSQL'
-- Pre-whitelist a user by GitHub ID (before they log in)
INSERT INTO users (id, github_user_id, is_whitelisted, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  12345678,  -- Replace with actual GitHub user ID
  true,
  NOW(),
  NOW()
)
ON CONFLICT (github_user_id) DO UPDATE
SET is_whitelisted = true,
    updated_at = NOW();
EOFSQL
```

#### Option C: Using Management Script

Create a management script `scripts/manage-whitelist.ts`:

```typescript
import { prisma } from '../src/db';

async function whitelistUser(githubUserId: number) {
  const user = await prisma.user.upsert({
    where: { githubUserId: BigInt(githubUserId) },
    update: { 
      isWhitelisted: true,
      updatedAt: new Date()
    },
    create: {
      githubUserId: BigInt(githubUserId),
      isWhitelisted: true,
    }
  });
  
  console.log(`User \${user.id} whitelisted (GitHub ID: \${githubUserId})`);
  return user;
}

async function revokeUser(githubUserId: number) {
  const user = await prisma.user.update({
    where: { githubUserId: BigInt(githubUserId) },
    data: { 
      isWhitelisted: false,
      updatedAt: new Date()
    }
  });
  
  console.log(`User \${user.id} revoked (GitHub ID: \${githubUserId})`);
  return user;
}

async function listWhitelisted() {
  const users = await prisma.user.findMany({
    where: { isWhitelisted: true },
    select: {
      id: true,
      githubUserId: true,
      createdAt: true,
      updatedAt: true
    }
  });
  
  console.log(`Whitelisted users: \${users.length}`);
  console.table(users);
}

// CLI interface
const command = process.argv[2];
const githubUserId = parseInt(process.argv[3]);

switch (command) {
  case 'add':
    await whitelistUser(githubUserId);
    break;
  case 'revoke':
    await revokeUser(githubUserId);
    break;
  case 'list':
    await listWhitelisted();
    break;
  default:
    console.log('Usage: npm run whitelist -- <add|revoke|list> [githubUserId]');
}

await prisma.\$disconnect();
```

Add to `package.json`:

```json
{
  "scripts": {
    "whitelist": "tsx scripts/manage-whitelist.ts"
  }
}
```

Usage:

```bash
# Whitelist a user
npm run whitelist -- add 12345678

# Revoke a user
npm run whitelist -- revoke 12345678

# List all whitelisted users
npm run whitelist -- list
```

### Post-Authentication Whitelisting

After a user has authenticated (but is not whitelisted):

```bash
# Find user by GitHub ID
psql -h localhost -U postgres -d af_auth << 'EOFSQL'
SELECT id, github_user_id, is_whitelisted, created_at
FROM users
WHERE github_user_id = 12345678;
EOFSQL

# Whitelist the user
psql -h localhost -U postgres -d af_auth << 'EOFSQL'
UPDATE users
SET is_whitelisted = true,
    updated_at = NOW()
WHERE github_user_id = 12345678;
EOFSQL
```

The user will be whitelisted on their next authentication attempt.

### Bulk Whitelisting

Whitelist multiple users from a CSV file:

```bash
# Create CSV file: whitelist.csv
# github_user_id
# 12345678
# 87654321
# 11223344

# Bulk import
psql -h localhost -U postgres -d af_auth << 'EOFSQL'
CREATE TEMP TABLE temp_whitelist (github_user_id BIGINT);

\COPY temp_whitelist FROM 'whitelist.csv' CSV HEADER;

INSERT INTO users (id, github_user_id, is_whitelisted, created_at, updated_at)
SELECT gen_random_uuid(), github_user_id, true, NOW(), NOW()
FROM temp_whitelist
ON CONFLICT (github_user_id) DO UPDATE
SET is_whitelisted = true,
    updated_at = NOW();

DROP TABLE temp_whitelist;
EOFSQL
```

### Whitelist Audit Trail

Query whitelist changes:

```bash
# View recent whitelist grants
gcloud logging read 'jsonPayload.isWhitelisted=true
  AND jsonPayload.msg="User authenticated successfully"' \
  --limit=50 \
  --format=json

# Find users added to whitelist in last 7 days
psql -h localhost -U postgres -d af_auth << 'EOFSQL'
SELECT id, github_user_id, is_whitelisted, created_at, updated_at
FROM users
WHERE is_whitelisted = true
  AND updated_at > NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC;
EOFSQL
```

## JWT Token Revocation

### Overview

AF Auth supports immediate JWT token revocation without waiting for token expiration. This is critical for security incidents, account compromises, or immediate access removal.

### Key Concepts

- **JWT ID (JTI)**: Each token has a unique identifier for tracking
- **Revocation Store**: Database table tracking revoked tokens
- **Immediate Enforcement**: Revoked tokens rejected within milliseconds
- **No Embedded Status**: Whitelist status is NOT in JWT, checked from database on each request

### Revoking Individual Tokens

#### Via API

```bash
# Revoke a specific token
curl -X POST https://${SERVICE_URL}/api/token/revoke \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "reason": "Security incident - account compromise",
    "revokedBy": "admin-user"
  }'

# Response
# {
#   "success": true,
#   "jti": "user-123-1702345678-abc123",
#   "message": "Token revoked successfully"
# }
```

#### Via Database

```sql
-- Find tokens by user
SELECT id, jti, user_id, token_expires_at
FROM revoked_tokens
WHERE user_id = 'user-uuid-here'
ORDER BY revoked_at DESC;

-- Manually add revoked token (emergency)
INSERT INTO revoked_tokens (
  jti,
  user_id,
  token_issued_at,
  token_expires_at,
  revoked_by,
  reason
) VALUES (
  'token-jti-from-decoded-jwt',
  'user-uuid',
  '2024-12-01 10:00:00',
  '2024-12-31 10:00:00',
  'emergency-admin',
  'Security breach'
);
```

### Checking Revocation Status

```bash
# Check if a token is revoked
curl "https://${SERVICE_URL}/api/token/revocation-status?jti=token-jti-123"

# Response for revoked token:
# {
#   "revoked": true,
#   "details": {
#     "jti": "token-jti-123",
#     "userId": "user-uuid",
#     "revokedAt": "2024-12-11T10:30:00.000Z",
#     "revokedBy": "admin-user",
#     "reason": "Security incident",
#     "tokenExpiresAt": "2024-12-31T10:30:00.000Z"
#   }
# }

# Response for valid token:
# {
#   "revoked": false,
#   "jti": "token-jti-123"
# }
```

### Revoking All User Tokens

To immediately revoke access for a user:

```bash
# Option 1: Remove from whitelist (affects all future requests)
npm run whitelist -- revoke 12345678

# Option 2: Via database
psql -h localhost -U postgres -d af_auth << 'EOFSQL'
UPDATE users
SET is_whitelisted = false
WHERE github_user_id = 12345678;
EOFSQL
```

**Important**: Changing whitelist status doesn't revoke existing tokens in the revocation table, but the middleware will reject them on next use by checking the database whitelist status.

### Cleanup Expired Revoked Tokens

Revoked tokens remain in the database even after expiry for audit purposes. Clean them up periodically:

```bash
# Clean up tokens expired more than 7 days ago (default)
npm run cleanup:revoked-tokens

# Custom retention period (30 days)
npm run cleanup:revoked-tokens -- --retention=30

# Dry run to preview what would be deleted
npm run cleanup:revoked-tokens -- --dry-run

# Output:
# ✅ Cleanup complete
#    Deleted 42 expired revoked token(s)
#    Retention period: 7 days
```

#### Automated Cleanup via Cron

Add to crontab for daily cleanup:

```bash
# Edit crontab
crontab -e

# Add daily cleanup at 2 AM
0 2 * * * cd /app && npm run cleanup:revoked-tokens >> /var/log/token-cleanup.log 2>&1

# Or with Cloud Run Jobs
gcloud run jobs create token-cleanup \
  --region=us-central1 \
  --image=gcr.io/PROJECT_ID/af-auth:latest \
  --command="npm" \
  --args="run,cleanup:revoked-tokens" \
  --schedule="0 2 * * *" \
  --service-account=af-auth-sa@PROJECT_ID.iam.gserviceaccount.com
```

### Monitoring Revocations

```bash
# View recent revocations
gcloud logging read 'jsonPayload.msg="Token revoked successfully"' \
  --limit=50 \
  --format=json

# Count revocations by reason
gcloud logging read 'jsonPayload.action="token_revoked"' \
  --format='value(jsonPayload.reason)' \
  --limit=1000 | sort | uniq -c | sort -rn

# Revocations by user
psql -h localhost -U postgres -d af_auth << 'EOFSQL'
SELECT 
  u.github_user_id,
  COUNT(rt.id) as revoked_count,
  MAX(rt.revoked_at) as last_revocation
FROM revoked_tokens rt
JOIN users u ON rt.user_id = u.id
WHERE rt.revoked_at > NOW() - INTERVAL '30 days'
GROUP BY u.github_user_id
ORDER BY revoked_count DESC
LIMIT 20;
EOFSQL
```

### Revocation Performance

- **Lookup Time**: < 5ms for revocation check (indexed JTI lookup)
- **Cache Recommended**: Consider caching revocation status for high-traffic services
- **Database Impact**: Minimal - single indexed query per request
- **Cleanup Frequency**: Daily cleanup recommended for tables > 100K rows

### Emergency Revocation Procedures

#### Compromise Detected

```bash
# 1. Identify affected user(s)
AFFECTED_USER_ID="user-uuid"

# 2. Immediately revoke whitelist access
psql -h localhost -U postgres -d af_auth << EOFSQL
UPDATE users 
SET is_whitelisted = false 
WHERE id = '${AFFECTED_USER_ID}';
EOFSQL

# 3. Log the incident
gcloud logging write af-auth-security \
  "Emergency revocation for user ${AFFECTED_USER_ID}" \
  --severity=CRITICAL \
  --resource=cloud_run_revision

# 4. Notify security team
# Send alert via your incident management system

# 5. Audit actions
psql -h localhost -U postgres -d af_auth << EOFSQL
SELECT 
  sal.action,
  sal.success,
  sal.created_at,
  sal.ip_address
FROM service_audit_logs sal
WHERE sal.user_id = '${AFFECTED_USER_ID}'
  AND sal.created_at > NOW() - INTERVAL '7 days'
ORDER BY sal.created_at DESC;
EOFSQL
```

#### Mass Revocation

```bash
# Create SQL script for bulk revocation
cat > /tmp/mass-revoke.sql << 'EOFSQL'
UPDATE users
SET is_whitelisted = false
WHERE github_user_id IN (
  12345678,
  87654321,
  11223344
  -- Add more user IDs as needed
);
EOFSQL

# Execute
psql -h localhost -U postgres -d af_auth < /tmp/mass-revoke.sql

# Verify
psql -h localhost -U postgres -d af_auth << 'EOFSQL'
SELECT github_user_id, is_whitelisted, updated_at
FROM users
WHERE github_user_id IN (12345678, 87654321, 11223344);
EOFSQL
```

## Service Registry Operations

### Adding Services

Use the CLI tool to register downstream services:

```bash
# Add a new service
npm run service-registry -- add my-service \
  --description "Analytics pipeline service"

# Output includes API key - save securely!
# Service ID: 550e8400-e29b-41d4-a716-446655440000
# API Key: 3f7a4b2c9d1e8f6a5b3c7d9e1f2a4b6c8d0e1f3a5b7c9d1e3f5a7b9c1d3e5f7a
```

### Rotating Service API Keys

```bash
# Rotate API key for a service
npm run service-registry -- rotate my-service

# Output provides new API key
# Update downstream service configuration immediately
```

### Deactivating Services

```bash
# Deactivate service (prevents API access)
npm run service-registry -- deactivate my-service

# Reactivate
npm run service-registry -- activate my-service
```

### Listing Services

```bash
# List all services
npm run service-registry -- list

# List active services only
npm run service-registry -- list --active
```

### Service Usage Audit

Query service registry access logs:

```bash
# View service access attempts
gcloud logging read 'jsonPayload.action="service_registry_access"' \
  --limit=100 \
  --format=json

# Failed service authentications
gcloud logging read 'jsonPayload.action="service_auth_failed"' \
  --limit=50

# Access by specific service
gcloud logging read 'jsonPayload.serviceId="550e8400-e29b-41d4-a716-446655440000"' \
  --limit=100
```

Database audit log query:

```sql
-- Recent service access
SELECT 
  sal.created_at,
  sr.service_identifier,
  sal.action,
  sal.success,
  u.github_user_id,
  sal.ip_address
FROM service_audit_logs sal
JOIN service_registry sr ON sal.service_id = sr.id
JOIN users u ON sal.user_id = u.id
WHERE sal.created_at > NOW() - INTERVAL '24 hours'
ORDER BY sal.created_at DESC
LIMIT 100;

-- Failed access attempts by service
SELECT 
  sr.service_identifier,
  COUNT(*) as failed_attempts,
  MAX(sal.created_at) as last_attempt
FROM service_audit_logs sal
JOIN service_registry sr ON sal.service_id = sr.id
WHERE sal.success = false
  AND sal.created_at > NOW() - INTERVAL '7 days'
GROUP BY sr.service_identifier
ORDER BY failed_attempts DESC;
```

## Backup and Recovery

### Database Backups

#### Automated Backups

```bash
# Enable automated backups
gcloud sql instances patch af-auth-db \
  --backup-start-time=02:00 \
  --enable-bin-log \
  --retained-backups-count=30

# List backups
gcloud sql backups list --instance=af-auth-db

# Verify latest backup
gcloud sql backups describe BACKUP_ID --instance=af-auth-db
```

#### Manual Backups

```bash
# Create on-demand backup before risky operation
gcloud sql backups create \
  --instance=af-auth-db \
  --description="Pre-migration backup $(date +%Y%m%d)"

# Export to Cloud Storage (for archival)
gcloud sql export sql af-auth-db \
  gs://PROJECT_ID-backups/af-auth-$(date +%Y%m%d-%H%M%S).sql \
  --database=af_auth
```

#### Restoring from Backup

```bash
# List available backups
gcloud sql backups list --instance=af-auth-db

# Restore from backup (creates new instance or overwrites existing)
gcloud sql backups restore BACKUP_ID \
  --backup-instance=af-auth-db \
  --instance=af-auth-db

# Import from Cloud Storage export
gcloud sql import sql af-auth-db \
  gs://PROJECT_ID-backups/af-auth-20241211-120000.sql \
  --database=af_auth
```

### Configuration Backups

```bash
# Export Cloud Run service configuration
gcloud run services describe af-auth \
  --region=us-central1 \
  --format=yaml > af-auth-config-backup.yaml

# Export Secret Manager secrets metadata
gcloud secrets list --format=yaml > secrets-backup.yaml

# Export IAM policies
gcloud projects get-iam-policy PROJECT_ID \
  --format=yaml > iam-policies-backup.yaml
```

### Disaster Recovery

Full recovery procedure:

```bash
# 1. Restore database from backup
gcloud sql backups restore LATEST_BACKUP_ID \
  --backup-instance=af-auth-db \
  --instance=af-auth-db

# 2. Verify database health
gcloud sql instances describe af-auth-db

# 3. Redeploy Cloud Run service
gcloud run services replace af-auth-config-backup.yaml \
  --region=us-central1

# 4. Verify service health
curl $(gcloud run services describe af-auth --region=us-central1 --format='value(status.url)')/health

# 5. Test OAuth flow end-to-end
```

## Performance Tuning

### Database Connection Pooling

Adjust pool size based on traffic:

```bash
# For low traffic (default)
gcloud run services update af-auth \
  --region=us-central1 \
  --set-env-vars="DB_POOL_MIN=2,DB_POOL_MAX=10"

# For high traffic
gcloud run services update af-auth \
  --region=us-central1 \
  --set-env-vars="DB_POOL_MIN=5,DB_POOL_MAX=25"
```

### Instance Sizing

Adjust Cloud Run resources:

```bash
# Increase memory and CPU for better performance
gcloud run services update af-auth \
  --region=us-central1 \
  --memory=1Gi \
  --cpu=2

# Adjust concurrency
gcloud run services update af-auth \
  --region=us-central1 \
  --concurrency=100  # Higher = fewer instances, lower = more isolation
```

### Cold Start Optimization

Reduce cold starts:

```bash
# Set minimum instances (keeps service warm)
gcloud run services update af-auth \
  --region=us-central1 \
  --min-instances=1  # Or 2 for high availability

# Monitor cold starts
gcloud logging read 'jsonPayload.message=~"Starting server"' \
  --limit=50 \
  --format=json
```

### Database Query Optimization

Monitor slow queries:

```sql
-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- View slow queries
SELECT 
  substring(query, 1, 50) AS short_query,
  mean_exec_time,
  calls,
  total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- Queries taking > 100ms
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Add indexes if needed
CREATE INDEX idx_users_github_id ON users(github_user_id);
CREATE INDEX idx_service_audit_logs_created_at ON service_audit_logs(created_at);
```

### Rate Limiting Tuning

Rate limits protect against abuse but must be balanced with legitimate usage patterns:

#### Default Limits

| Endpoint Category | Window | Max Requests | Typical Use Case |
|-------------------|--------|--------------|------------------|
| Authentication | 15 min | 10 | User login attempts |
| JWT Operations | 15 min | 100 | Token refresh, public key retrieval |
| GitHub Token Access | 1 hour | 1000 | Service-to-service API calls |

#### Adjusting Limits

Update environment variables based on observed traffic:

```bash
# For stricter auth protection (e.g., after attack)
gcloud run services update af-auth \
  --region=us-central1 \
  --update-env-vars="RATE_LIMIT_AUTH_MAX=5,RATE_LIMIT_AUTH_WINDOW_MS=900000"

# For high-volume service-to-service traffic
gcloud run services update af-auth \
  --region=us-central1 \
  --update-env-vars="RATE_LIMIT_GITHUB_TOKEN_MAX=5000,RATE_LIMIT_GITHUB_TOKEN_WINDOW_MS=3600000"

# For development/staging (more lenient)
gcloud run services update af-auth-staging \
  --region=us-central1 \
  --update-env-vars="RATE_LIMIT_AUTH_MAX=50,RATE_LIMIT_JWT_MAX=500"
```

#### Monitoring Rate Limits

Watch for rate limit violations in Cloud Logging:

```bash
# Check rate limit violations
gcloud logging read 'jsonPayload.message="Rate limit exceeded"' \
  --limit=100 \
  --format=json

# Count violations by endpoint
gcloud logging read 'jsonPayload.message="Rate limit exceeded"' \
  --format='value(jsonPayload.keyPrefix)' \
  --limit=1000 | sort | uniq -c | sort -rn

# Check which IPs are being rate limited
gcloud logging read 'jsonPayload.message="Rate limit exceeded"' \
  --format='value(jsonPayload.ip)' \
  --limit=1000 | sort | uniq -c | sort -rn
```

#### Tuning Guidelines

1. **Monitor actual usage** before changing limits
2. **Increase gradually** (e.g., double the limit, observe for a day)
3. **Document changes** in deployment notes
4. **Set alerts** for unusual rate limit patterns
5. **Test changes** in staging environment first

**Warning:** Setting limits too high defeats the protection. Setting them too low causes false positives for legitimate users.

#### Distributed Enforcement

For multi-instance deployments, rate limits should use Redis for consistency:

```bash
# Ensure Redis is configured
gcloud run services update af-auth \
  --region=us-central1 \
  --set-env-vars="REDIS_HOST=10.0.0.3,REDIS_PORT=6379"
```

Without Redis, each instance maintains its own counters, effectively multiplying the limit by the number of instances.
```

## Troubleshooting

### High Error Rate

```bash
# Check error distribution
gcloud logging read 'severity>=ERROR' \
  --limit=100 \
  --format=json | jq -r '.[] | .jsonPayload.msg' | sort | uniq -c | sort -rn

# Common causes:
# 1. Database connection failures
# 2. Invalid GitHub OAuth configuration
# 3. Secret access denied
# 4. Memory/CPU exhaustion
```

### Authentication Failures

```bash
# View failed authentications
gcloud logging read 'jsonPayload.msg="Authentication failed"' \
  --limit=50 \
  --format=json

# Common causes:
# - Invalid state token (expired session)
# - GitHub OAuth misconfiguration
# - Network issues with GitHub API
# - Database unavailability

# Test OAuth flow manually
curl "https://SERVICE_URL/auth/github"
```

### Database Connection Issues

```bash
# Check Cloud SQL status
gcloud sql instances describe af-auth-db

# Check service account permissions
gcloud projects get-iam-policy PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:af-auth-sa@PROJECT_ID.iam.gserviceaccount.com"

# Verify DATABASE_URL secret
gcloud secrets versions access latest --secret=database-url

# Check database connections
psql -h localhost -U postgres -d af_auth << 'EOFSQL'
SELECT count(*) FROM pg_stat_activity WHERE datname = 'af_auth';
EOFSQL
```

### High Latency

```bash
# Check request latency distribution
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_latencies"
    AND resource.labels.service_name="af-auth"'

# View slow requests in logs
gcloud logging read 'httpRequest.latency>"2s"' \
  --limit=50

# Common causes:
# - Slow database queries
# - Cold starts
# - Insufficient CPU/memory
# - External API timeouts (GitHub)

# Solutions:
# 1. Increase min-instances to reduce cold starts
# 2. Optimize database queries
# 3. Increase CPU/memory allocation
```

### Memory Issues

```bash
# Check for OOM kills (exit code 137)
gcloud logging read 'severity>=ERROR AND textPayload=~"137"' \
  --limit=20

# View memory usage
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/memory/utilizations"
    AND resource.labels.service_name="af-auth"'

# Increase memory if needed
gcloud run services update af-auth \
  --region=us-central1 \
  --memory=1Gi
```

### Service Won't Deploy

```bash
# Check deployment logs
gcloud logging read 'resource.type="cloud_run_revision"
  AND resource.labels.service_name="af-auth"
  AND severity>=WARNING' \
  --limit=100

# Common issues:
# - Invalid secret reference
# - Missing IAM permissions
# - Container build failure
# - Invalid environment variables

# Verify secrets exist
gcloud secrets list

# Verify service account has permissions
gcloud secrets get-iam-policy database-url
```

## References

- [Cloud Run Operations](https://cloud.google.com/run/docs/operations)
- [Cloud Logging Documentation](https://cloud.google.com/logging/docs)
- [Cloud Monitoring Documentation](https://cloud.google.com/monitoring/docs)
- [Cloud SQL Operations](https://cloud.google.com/sql/docs/postgres/operations)
- [Service Registry Guide](./service-registry.md)
- [JWT Guide](./jwt.md)
