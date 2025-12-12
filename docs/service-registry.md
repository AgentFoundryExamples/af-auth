# Service Registry

The Service Registry is a security feature that controls which downstream services can access user GitHub tokens. Only registered and authenticated services can retrieve tokens, with all access attempts logged for audit purposes.

## Overview

### Purpose

The Service Registry provides:

- **Access Control**: Only registered services can retrieve GitHub tokens
- **Authentication**: Services must authenticate with service-specific API keys
- **Audit Logging**: All access attempts are logged (without exposing tokens)
- **Lifecycle Management**: Services can be activated, deactivated, and rotated

### Security Model

```mermaid
sequenceDiagram
    participant Service as Downstream Service
    participant API as AF Auth API
    participant Registry as Service Registry
    participant DB as Database
    participant Audit as Audit Log

    Service->>API: POST /api/github-token<br/>Authorization: Bearer serviceId:apiKey
    API->>Registry: Authenticate Service
    Registry->>DB: Find service by identifier
    DB-->>Registry: Service record
    Registry->>Registry: Verify API key (bcrypt)
    alt Authentication Failed
        Registry-->>API: Unauthorized
        API->>Audit: Log failed attempt
        API-->>Service: 401 Unauthorized
    else Authentication Successful
        Registry-->>API: Service authenticated
        API->>DB: Find user by ID/GitHub ID
        DB-->>API: User record
        alt User not whitelisted
            API->>Audit: Log failed attempt
            API-->>Service: 403 Forbidden
        else User whitelisted
            API->>Audit: Log successful access
            API->>DB: Update service last_used_at
            API-->>Service: 200 OK + GitHub token
        end
    end
```

## Managing Services

### Using the CLI

The recommended way to manage services is using the CLI tool:

```bash
npm run service-registry -- <command> [options]
```

### Adding a Service

```bash
# Basic usage
npm run service-registry -- add my-service

# With description
npm run service-registry -- add my-service \
  --description "Analytics pipeline service"

# With scopes (for future use)
npm run service-registry -- add my-service \
  --description "CI/CD pipeline" \
  --scopes "read,write"
```

**Output:**
```
✅ Service created successfully!

Service Details:
  ID: 550e8400-e29b-41d4-a716-446655440000
  Identifier: my-service
  Description: Analytics pipeline service
  Scopes: (none)
  Active: Yes

⚠️  IMPORTANT: Save this API key securely. It will not be shown again!

API Key: 3f7a4b2c9d1e8f6a5b3c7d9e1f2a4b6c8d0e1f3a5b7c9d1e3f5a7b9c1d3e5f7a

To use this service, include the following in your requests:
  Authorization: Bearer my-service:3f7a4b2c9d1e8f6a5b3c7d9e1f2a4b6c8d0e1f3a5b7c9d1e3f5a7b9c1d3e5f7a
```

**Important:** Save the API key immediately. It cannot be retrieved later.

### Rotating API Keys

When a service's API key is compromised or as part of regular security maintenance:

```bash
npm run service-registry -- rotate my-service
```

**Output:**
```
✅ API key rotated successfully!

⚠️  IMPORTANT: Save this new API key securely. The old key is now invalid!

New API Key: 9c1d3e5f7a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d

To use this service, include the following in your requests:
  Authorization: Bearer my-service:9c1d3e5f7a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d
```

**Note:** The old API key is immediately invalidated.

### Deactivating a Service

Temporarily disable a service without deleting it:

```bash
npm run service-registry -- deactivate my-service
```

The service will be unable to authenticate until reactivated.

### Activating a Service

Re-enable a deactivated service:

```bash
npm run service-registry -- activate my-service
```

### Deleting a Service

Permanently remove a service from the registry:

```bash
npm run service-registry -- delete my-service
```

**Output:**
```
⚠️  Are you sure you want to permanently delete 'my-service'? (yes/no): yes
✅ Service 'my-service' deleted permanently.
```

### Listing Services

View all active services:

```bash
npm run service-registry -- list
```

View all services (including inactive):

```bash
npm run service-registry -- list --all
```

**Output:**
```
Found 2 services:

• my-service [✓ Active]
  ID: 550e8400-e29b-41d4-a716-446655440000
  Description: Analytics pipeline service
  Scopes: (none)
  Created: 12/12/2024, 12:00:00 PM
  Last Used: 12/12/2024, 1:30:00 PM

• legacy-service [✗ Inactive]
  ID: 660e9500-f39c-51e5-b827-557766551111
  Description: Old CI pipeline (deprecated)
  Scopes: read
  Created: 10/1/2024, 9:00:00 AM
  Last Used: 11/30/2024, 5:00:00 PM
```

