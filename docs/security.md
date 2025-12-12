# Security Guide

This guide covers security best practices, secret management, JWT verification, and operational security for the AF Auth service.

## Table of Contents

- [Security Overview](#security-overview)
- [Secret Manager Setup](#secret-manager-setup)
- [Secret Rotation](#secret-rotation)
- [JWT Security](#jwt-security)
- [Database Security](#database-security)
- [Audit Logging](#audit-logging)
- [Network Security](#network-security)
- [Incident Response](#incident-response)

## Security Overview

AF Auth implements defense-in-depth security across multiple layers:

```mermaid
graph TD
    A[External Request] -->|HTTPS Only| B[Cloud Run]
    B -->|Service Account| C[Secret Manager]
    B -->|IAM Auth| D[Cloud SQL]
    B -->|Structured Logs| E[Audit Trail]
    C -->|Encrypted| F[Secrets Storage]
    D -->|Encrypted| G[Data at Rest]
    E -->|Redacted| H[Cloud Logging]
    
    style A fill:#f9f,stroke:#333
    style B fill:#bbf,stroke:#333
    style C fill:#bfb,stroke:#333
    style D fill:#bfb,stroke:#333
    style E fill:#fbb,stroke:#333
```

### Security Principles

1. **Least Privilege**: Each component has minimal required permissions
2. **Defense in Depth**: Multiple layers of security controls
3. **Encryption**: Data encrypted in transit and at rest
4. **Auditability**: All security events logged
5. **Rotation**: Regular rotation of secrets and credentials

## Secret Manager Setup

### Required Secrets

AF Auth requires these secrets for production operation:

| Secret Name | Purpose | Rotation Frequency | Notes |
|-------------|---------|-------------------|-------|
| `database-url` | PostgreSQL connection string | 90 days | Includes credentials |
| `github-client-id` | GitHub OAuth App ID | When compromised | Public, but stored centrally |
| `github-client-secret` | GitHub OAuth secret | 90 days | Must match GitHub App |
| `session-secret` | CSRF token generation | 60 days | 32+ character hex string |
| `jwt-private-key` | JWT signing key | 180 days | RSA private key (2048+ bits) |
| `jwt-public-key` | JWT verification key | When private key rotates | RSA public key |

### Creating Secrets

```bash
# Set project and region
export PROJECT_ID="your-project-id"
export SERVICE_NAME="af-auth"

# Database credentials
echo -n "postgresql://user:password@/dbname?host=/cloudsql/connection-name" | \
  gcloud secrets create database-url \
    --replication-policy=automatic \
    --data-file=-

# GitHub OAuth credentials
echo -n "Iv1.your_client_id" | \
  gcloud secrets create github-client-id \
    --replication-policy=automatic \
    --data-file=-

echo -n "your_github_client_secret" | \
  gcloud secrets create github-client-secret \
    --replication-policy=automatic \
    --data-file=-

# Session secret (generate securely)
openssl rand -hex 32 | \
  gcloud secrets create session-secret \
    --replication-policy=automatic \
    --data-file=-

# JWT keys (RSA 2048-bit)
# Generate keys first (see JWT Security section)
cat jwt-private.pem | \
  gcloud secrets create jwt-private-key \
    --replication-policy=automatic \
    --data-file=-

cat jwt-public.pem | \
  gcloud secrets create jwt-public-key \
    --replication-policy=automatic \
    --data-file=-
```

### Secret Access Control

Grant service account access to secrets:

```bash
# Get service account email
export SA_EMAIL="${SERVICE_NAME}-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant access to each secret
for secret in database-url github-client-id github-client-secret session-secret jwt-private-key jwt-public-key; do
  gcloud secrets add-iam-policy-binding ${secret} \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor"
done
```

### Secret Versioning

Secrets support multiple versions for zero-downtime rotation:

```bash
# List all versions
gcloud secrets versions list github-client-secret

# Access specific version
gcloud secrets versions access 2 --secret=github-client-secret

# Disable old version
gcloud secrets versions disable 1 --secret=github-client-secret

# Destroy old version (irreversible)
gcloud secrets versions destroy 1 --secret=github-client-secret
```

## Secret Rotation

### Rotation Strategy

Implement rolling rotations to avoid service disruption:

#### 1. GitHub OAuth Secrets

**Frequency**: Every 90 days or when compromised

**Process**:

```bash
# Step 1: Generate new client secret in GitHub App settings
# (GitHub allows multiple secrets simultaneously)

# Step 2: Add new secret version
echo -n "new_github_client_secret" | \
  gcloud secrets versions add github-client-secret --data-file=-

# Step 3: Deploy Cloud Run with new secret
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --update-secrets="GITHUB_CLIENT_SECRET=github-client-secret:latest"

# Step 4: Verify service health
curl https://${SERVICE_URL}/health

# Step 5: Revoke old secret in GitHub (after 24 hour grace period)

# Step 6: Disable old secret version
gcloud secrets versions disable VERSION_NUMBER --secret=github-client-secret
```

#### 2. Session Secret

**Frequency**: Every 60 days

**Process**:

```bash
# Generate new session secret
openssl rand -hex 32 | \
  gcloud secrets versions add session-secret --data-file=-

# Update Cloud Run
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --update-secrets="SESSION_SECRET=session-secret:latest"

# Note: Active OAuth sessions will be invalidated
# Users will need to re-authenticate
```

#### 3. JWT Private Key

**Frequency**: Every 180 days or when compromised

**Process** (requires coordination with downstream services):

```bash
# Step 1: Generate new key pair
openssl genpkey -algorithm RSA -out jwt-private-new.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in jwt-private-new.pem -out jwt-public-new.pem

# Step 2: Add new private key version
cat jwt-private-new.pem | \
  gcloud secrets versions add jwt-private-key --data-file=-

# Step 3: Add new public key version  
cat jwt-public-new.pem | \
  gcloud secrets versions add jwt-public-key --data-file=-

# Step 4: Deploy AF Auth with new keys
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --update-secrets=/app/.keys/jwt-private.pem=jwt-private-key:latest \
  --update-secrets=/app/.keys/jwt-public.pem=jwt-public-key:latest

# Step 5: Distribute new public key to downstream services
curl https://${SERVICE_URL}/api/jwks > jwt-public-new.pem

# Step 6: Wait for all downstream services to update (grace period: 7 days)

# Step 7: After grace period, existing tokens expire naturally (30 days)
```

#### 4. Database Credentials

**Frequency**: Every 90 days

**Process**:

```bash
# Step 1: Create new database user
gcloud sql users create newuser \
  --instance=${SERVICE_NAME}-db \
  --password="$(openssl rand -base64 32)"

# Step 2: Grant permissions to new user
# Connect via Cloud SQL Proxy and run:
# GRANT ALL PRIVILEGES ON DATABASE af_auth TO newuser;

# Step 3: Update DATABASE_URL secret
echo -n "postgresql://newuser:newpassword@/af_auth?host=/cloudsql/..." | \
  gcloud secrets versions add database-url --data-file=-

# Step 4: Deploy with new credentials
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --update-secrets="DATABASE_URL=database-url:latest"

# Step 5: Verify service health
curl https://${SERVICE_URL}/health

# Step 6: Drop old database user
gcloud sql users delete olduser --instance=${SERVICE_NAME}-db
```

### Rotation Checklist

Use this checklist for each rotation:

- [ ] Generate new secret/credential
- [ ] Add new version to Secret Manager
- [ ] Update Cloud Run service
- [ ] Verify service health after update
- [ ] Monitor logs for errors (24-48 hours)
- [ ] Revoke/disable old secret
- [ ] Document rotation in security log
- [ ] Update downstream services (if applicable)

## JWT Security

### Key Generation

Generate RSA key pairs for JWT signing:

```bash
# Generate 2048-bit RSA private key
openssl genpkey -algorithm RSA -out jwt-private.pem -pkeyopt rsa_keygen_bits:2048

# Extract public key
openssl rsa -pubout -in jwt-private.pem -out jwt-public.pem

# Verify key pair
openssl rsa -in jwt-private.pem -check

# View key details
openssl rsa -text -in jwt-private.pem -noout
```

**Security Requirements**:

- **Algorithm**: RS256 (RSA + SHA-256)
- **Key Size**: Minimum 2048 bits (4096 for high-security environments)
- **Storage**: Private key NEVER committed to source control
- **Access**: Private key only accessible to AF Auth service
- **Distribution**: Public key distributed to all consuming services

### JWT Verification for Downstream Services

Downstream services must verify JWTs issued by AF Auth:

#### Node.js Example

```javascript
const jwt = require('jsonwebtoken');
const fs = require('fs');

// Download public key from AF Auth service
// curl https://auth.example.com/api/jwks > jwt-public.pem

const publicKey = fs.readFileSync('jwt-public.pem', 'utf8');

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'https://auth.example.com',
      audience: 'https://auth.example.com',
      clockTolerance: 60 // Allow 60 seconds clock skew
    });
    
    // Check whitelist status
    if (!decoded.isWhitelisted) {
      throw new Error('User not whitelisted');
    }
    
    return decoded;
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return null;
  }
}

// Express middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  
  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  req.user = decoded;
  next();
}
```

#### Python Example

```python
import jwt
import requests

# Download public key
PUBLIC_KEY_URL = 'https://auth.example.com/api/jwks'
public_key = requests.get(PUBLIC_KEY_URL).text

def verify_token(token):
    try:
        decoded = jwt.decode(
            token,
            public_key,
            algorithms=['RS256'],
            issuer='https://auth.example.com',
            audience='https://auth.example.com',
            leeway=60  # Clock skew tolerance
        )
        
        # Check whitelist status
        if not decoded.get('isWhitelisted'):
            raise ValueError('User not whitelisted')
        
        return decoded
    except jwt.ExpiredSignatureError:
        print('Token has expired')
        return None
    except jwt.InvalidTokenError as e:
        print(f'Invalid token: {e}')
        return None

# Flask decorator
from functools import wraps
from flask import request, jsonify

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing authorization header'}), 401
        
        token = auth_header[7:]
        decoded = verify_token(token)
        
        if not decoded:
            return jsonify({'error': 'Invalid or expired token'}), 401
        
        request.user = decoded
        return f(*args, **kwargs)
    
    return decorated
```

### JWT Claims

AF Auth JWTs include these standard and custom claims:

| Claim | Type | Description | Required |
|-------|------|-------------|----------|
| `sub` | string | User UUID (internal ID) | Yes |
| `githubId` | string | GitHub user ID | Yes |
| `isWhitelisted` | boolean | Whitelist status at issuance | Yes |
| `iss` | string | Issuer URL | Yes |
| `aud` | string | Audience URL | Yes |
| `iat` | number | Issued at timestamp | Yes |
| `exp` | number | Expiration timestamp | Yes |

### Token Expiration

- **Default**: 30 days
- **Configurable**: via `JWT_EXPIRES_IN` environment variable
- **Non-renewable**: Tokens cannot be refreshed (by design)
- **Validation**: Downstream services MUST check `exp` claim

### Compromised Token Response

If a JWT private key is compromised:

```bash
# 1. Immediately rotate JWT keys
openssl genpkey -algorithm RSA -out jwt-private-emergency.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in jwt-private-emergency.pem -out jwt-public-emergency.pem

# 2. Deploy new keys
cat jwt-private-emergency.pem | gcloud secrets versions add jwt-private-key --data-file=-
cat jwt-public-emergency.pem | gcloud secrets versions add jwt-public-key --data-file=-

gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --update-secrets=/app/.keys/jwt-private.pem=jwt-private-key:latest \
  --update-secrets=/app/.keys/jwt-public.pem=jwt-public-key:latest

# 3. Notify downstream services to update public key IMMEDIATELY

# 4. All existing tokens remain valid until expiration (up to 30 days)
# Consider invalidating compromised users via whitelist

# 5. Document incident
```

## Database Security

### Connection Security

**Cloud SQL IAM Authentication** (Recommended):

```bash
# Create database user with IAM authentication
gcloud sql users create ${SA_EMAIL} \
  --instance=${SERVICE_NAME}-db \
  --type=CLOUD_IAM_SERVICE_ACCOUNT

# Grant permissions
# In database: GRANT ALL PRIVILEGES ON DATABASE af_auth TO "service-account-email";
```

**Connection String Security**:

```
# Public IP (requires SSL)
postgresql://user:password@public-ip:5432/af_auth?sslmode=require

# Cloud SQL Proxy (recommended)
postgresql://user:password@/af_auth?host=/cloudsql/project:region:instance&sslmode=disable

# Private IP (requires VPC)
postgresql://user:password@private-ip:5432/af_auth?sslmode=require
```

### Encryption

- **In Transit**: TLS 1.2+ enforced for all connections
- **At Rest**: AES-256 encryption by default in Cloud SQL
- **Backups**: Encrypted with same key as primary instance

### Least Privilege Access

Grant minimal required permissions:

```sql
-- Create application user
CREATE USER af_auth_app WITH PASSWORD 'strong_password';

-- Grant minimal permissions
GRANT CONNECT ON DATABASE af_auth TO af_auth_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO af_auth_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO af_auth_app;

-- Revoke dangerous permissions
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
```

### Data Retention

Implement data retention policies:

```sql
-- Delete audit logs older than 90 days
DELETE FROM service_audit_logs 
WHERE created_at < NOW() - INTERVAL '90 days';

-- Archive old audit logs before deletion
CREATE TABLE service_audit_logs_archive AS 
SELECT * FROM service_audit_logs 
WHERE created_at < NOW() - INTERVAL '90 days';
```

## Audit Logging

### What to Log

AF Auth automatically logs these security events:

✅ **Always Logged**:
- Authentication attempts (success/failure)
- OAuth flow initiation and completion
- JWT token generation
- Service registry access attempts
- Whitelist status changes
- Database connection failures
- Configuration changes

❌ **Never Logged**:
- Access tokens
- Session secrets
- JWT private keys
- Passwords
- API keys (logged as `[REDACTED]`)

### Audit Log Structure

```json
{
  "level": "info",
  "time": "2024-12-11T10:30:00.000Z",
  "service": "af-auth",
  "msg": "User authenticated successfully",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "githubId": "12345678",
  "action": "github_oauth_complete",
  "isWhitelisted": true,
  "ipAddress": "203.0.113.42",
  "userAgent": "Mozilla/5.0..."
}
```

### Querying Audit Logs

```bash
# Failed authentication attempts
gcloud logging read 'resource.type="cloud_run_revision"
  AND jsonPayload.action="authentication_failed"
  AND timestamp>="2024-12-01T00:00:00Z"' \
  --format=json

# Specific user activity
gcloud logging read 'jsonPayload.userId="550e8400-e29b-41d4-a716-446655440000"' \
  --limit=100

# Whitelist changes
gcloud logging read 'jsonPayload.action="whitelist_updated"' \
  --format=json

# Service registry access
gcloud logging read 'jsonPayload.action="service_registry_access"' \
  --limit=50
```

### Log Retention

Configure log retention in Cloud Logging:

```bash
# Set retention to 400 days (default is 30)
gcloud logging buckets update _Default \
  --location=global \
  --retention-days=400
```

### Security Alerts

Create log-based alerts for suspicious activity:

```bash
# Alert on multiple failed authentication attempts
gcloud logging metrics create auth_failures_high \
  --description="High rate of authentication failures" \
  --log-filter='resource.type="cloud_run_revision"
    AND jsonPayload.action="authentication_failed"'

# Create alert policy
gcloud alpha monitoring policies create \
  --notification-channels=EMAIL_CHANNEL_ID \
  --display-name="High Auth Failure Rate" \
  --condition-threshold-value=10 \
  --condition-threshold-duration=60s \
  --condition-display-name="Auth failures > 10/min"
```

## Network Security

### HTTPS Enforcement

Cloud Run enforces HTTPS by default. Never allow HTTP:

```bash
# Ensure HTTPS-only
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --ingress=all  # Allows HTTPS only, no HTTP
```

### IP Whitelisting

Restrict access to specific IP ranges (optional):

```bash
# Create Cloud Armor policy
gcloud compute security-policies create ${SERVICE_NAME}-policy \
  --description="AF Auth IP whitelist"

# Add allowed IP ranges
gcloud compute security-policies rules create 1000 \
  --security-policy=${SERVICE_NAME}-policy \
  --expression="inIpRange(origin.ip, '203.0.113.0/24')" \
  --action=allow

# Deny all other IPs
gcloud compute security-policies rules create 2000 \
  --security-policy=${SERVICE_NAME}-policy \
  --action=deny-403
```

### VPC Egress Control

Restrict outbound connections:

```bash
# Create VPC connector with egress control
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --vpc-connector=${SERVICE_NAME}-connector \
  --vpc-egress=private-ranges-only  # Only private IPs via VPC
```

### DDoS Protection

Cloud Run includes built-in DDoS protection. Additional measures:

```bash
# Set max instances to prevent cost overruns
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --max-instances=100

# Set concurrency limits
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --concurrency=80
```

## Incident Response

### Security Incident Playbook

#### 1. Compromised GitHub OAuth Credentials

**Detection**: Unexpected OAuth callbacks, suspicious authentications

**Response**:

```bash
# 1. Rotate GitHub OAuth secret immediately
# In GitHub App settings: Generate new client secret

# 2. Update Secret Manager
echo -n "new_github_secret" | \
  gcloud secrets versions add github-client-secret --data-file=-

# 3. Deploy update
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --update-secrets="GITHUB_CLIENT_SECRET=github-client-secret:latest"

# 4. Revoke old secret in GitHub App settings

# 5. Review audit logs for unauthorized access
gcloud logging read 'jsonPayload.action="github_oauth_complete"
  AND timestamp>="INCIDENT_TIME"'

# 6. Document incident
```

#### 2. Compromised JWT Private Key

**Detection**: Fraudulent JWTs verified successfully, key exposed in logs/repo

**Response**:

```bash
# 1. Immediately rotate JWT keys
openssl genpkey -algorithm RSA -out jwt-private-new.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in jwt-private-new.pem -out jwt-public-new.pem

# 2. Deploy new keys
cat jwt-private-new.pem | gcloud secrets versions add jwt-private-key --data-file=-
cat jwt-public-new.pem | gcloud secrets versions add jwt-public-key --data-file=-

gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --update-secrets=/app/.keys/jwt-private.pem=jwt-private-key:latest \
  --update-secrets=/app/.keys/jwt-public.pem=jwt-public-key:latest

# 3. Notify ALL downstream services to update public key

# 4. Consider revoking affected users via whitelist

# 5. Monitor for fraudulent token usage
```

#### 3. Database Breach

**Detection**: Unusual database queries, unauthorized access

**Response**:

```bash
# 1. Immediately rotate database credentials
gcloud sql users set-password newuser \
  --instance=${SERVICE_NAME}-db \
  --password="$(openssl rand -base64 32)"

# 2. Update DATABASE_URL secret
echo -n "postgresql://newuser:newpassword@..." | \
  gcloud secrets versions add database-url --data-file=-

# 3. Deploy update
gcloud run services update ${SERVICE_NAME} \
  --region=${REGION} \
  --update-secrets="DATABASE_URL=database-url:latest"

# 4. Review database audit logs
gcloud sql operations list --instance=${SERVICE_NAME}-db

# 5. Restore from backup if data integrity compromised
gcloud sql backups list --instance=${SERVICE_NAME}-db
gcloud sql backups restore BACKUP_ID --instance=${SERVICE_NAME}-db

# 6. Notify affected users if PII exposed
```

#### 4. Unauthorized Whitelist Changes

**Detection**: Unexpected whitelist grants, audit log anomalies

**Response**:

```bash
# 1. Review whitelist changes
gcloud logging read 'jsonPayload.action="whitelist_updated"
  AND timestamp>="INCIDENT_TIME"'

# 2. Identify unauthorized users
npm run db:studio
# Review users table for suspicious is_whitelisted=true

# 3. Revoke unauthorized users
# SQL: UPDATE users SET is_whitelisted=false WHERE github_user_id IN (...);

# 4. Review who made changes (if admin tool exists)

# 5. Implement additional controls
```

### Incident Communication Template

```
Subject: Security Incident - AF Auth Service

Date: YYYY-MM-DD HH:MM UTC
Severity: [Critical/High/Medium/Low]
Status: [Investigating/Mitigated/Resolved]

Summary:
[Brief description of the incident]

Impact:
- Affected services: [list]
- Affected users: [count or scope]
- Data exposed: [Yes/No, details]

Actions Taken:
1. [Action 1]
2. [Action 2]
3. [Action 3]

Next Steps:
- [Step 1]
- [Step 2]

Timeline:
- HH:MM - Incident detected
- HH:MM - Response initiated
- HH:MM - Mitigation deployed
- HH:MM - Incident resolved

Contact:
Security Team: security@example.com
```

## Security Checklist

Use this checklist for regular security reviews:

### Monthly
- [ ] Review audit logs for anomalies
- [ ] Check for failed authentication spikes
- [ ] Verify all secrets are not expiring soon
- [ ] Review IAM permissions for service accounts
- [ ] Check for security updates in dependencies

### Quarterly
- [ ] Rotate session secret
- [ ] Rotate GitHub OAuth secret
- [ ] Rotate database credentials
- [ ] Review and update IP whitelist (if applicable)
- [ ] Conduct security training with team

### Annually
- [ ] Rotate JWT key pair
- [ ] Full security audit
- [ ] Penetration testing
- [ ] Review and update security policies
- [ ] Update incident response playbook

## References

- [Secret Manager Best Practices](https://cloud.google.com/secret-manager/docs/best-practices)
- [Cloud SQL Security](https://cloud.google.com/sql/docs/postgres/security)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Security Guidelines](https://owasp.org/www-project-top-ten/)
- [Cloud Run Security](https://cloud.google.com/run/docs/securing/overview)
