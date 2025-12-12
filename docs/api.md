# API Reference

Complete API documentation for AF Auth endpoints.

## Table of Contents

- [Authentication Flow](#authentication-flow)
- [Health & Monitoring](#health--monitoring)
- [JWT Token Management](#jwt-token-management)
- [Service Registry API](#service-registry-api)

## Base URL

```
Development: http://localhost:3000
Production: https://your-domain.com
```

## Authentication Flow

### Initiate GitHub OAuth

**Endpoint:** `GET /auth/github`

**Description:** Renders a login page with a GitHub OAuth authorization link.

**Response:** HTML page with "Sign in with GitHub" button

**Example:**
```bash
curl http://localhost:3000/auth/github
```

### GitHub OAuth Callback

**Endpoint:** `GET /auth/github/callback`

**Description:** Handles the OAuth callback from GitHub. Not called directly by clients.

**Query Parameters:**
- `code` (string, required): Authorization code from GitHub
- `state` (string, required): CSRF protection state token

**Response:** 
- Success: HTML page showing token ready or unauthorized message
- Error: HTML error page with details

## Health & Monitoring

### Health Check

**Endpoint:** `GET /health`

**Description:** Check service and database health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-12-12T12:00:00.000Z",
  "uptime": 3600.5,
  "environment": "development",
  "database": {
    "connected": true,
    "healthy": true
  }
}
```

**Status Codes:**
- `200 OK`: Service is healthy
- `503 Service Unavailable`: Service is unhealthy (database issue)

**Example:**
```bash
curl http://localhost:3000/health
```

### Readiness Probe

**Endpoint:** `GET /ready`

**Description:** Kubernetes/Cloud Run readiness probe. Checks if service is ready to accept traffic.

**Response:**
```json
{
  "status": "ready"
}
```

**Status Codes:**
- `200 OK`: Service is ready
- `503 Service Unavailable`: Service is not ready

### Liveness Probe

**Endpoint:** `GET /live`

**Description:** Kubernetes/Cloud Run liveness probe. Checks if service is alive.

**Response:**
```json
{
  "status": "alive"
}
```

**Status Codes:**
- `200 OK`: Service is alive

## JWT Token Management

### Generate JWT

**Endpoint:** `GET /api/token`

**Description:** Generate a fresh JWT for an authenticated user.

**Query Parameters:**
- `userId` (string, required): User UUID

**Response:**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "30d"
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `MISSING_USER_ID` | userId query parameter is required |
| 404 | `USER_NOT_FOUND` | User does not exist |
| 500 | `INTERNAL_ERROR` | Server error |

**Example:**
```bash
curl "http://localhost:3000/api/token?userId=550e8400-e29b-41d4-a716-446655440000"
```

### Refresh JWT

**Endpoint:** `POST /api/token`

**Description:** Refresh an existing JWT by validating the old token and issuing a new one.

**Request Body:**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "30d"
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `MISSING_TOKEN` | Token is required in request body |
| 400 | `INVALID_TOKEN` | Token is invalid or malformed |
| 401 | `EXPIRED_TOKEN` | Token has expired |
| 404 | `USER_NOT_FOUND` | User no longer exists |
| 403 | `WHITELIST_REVOKED` | User whitelist access has been revoked |
| 500 | `INTERNAL_ERROR` | Server error |

**Example:**
```bash
curl -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/json" \
  -d '{"token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."}'
```

### Get Public Key (JWKS)

**Endpoint:** `GET /api/jwks`

**Description:** Get the RSA public key in PEM format for JWT verification.

**Response:** Plain text PEM key
```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----
```

**Example:**
```bash
curl http://localhost:3000/api/jwks
```

### Get JWKS JSON

**Endpoint:** `GET /.well-known/jwks.json`

**Description:** Standard JWKS endpoint with simplified response.

**Response:**
```json
{
  "note": "Simplified JWKS response. For JWT verification, use the public key in PEM format from the publicKeyPEM field or /api/jwks endpoint.",
  "publicKeyEndpoint": "/api/jwks",
  "algorithm": "RS256",
  "publicKeyPEM": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "default"
    }
  ]
}
```

## Service Registry API

### Retrieve GitHub Token (Service-to-Service)

**Endpoint:** `POST /api/github-token`

**Description:** Authorized services can retrieve a user's GitHub access token.

**Authentication:** Required via service credentials

**Request Headers:**
```http
Authorization: Bearer <serviceIdentifier>:<apiKey>
Content-Type: application/json
```

Or using Basic Auth:
```http
Authorization: Basic <base64(serviceIdentifier:apiKey)>
Content-Type: application/json
```

**Request Body (Option 1: User UUID):**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Request Body (Option 2: GitHub User ID):**
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
| 403 | `USER_NOT_WHITELISTED` | User is not whitelisted for access |
| 404 | `TOKEN_NOT_AVAILABLE` | User has no GitHub access token stored |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

**Security Features:**
- Service credentials are hashed (bcrypt) in database
- All access attempts are logged (service ID and user ID only)
- Tokens are never logged
- Service can be deactivated without deletion

**Example (cURL with Bearer):**
```bash
curl -X POST http://localhost:3000/api/github-token \
  -H "Authorization: Bearer my-service:3f7a4b2c9d1e8f6a5b3c7d9e1f2a4b6c8d0e1f3a5b7c9d1e3f5a7b9c1d3e5f7a" \
  -H "Content-Type: application/json" \
  -d '{"userId": "550e8400-e29b-41d4-a716-446655440000"}'
```

**Example (cURL with Basic Auth):**
```bash
# First, encode credentials: echo -n "my-service:apiKey" | base64
curl -X POST http://localhost:3000/api/github-token \
  -H "Authorization: Basic bXktc2VydmljZTphcGlLZXk=" \
  -H "Content-Type: application/json" \
  -d '{"githubUserId": "12345678"}'
```

**Example (Node.js):**
```javascript
const axios = require('axios');

async function getGitHubToken(userId) {
  const serviceId = process.env.SERVICE_IDENTIFIER;
  const apiKey = process.env.SERVICE_API_KEY;
  
  try {
    const response = await axios.post(
      'http://localhost:3000/api/github-token',
      { userId },
      {
        headers: {
          'Authorization': `Bearer ${serviceId}:${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return {
      token: response.data.token,
      expiresAt: new Date(response.data.expiresAt),
      user: response.data.user
    };
  } catch (error) {
    if (error.response) {
      console.error('Error:', error.response.data.error);
      console.error('Message:', error.response.data.message);
    }
    throw error;
  }
}

// Usage
getGitHubToken('550e8400-e29b-41d4-a716-446655440000')
  .then(data => console.log('Token retrieved:', data))
  .catch(err => console.error('Failed:', err));
```

**Example (Python):**
```python
import requests
import os

def get_github_token(user_id):
    service_id = os.environ.get('SERVICE_IDENTIFIER')
    api_key = os.environ.get('SERVICE_API_KEY')
    
    response = requests.post(
        'http://localhost:3000/api/github-token',
        json={'userId': user_id},
        headers={
            'Authorization': f'Bearer {service_id}:{api_key}',
            'Content-Type': 'application/json'
        }
    )
    
    if response.status_code == 200:
        return response.json()
    else:
        error_data = response.json()
        raise Exception(f"{error_data['error']}: {error_data['message']}")

# Usage
try:
    data = get_github_token('550e8400-e29b-41d4-a716-446655440000')
    print(f"Token: {data['token']}")
    print(f"Expires: {data['expiresAt']}")
except Exception as e:
    print(f"Error: {e}")
```

**Rate Limiting:**
- Currently no rate limiting is enforced
- Recommended: Implement 1000 requests/hour per service in production
- Monitor audit logs for unusual access patterns

**Audit Logging:**
All access attempts are logged to `service_audit_logs` table with:
- Service ID
- User ID
- Action performed
- Success/failure status
- Error message (if failed)
- IP address
- User agent
- Timestamp

**What is NOT logged:**
- Service API keys
- GitHub access tokens
- Any other sensitive credentials

For detailed service registry management, see [Service Registry Documentation](./service-registry.md).

## Common Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Authentication required or failed |
| `MISSING_TOKEN` | 400 | Token required in request |
| `INVALID_TOKEN` | 400 | Token is malformed or invalid |
| `EXPIRED_TOKEN` | 401 | Token has expired |
| `USER_NOT_FOUND` | 404 | User does not exist |
| `WHITELIST_REVOKED` | 403 | User access has been revoked |
| `MISSING_USER_ID` | 400 | User ID required |
| `MISSING_USER_IDENTIFIER` | 400 | User identifier required |
| `USER_NOT_WHITELISTED` | 403 | User is not whitelisted |
| `TOKEN_NOT_AVAILABLE` | 404 | GitHub token not available |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Security Considerations

### Service Authentication

- **Never commit service API keys** to version control
- **Store keys securely** in environment variables or secret managers
- **Rotate keys regularly** (quarterly recommended)
- **Use separate keys** for development and production
- **Monitor audit logs** for suspicious activity

### Token Handling

- GitHub access tokens are **never logged**
- Tokens are returned **only to authenticated services**
- All access attempts are **audited**
- Tokens should be **transmitted over HTTPS only** in production

### Best Practices

1. **Use environment variables** for all secrets
2. **Enable HTTPS** in production
3. **Implement rate limiting** per service
4. **Monitor audit logs** regularly
5. **Set up alerts** for unusual patterns
6. **Rotate credentials** on schedule
7. **Review and deactivate** unused services

## Versioning

Current API Version: **1.0.0**

The API follows semantic versioning. Breaking changes will be announced and documented.

## Support

For API issues or questions:
- Review error response messages
- Check audit logs for detailed access information
- Consult [Service Registry Documentation](./service-registry.md)
- Contact administrator at configured admin email

---

**Related Documentation:**
- [Service Registry Guide](./service-registry.md)
- [Database Schema](./database.md)
- [GitHub OAuth Setup](./github-app-setup.md)
- [JWT Configuration](./jwt.md)