### Showing Service Details

View detailed information about a specific service:

```bash
npm run service-registry -- show my-service
```

## Using the API

### Authentication

Services authenticate using either Bearer token or Basic auth:

**Bearer Token (Recommended):**
```http
Authorization: Bearer <serviceIdentifier>:<apiKey>
```

**Basic Auth:**
```http
Authorization: Basic <base64(serviceIdentifier:apiKey)>
```

### Retrieving GitHub Tokens

**Endpoint:** `POST /api/github-token`

**Request Headers:**
```http
Authorization: Bearer my-service:3f7a4b2c9d1e8f6a5b3c7d9e1f2a4b6c8d0e1f3a5b7c9d1e3f5a7b9c1d3e5f7a
Content-Type: application/json
```

**Request Body (Option 1: Using User ID):**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Request Body (Option 2: Using GitHub User ID):**
```json
{
  "githubUserId": "12345678"
}
```

**Success Response (200 OK):**
```json
{
  "token": "ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "expiresAt": "2025-01-15T12:00:00.000Z",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "githubUserId": "12345678",
    "isWhitelisted": true
  }
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid service credentials |
| 400 | `MISSING_USER_IDENTIFIER` | Neither userId nor githubUserId provided |
| 404 | `USER_NOT_FOUND` | User does not exist |
| 403 | `USER_NOT_WHITELISTED` | User is not whitelisted |
| 404 | `TOKEN_NOT_AVAILABLE` | User has no GitHub token |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Example: cURL

```bash
curl -X POST https://auth.example.com/api/github-token \
  -H "Authorization: Bearer my-service:3f7a4b2c9d1e8f6a5b3c7d9e1f2a4b6c8d0e1f3a5b7c9d1e3f5a7b9c1d3e5f7a" \
  -H "Content-Type: application/json" \
  -d '{"userId": "550e8400-e29b-41d4-a716-446655440000"}'
```

### Example: Node.js

```javascript
const axios = require('axios');

