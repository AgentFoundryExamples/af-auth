# Operations Guide

This guide provides operational runbooks for managing the AF Auth service, including logging, monitoring, whitelist management, and troubleshooting common issues.

## Table of Contents

- [Daily Operations](#daily-operations)
- [Key Rotation Monitoring](#key-rotation-monitoring)
- [Logging and Monitoring](#logging-and-monitoring)
- [Prometheus Metrics](#prometheus-metrics)
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
#     },
#     "metrics": {
#       "status": "healthy",
#       "details": {
#         "enabled": true,
#         "registryInitialized": true,
#         "metricsSize": 4523
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
- `degraded` - Service operational but some non-critical components failing (e.g., GitHub App, Metrics)
- `unhealthy` - Critical components failing (database, Redis, or encryption)

**Component Criticality:**
- **Critical Components:** Database, Redis, Encryption - failures cause `unhealthy` status
- **Non-Critical Components:** GitHub App, Metrics - failures cause `degraded` status
- Degraded state allows service to continue operating for existing users while signaling operational issues

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
#     "encryption": "healthy",
#     "metrics": "healthy"
#   }
# }

# Expected response (not ready):
# {
#   "status": "not ready",
#   "reason": "Unhealthy components: database, redis",
#   "components": {
#     "database": "unhealthy",
#     "redis": "unhealthy",
#     "encryption": "healthy",
#     "metrics": "healthy"
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
- **Metrics must be healthy (when enabled)** - Ensures observability pipeline is operational

**Metrics Readiness Behavior:**
- When `METRICS_ENABLED=true` (production default), metrics registry must be initialized and functional
- When `METRICS_ENABLED=false`, readiness passes with a warning logged for visibility
- Failed metrics initialization blocks deployment to ensure observability requirements are met
- See [Metrics Configuration](#metrics-configuration) for details on metrics setup

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

**Metrics Unhealthy:**
```json
{
  "metrics": {
    "status": "unhealthy",
    "message": "Metrics registry not initialized",
    "details": {
      "enabled": true,
      "registryInitialized": false
    }
  }
}
```
**Actions:**
1. Check that metrics initialization happened during server startup
2. Verify Prometheus client dependencies are installed
3. Review server startup logs for initialization errors
4. Ensure `METRICS_ENABLED=true` is set correctly
5. Check for errors in metrics service configuration
6. Restart the service to retry initialization

**Metrics Collection Failed (Empty Output):**
```json
{
  "metrics": {
    "status": "unhealthy",
    "message": "Metrics collection failed - no data available",
    "details": {
      "enabled": true,
      "registryInitialized": true,
      "metricsOutputEmpty": true
    }
  }
}
```
**Actions:**
1. This indicates registry is initialized but collection is failing (no data returned)
2. This blocks readiness as it violates observability requirements
3. Check if collectors are properly configured
4. Verify default metrics collection is enabled (`METRICS_COLLECT_DEFAULT=true`)
5. Review application metrics recording calls
6. Check for errors in metrics service initialization or collection
7. Restart the service to retry initialization

**Metrics Disabled:**
```json
{
  "metrics": {
    "status": "healthy",
    "message": "Metrics disabled",
    "details": {
      "enabled": false
    }
  }
}
```
**Note:** This is an expected state when `METRICS_ENABLED=false`. However, for production deployments:
1. Metrics should be enabled for observability requirements
2. A warning is logged during readiness checks
3. Consider enabling metrics for production monitoring
4. See [Metrics Configuration](#metrics-configuration) for setup details

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

## Key Rotation Monitoring

AF Auth includes automated tracking of cryptographic key rotations to ensure compliance with security policies and prevent incidents from stale credentials.

### Overview

The key rotation system tracks:

- **JWT signing and verification keys**: Used for issuing and validating JWTs
- **GitHub token encryption keys**: Used for encrypting GitHub access/refresh tokens in the database
- **Service API keys**: Used for service-to-service authentication

### Daily Rotation Checks

Run the rotation status checker as part of daily operational procedures:

```bash
# Check all key rotation statuses
npm run check-key-rotation

# Example output shows:
# - Last rotation date
# - Next rotation due date
# - Days until due (or overdue)
# - Warnings for overdue keys
```

**Recommended Schedule**: Run this check daily or weekly as part of operational reviews.

### Interpreting Status

The checker uses visual indicators to highlight urgency:

| Indicator | Meaning | Action Required |
|-----------|---------|----------------|
| `⚠️ X days OVERDUE` | Key rotation is past due | **Immediate action required** - rotate key now |
| `⚠️ X days (urgent)` | Less than 7 days until due | **Plan rotation this week** |
| `⚡ X days (soon)` | 8-30 days until due | **Schedule rotation** |
| `✓ X days` | More than 30 days until due | No immediate action needed |

### Rotation Intervals

Default rotation intervals (configurable via environment variables):

- **JWT Keys**: 180 days (`JWT_KEY_ROTATION_INTERVAL_DAYS`)
- **GitHub Encryption Key**: 90 days (`GITHUB_TOKEN_ENCRYPTION_KEY_ROTATION_INTERVAL_DAYS`)
- **Service API Keys**: 365 days (`SERVICE_API_KEY_ROTATION_INTERVAL_DAYS`)

Set any interval to `0` to disable rotation warnings for that key type.

### Automated Warnings

The service automatically checks rotation status on startup and logs warnings for overdue keys:

```json
{
  "level": "warn",
  "msg": "Key rotation is OVERDUE - rotation required",
  "keyIdentifier": "jwt_signing_key",
  "keyType": "jwt_signing",
  "daysSinceRotation": 183,
  "daysOverdue": 3
}
```

**Alert Integration**: Configure alerts on these log messages to notify operations teams of overdue rotations.

### Service API Key Rotation

Service API keys are tracked automatically when using the service registry CLI:

```bash
# Rotate a service API key
npm run service-registry -- rotate my-service

# Check rotation status
npm run check-key-rotation
```

The rotation timestamp is automatically recorded and included in status checks.

### Compliance and Audit

For compliance audits, query the rotation tracking database directly:

```sql
-- View all key rotation records
SELECT 
  key_identifier,
  key_type,
  last_rotated_at,
  next_rotation_due,
  rotation_interval_days,
  is_active
FROM jwt_key_rotation
WHERE is_active = true
ORDER BY next_rotation_due ASC;

-- Find overdue keys
SELECT 
  key_identifier,
  key_type,
  last_rotated_at,
  next_rotation_due,
  EXTRACT(day FROM (NOW() - next_rotation_due)) as days_overdue
FROM jwt_key_rotation
WHERE is_active = true 
  AND next_rotation_due < NOW()
ORDER BY days_overdue DESC;

-- Service API key rotation history
SELECT 
  service_identifier,
  last_api_key_rotated_at,
  last_used_at,
  created_at
FROM service_registry
WHERE is_active = true
ORDER BY last_api_key_rotated_at ASC NULLS FIRST;
```

### Emergency Rotation

If a key compromise is detected:

1. **Immediately** rotate the affected key (see docs/security.md)
2. **Record** the emergency rotation:
   - For JWT/encryption keys: Update database record with new timestamp
   - For service API keys: Use `npm run service-registry -- rotate <service>`
3. **Verify** rotation recorded: `npm run check-key-rotation`
4. **Document** incident in security log

### Integration with CI/CD

Add rotation checks to your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Check key rotation status
  run: |
    npm run check-key-rotation
    # Parse output and fail if keys are overdue
    # (Implementation depends on CI/CD platform)
```

### Prometheus Metrics (Optional)

If metrics are enabled, rotation status can be exposed as Prometheus metrics:

```
# Days until next rotation (negative if overdue)
af_auth_key_rotation_days_until_due{key_identifier="jwt_signing_key",key_type="jwt_signing"} -3

# Days since last rotation
af_auth_key_rotation_days_since_rotation{key_identifier="jwt_signing_key",key_type="jwt_signing"} 183
```

Configure alerts in your monitoring system:

```yaml
# Example Prometheus alert
- alert: KeyRotationOverdue
  expr: af_auth_key_rotation_days_until_due < 0
  for: 1h
  annotations:
    summary: "Key rotation overdue for {{ $labels.key_identifier }}"
    description: "Key has been overdue for {{ abs($value) }} days"
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

## Prometheus Metrics

The service exposes Prometheus metrics for monitoring authentication flows, operations, and system health. Metrics are available at a protected endpoint and provide deep visibility into service behavior.

### Configuration

Metrics are configured via environment variables in `.env`:

```bash
# Enable/disable metrics collection
METRICS_ENABLED=true

# Metric name prefix (e.g., af_auth_http_requests_total)
METRICS_PREFIX=af_auth_

# Namespace for default labels
METRICS_NAMESPACE=af_auth

# Collect default Node.js metrics (CPU, memory, event loop, etc.)
METRICS_COLLECT_DEFAULT=true

# Metrics endpoint path
METRICS_ENDPOINT=/metrics

# Bearer token for metrics endpoint authentication
# Generate with: openssl rand -hex 32
# If not set, metrics endpoint is public (NOT recommended for production)
METRICS_AUTH_TOKEN=your_metrics_auth_token_here
```

**Security Note:** Always configure `METRICS_AUTH_TOKEN` in production to prevent unauthorized access to operational data. Metrics may contain information about system behavior, error rates, and usage patterns.

### Metrics and Readiness Checks

The service includes metrics health checks as part of the readiness probe to ensure observability requirements are met before accepting traffic.

**Behavior:**
- When `METRICS_ENABLED=true`, the readiness probe validates:
  - Metrics registry is properly initialized
  - Metrics can be collected and exported
  - Registry returns valid Prometheus-formatted data
- When `METRICS_ENABLED=false`, readiness passes but logs a warning
- Metrics health failures block deployment until resolved

**Configuration Options:**

```bash
# Enable metrics (required for production observability)
METRICS_ENABLED=true

# Startup timeout considerations:
# - Metrics initialization happens synchronously at startup
# - Typically completes in <100ms
# - No additional timeout configuration needed
# - If initialization fails, service won't pass readiness checks
```

**Deployment Guidelines:**

1. **Production Deployments:**
   - Always set `METRICS_ENABLED=true`
   - Configure `METRICS_AUTH_TOKEN` for security
   - Monitor readiness probe during rollout
   - Set appropriate probe timeouts (see [Recommended Probe Settings](#recommended-cloud-run-probe-settings))

2. **Development/Test Deployments:**
   - Metrics can be disabled for local development
   - Warning will be logged but deployment proceeds
   - Not recommended for staging/production environments

3. **Cold Start Considerations:**
   - Metrics initialization adds minimal overhead (<100ms)
   - No additional configuration needed for timeouts
   - Readiness probe `initialDelaySeconds: 5` is sufficient
   - Monitor Cloud Run cold start metrics if concerned

4. **Troubleshooting Failed Readiness:**
   - Check `/health` endpoint for detailed metrics component status
   - Review startup logs for initialization errors
   - Verify Prometheus client dependencies are installed
   - Ensure no conflicts with other monitoring systems

**Edge Cases:**

- **Partial Registry Failures:** If some collectors fail to initialize, metrics check will fail gracefully with diagnostic information
- **Slow Initialization:** Metrics initialization is synchronous; if it takes >5 seconds, increase readiness probe `initialDelaySeconds`
- **Disabled Metrics:** Explicit warning logged but readiness passes; ensure this is intentional for your environment

### Accessing Metrics

#### With Authentication (Recommended)

```bash
# Set your metrics authentication token
export METRICS_TOKEN="your_metrics_auth_token"

# Fetch metrics
curl -H "Authorization: Bearer ${METRICS_TOKEN}" \
  https://your-service-url/metrics
```

#### Without Authentication (Development Only)

```bash
# Only works if METRICS_AUTH_TOKEN is not configured
curl http://localhost:3000/metrics
```

### Prometheus Scrape Configuration

Add the service to your Prometheus scrape configuration:

```yaml
scrape_configs:
  - job_name: 'af-auth'
    scrape_interval: 15s
    scrape_timeout: 10s
    metrics_path: /metrics
    scheme: https
    authorization:
      type: Bearer
      credentials: 'your_metrics_auth_token'
    static_configs:
      - targets:
          - 'your-service-url'
        labels:
          environment: 'production'
          service: 'af-auth'
```

For Cloud Run with service-to-service authentication:

```yaml
scrape_configs:
  - job_name: 'af-auth-cloudrun'
    scrape_interval: 30s
    metrics_path: /metrics
    scheme: https
    authorization:
      type: Bearer
      credentials: 'your_metrics_auth_token'
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'af_auth_.*'
        action: keep
```

### Available Metrics

#### GitHub OAuth Operations

Tracks GitHub OAuth flow operations:

```
af_auth_github_oauth_operations_total{operation, status}
```

**Labels:**
- `operation`: authorize, token_exchange, token_refresh, user_fetch
- `status`: success, failure

**Example Queries:**
```promql
# Rate of successful token exchanges
rate(af_auth_github_oauth_operations_total{operation="token_exchange", status="success"}[5m])

# OAuth failure rate
sum(rate(af_auth_github_oauth_operations_total{status="failure"}[5m])) by (operation)

# Total OAuth operations
sum(af_auth_github_oauth_operations_total)
```

#### JWT Operations

Tracks JWT token lifecycle operations:

```
af_auth_jwt_operations_total{operation, status}
```

**Labels:**
- `operation`: issue, validate, revoke
- `status`: success, failure

**Example Queries:**
```promql
# JWT issuance rate
rate(af_auth_jwt_operations_total{operation="issue", status="success"}[5m])

# JWT validation failure rate
rate(af_auth_jwt_operations_total{operation="validate", status="failure"}[5m])

# Percentage of valid JWT validations
100 * sum(rate(af_auth_jwt_operations_total{operation="validate", status="success"}[5m]))
  / sum(rate(af_auth_jwt_operations_total{operation="validate"}[5m]))
```

#### Token Revocation Checks

Tracks revocation check operations:

```
af_auth_token_revocation_checks_total{status, result}
```

**Labels:**
- `status`: success, failure
- `result`: revoked, valid, error

**Example Queries:**
```promql
# Revoked token hit rate
rate(af_auth_token_revocation_checks_total{result="revoked"}[5m])

# Revocation check error rate
rate(af_auth_token_revocation_checks_total{status="failure"}[5m])

# Percentage of revoked tokens encountered
100 * sum(rate(af_auth_token_revocation_checks_total{result="revoked"}[5m]))
  / sum(rate(af_auth_token_revocation_checks_total{status="success"}[5m]))
```

#### Rate Limiting

Tracks rate limiting enforcement:

```
af_auth_rate_limit_hits_total{endpoint, action}
```

**Labels:**
- `endpoint`: auth, jwt, github-token
- `action`: allowed, blocked

**Example Queries:**
```promql
# Rate limit block rate by endpoint
rate(af_auth_rate_limit_hits_total{action="blocked"}[5m])

# Percentage of requests blocked
100 * sum(rate(af_auth_rate_limit_hits_total{action="blocked"}[5m])) by (endpoint)
  / sum(rate(af_auth_rate_limit_hits_total[5m])) by (endpoint)

# Total rate limit hits
sum(af_auth_rate_limit_hits_total)
```

#### Authentication Failures

Tracks authentication failures and suspicious attempts:

```
af_auth_auth_failures_total{type, reason}
```

**Labels:**
- `type`: oauth, jwt, whitelist, suspicious
- `reason`: Specific failure reason (e.g., invalid_state, token_expired, not_whitelisted)

**Example Queries:**
```promql
# Auth failure rate by type
rate(af_auth_auth_failures_total[5m]) by (type)

# Top failure reasons
topk(10, sum(rate(af_auth_auth_failures_total[1h])) by (reason))

# Whitelist rejection rate
rate(af_auth_auth_failures_total{type="whitelist"}[5m])
```

**Common Failure Reasons:**
- OAuth: `github_oauth_error`, `missing_code`, `missing_state`, `invalid_state`, `callback_processing_error`
- JWT: `missing_auth_header`, `token_expired`, `invalid_token`, `invalid_claims`, `token_revoked`, `user_not_found`
- Whitelist: `not_whitelisted`, `whitelist_revoked`

#### HTTP Request Duration

Tracks request latency as a histogram:

```
af_auth_http_request_duration_seconds{method, route, status_code}
```

**Labels:**
- `method`: GET, POST, etc.
- `route`: Route pattern (e.g., /auth/github, /api/jwt/issue)
- `status_code`: HTTP status code

**Buckets:** 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10 seconds

**Example Queries:**
```promql
# P95 latency for authentication endpoints
histogram_quantile(0.95, 
  sum(rate(af_auth_http_request_duration_seconds_bucket{route=~"/auth/.*"}[5m])) by (le, route)
)

# P99 latency for all requests
histogram_quantile(0.99, 
  sum(rate(af_auth_http_request_duration_seconds_bucket[5m])) by (le)
)

# Average request duration
rate(af_auth_http_request_duration_seconds_sum[5m]) 
  / rate(af_auth_http_request_duration_seconds_count[5m])
```

#### Redis Connection Status

Gauge indicating Redis connectivity:

```
af_auth_redis_connection_status
```

**Values:**
- `1`: Connected
- `0`: Disconnected

**Example Queries:**
```promql
# Redis connection status
af_auth_redis_connection_status

# Alert when Redis is down
af_auth_redis_connection_status == 0
```

#### Default Node.js Metrics

When `METRICS_COLLECT_DEFAULT=true`, the following standard metrics are collected:

- `process_cpu_user_seconds_total`: User CPU time
- `process_cpu_system_seconds_total`: System CPU time
- `process_resident_memory_bytes`: Resident memory size
- `process_heap_bytes`: Process heap size
- `nodejs_eventloop_lag_seconds`: Event loop lag
- `nodejs_active_handles_total`: Active handles
- `nodejs_active_requests_total`: Active requests
- `nodejs_gc_duration_seconds`: Garbage collection duration

### Alert Rules

Example Prometheus alert rules:

```yaml
groups:
  - name: af-auth-alerts
    interval: 30s
    rules:
      # High authentication failure rate
      - alert: HighAuthFailureRate
        expr: |
          rate(af_auth_auth_failures_total[5m]) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High authentication failure rate"
          description: "Auth failure rate is {{ $value }} failures/sec"

      # OAuth token exchange failures
      - alert: OAuthTokenExchangeFailures
        expr: |
          rate(af_auth_github_oauth_operations_total{operation="token_exchange", status="failure"}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "OAuth token exchange failures detected"
          description: "Token exchange failure rate: {{ $value }}/sec"

      # High rate limiting
      - alert: HighRateLimitBlocks
        expr: |
          (
            sum(rate(af_auth_rate_limit_hits_total{action="blocked"}[5m]))
            / sum(rate(af_auth_rate_limit_hits_total[5m]))
          ) > 0.2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High percentage of requests being rate limited"
          description: "{{ $value | humanizePercentage }} of requests blocked"

      # Redis connection down
      - alert: RedisDisconnected
        expr: |
          af_auth_redis_connection_status == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Redis connection lost"
          description: "Service cannot connect to Redis"

      # High P95 latency
      - alert: HighRequestLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(af_auth_http_request_duration_seconds_bucket[5m])) by (le)
          ) > 1.0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High request latency detected"
          description: "P95 latency is {{ $value }}s"

      # JWT validation failures
      - alert: HighJWTValidationFailureRate
        expr: |
          (
            sum(rate(af_auth_jwt_operations_total{operation="validate", status="failure"}[5m]))
            / sum(rate(af_auth_jwt_operations_total{operation="validate"}[5m]))
          ) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High JWT validation failure rate"
          description: "{{ $value | humanizePercentage }} of JWT validations failing"
```

### Grafana Dashboard

Example Grafana dashboard JSON for visualizing metrics:

```json
{
  "dashboard": {
    "title": "AF Auth - Prometheus Metrics",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "sum(rate(af_auth_http_request_duration_seconds_count[5m])) by (route)"
          }
        ]
      },
      {
        "title": "P95 Latency",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(af_auth_http_request_duration_seconds_bucket[5m])) by (le, route))"
          }
        ]
      },
      {
        "title": "Auth Failures",
        "targets": [
          {
            "expr": "sum(rate(af_auth_auth_failures_total[5m])) by (type, reason)"
          }
        ]
      },
      {
        "title": "OAuth Operations",
        "targets": [
          {
            "expr": "sum(rate(af_auth_github_oauth_operations_total[5m])) by (operation, status)"
          }
        ]
      },
      {
        "title": "JWT Operations",
        "targets": [
          {
            "expr": "sum(rate(af_auth_jwt_operations_total[5m])) by (operation, status)"
          }
        ]
      },
      {
        "title": "Rate Limit Hits",
        "targets": [
          {
            "expr": "sum(rate(af_auth_rate_limit_hits_total[5m])) by (endpoint, action)"
          }
        ]
      },
      {
        "title": "Redis Status",
        "targets": [
          {
            "expr": "af_auth_redis_connection_status"
          }
        ]
      }
    ]
  }
}
```

### Disabling Metrics

To completely disable metrics collection:

```bash
# In .env
METRICS_ENABLED=false
```

When disabled:
- No metrics collectors are initialized
- No metrics are recorded
- The `/metrics` endpoint returns 404
- No runtime overhead from metrics collection

### Avoiding High Cardinality

**DO NOT** add high-cardinality labels such as:
- User IDs
- GitHub user IDs
- IP addresses
- JWT IDs (JTI)
- Specific error messages

These can cause memory exhaustion and performance degradation in Prometheus.

**Safe labels** (low cardinality):
- Operation types (limited set)
- Status codes
- Endpoint categories
- Result types

### Troubleshooting

#### Metrics endpoint returns 404

Check that metrics are enabled:
```bash
curl http://localhost:3000/metrics
# If returns 404, check METRICS_ENABLED=true in .env
```

#### Metrics endpoint returns 401/403

Verify authentication token:
```bash
# Check token is configured
echo $METRICS_AUTH_TOKEN

# Test with token
curl -H "Authorization: Bearer ${METRICS_AUTH_TOKEN}" \
  http://localhost:3000/metrics
```

#### Metrics not updating

Verify metrics are being recorded:
```bash
# Check logs for metric initialization
grep -i "metrics" /var/log/app.log

# Verify operations are happening
# Make test requests and check metrics
curl http://localhost:3000/health
curl http://localhost:3000/metrics | grep af_auth_http
```

#### High memory usage

Check for high cardinality:
```bash
# Count unique label combinations
curl http://localhost:3000/metrics | grep af_auth_ | wc -l

# Should be < 1000 label combinations per metric type
# If higher, review labels being used
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