async function getGitHubToken(userId) {
  const response = await axios.post(
    'https://auth.example.com/api/github-token',
    { userId },
    {
      headers: {
        'Authorization': `Bearer my-service:${process.env.SERVICE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  return response.data.token;
}
```

### Example: Python

```python
import requests
import os

def get_github_token(user_id):
    service_id = "my-service"
    api_key = os.environ.get("SERVICE_API_KEY")
    
    response = requests.post(
        "https://auth.example.com/api/github-token",
        json={"userId": user_id},
        headers={
            "Authorization": f"Bearer {service_id}:{api_key}",
            "Content-Type": "application/json"
        }
    )
    
    response.raise_for_status()
    return response.json()["token"]
```

## Security Best Practices

### API Key Storage

**❌ Never:**
- Commit API keys to version control
- Log API keys in application logs
- Share API keys between services
- Hardcode API keys in source code

**✅ Always:**
- Store API keys in secure environment variables
- Use secret management systems (e.g., Google Secret Manager, AWS Secrets Manager)
- Rotate keys regularly (quarterly or after security incidents)
- Use separate keys for development and production

### Key Rotation Schedule

| Environment | Rotation Frequency |
|-------------|-------------------|
| Production | Every 90 days |
| Staging | Every 180 days |
| Development | As needed |

### Incident Response

If an API key is compromised:

1. **Immediately rotate the key:**
   ```bash
   npm run service-registry -- rotate <service-id>
   ```

2. **Update all services** with the new key

3. **Review audit logs** to identify unauthorized access:
   ```sql
   SELECT * FROM service_audit_logs
   WHERE service_id = '<service-id>'
   AND created_at >= '<compromise-date>'
   ORDER BY created_at DESC;
   ```

4. **Investigate affected users** if unauthorized access occurred

## Audit Logging

All service access attempts are logged to the `service_audit_logs` table.

### What is Logged

- Service ID (not service credentials)
- User ID (not GitHub token)
- Action performed
- Success/failure status
- Error messages (if failed)
- IP address
- User agent
- Timestamp

### What is NOT Logged

- Service API keys
- GitHub access tokens
- Any other sensitive credentials

### Querying Audit Logs

**Find all access by a service:**
```sql
SELECT sal.*, sr.service_identifier, u.github_user_id
FROM service_audit_logs sal
JOIN service_registry sr ON sal.service_id = sr.id
JOIN users u ON sal.user_id = u.id
WHERE sr.service_identifier = 'my-service'
ORDER BY sal.created_at DESC
LIMIT 100;
```

**Find failed access attempts:**
```sql
SELECT sal.*, sr.service_identifier
FROM service_audit_logs sal
JOIN service_registry sr ON sal.service_id = sr.id
WHERE sal.success = false
AND sal.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY sal.created_at DESC;
```

**Find access for a specific user:**
```sql
SELECT sal.*, sr.service_identifier
FROM service_audit_logs sal
JOIN service_registry sr ON sal.service_id = sr.id
WHERE sal.user_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY sal.created_at DESC;
```

## Database Schema

### service_registry Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `service_identifier` | VARCHAR(255) | Unique service identifier |
| `hashed_api_key` | TEXT | Bcrypt hash of API key |
| `allowed_scopes` | TEXT[] | Allowed scopes (future use) |
| `is_active` | BOOLEAN | Whether service is active |
| `description` | TEXT | Human-readable description |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |
| `last_used_at` | TIMESTAMPTZ | Last successful access |

### service_audit_logs Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `service_id` | UUID | Service ID |
| `user_id` | UUID | User ID |
| `action` | VARCHAR(100) | Action performed |
| `success` | BOOLEAN | Whether request succeeded |
| `error_message` | TEXT | Error message (if failed) |
| `ip_address` | VARCHAR(45) | Requesting IP address |
| `user_agent` | TEXT | User agent string |
| `created_at` | TIMESTAMPTZ | Timestamp of access |

## Troubleshooting

### Service Cannot Authenticate

**Symptoms:**
- Receiving 401 Unauthorized
- Error: "Invalid service credentials"

**Solutions:**
1. Verify the service identifier is correct
2. Verify the API key hasn't been rotated
3. Check that the service is active:
   ```bash
   npm run service-registry -- show <service-id>
   ```
4. Ensure Authorization header format is correct

### User Token Not Available

**Symptoms:**
- Receiving 404 TOKEN_NOT_AVAILABLE
- Error: "GitHub access token not available for this user"

**Solutions:**
1. Verify the user has completed GitHub OAuth flow
2. Check user record in database:
   ```sql
   SELECT id, github_user_id, github_access_token IS NOT NULL as has_token
   FROM users WHERE id = '<user-id>';
   ```
3. User may need to re-authenticate with GitHub

### User Not Whitelisted

**Symptoms:**
- Receiving 403 USER_NOT_WHITELISTED

**Solutions:**
1. Whitelist the user:
   ```sql
   UPDATE users SET is_whitelisted = true WHERE id = '<user-id>';
   ```
2. Verify whitelist status:
   ```bash
   npm run db:studio
   # Navigate to users table and check is_whitelisted column
   ```

## Rate Limiting Considerations

**Current Implementation:**
- No rate limiting is currently enforced at the API level

**Recommendations for Production:**
- Implement rate limiting per service (e.g., 1000 requests/hour)
- Monitor audit logs for unusual access patterns
- Set up alerts for:
  - High failure rates from a service
  - Sudden spike in requests
  - Access attempts from unusual IP addresses

**Future Enhancement:**
Consider adding rate limiting configuration to the service registry:
```sql
ALTER TABLE service_registry
ADD COLUMN rate_limit_per_hour INTEGER DEFAULT 1000;
```

## Migration Guide

### Upgrading Existing Systems

If you have an existing system that accesses GitHub tokens directly:

1. **Create a service in the registry:**
   ```bash
   npm run service-registry -- add legacy-system \
     --description "Existing CI/CD pipeline"
   ```

2. **Update your service code** to use the new API endpoint

3. **Test in staging** before deploying to production

4. **Monitor audit logs** for any access issues

5. **Decommission direct database access** once verified

## Environment Variables

No additional environment variables are required for the Service Registry. All configuration is stored in the database.

## Support

For issues or questions:
- Review audit logs for detailed error information
- Check service status with `npm run service-registry -- show <service-id>`
- Contact the administrator at the configured admin email

---

**Related Documentation:**
- [API Reference](./api.md)
- [Database Schema](./database.md)
- [Security Best Practices](./logging.md)
