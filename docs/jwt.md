# JWT Authentication Guide

This guide explains how to use JWT (JSON Web Tokens) for authentication with the AF Auth service.

## Overview

AF Auth issues RS256-signed JWTs with a 30-day validity period. These tokens are used to authenticate API requests and CLI operations.

## Table of Contents

- [JWT Structure](#jwt-structure)
- [Obtaining a JWT](#obtaining-a-jwt)
- [Verifying JWTs](#verifying-jwts)
- [Refreshing Tokens](#refreshing-tokens)
- [CLI Usage](#cli-usage)
- [Key Management](#key-management)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

## JWT Structure

### Header

```json
{
  "alg": "RS256",
  "typ": "JWT"
}
```

### Payload (Claims)

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",  // User UUID (subject)
  "githubId": "12345678",                          // GitHub user ID
  "isWhitelisted": true,                           // Whitelist status at time of issuance
  "iss": "https://auth.example.com",              // Issuer (your auth service URL)
  "aud": "https://auth.example.com",              // Audience (your auth service URL)
  "iat": 1735689600,                              // Issued at (Unix timestamp)
  "exp": 1738281600                               // Expiration (Unix timestamp, 30 days from iat)
}
```

### Claims Explanation

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | string | Internal user UUID - the primary user identifier in the auth system |
| `githubId` | string | GitHub user ID - links token to GitHub account |
| `isWhitelisted` | boolean | Whitelist status when token was issued - used for access control |
| `iss` | string | Issuer - the authentication service that issued the token |
| `aud` | string | Audience - intended recipient(s) of the token |
| `iat` | number | Issued at - Unix timestamp when the token was created |
| `exp` | number | Expiration - Unix timestamp when the token expires |

## Obtaining a JWT

### Method 1: Web Authentication Flow

1. Navigate to `https://auth.example.com/auth/github`
2. Sign in with GitHub
3. If whitelisted, you'll see the token on the success page
4. Copy the token for use in CLI or API requests

### Method 2: API Request (for whitelisted users)

```bash
curl -X GET "https://auth.example.com/api/token?userId=YOUR_USER_ID" \
  -H "Content-Type: application/json"
```

Response:

```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "30d"
}
```

## Verifying JWTs

### Using the Public Key

Download the public key from the service:

```bash
curl https://auth.example.com/api/jwks > jwt-public.pem
```

### Node.js Verification Example

```javascript
const jwt = require('jsonwebtoken');
const fs = require('fs');

const publicKey = fs.readFileSync('jwt-public.pem', 'utf8');

try {
  const decoded = jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: 'https://auth.example.com',
    audience: 'https://auth.example.com',
    clockTolerance: 60  // 60 seconds clock skew tolerance
  });
  
  console.log('Token is valid:', decoded);
  
  // Check whitelist status
  if (!decoded.isWhitelisted) {
    throw new Error('User is not whitelisted');
  }
  
  // Use the token claims
  const userId = decoded.sub;
  const githubId = decoded.githubId;
  
} catch (error) {
  console.error('Token verification failed:', error.message);
}
```

### Python Verification Example

```python
import jwt
import requests

# Download public key
response = requests.get('https://auth.example.com/api/jwks')
public_key = response.text

try:
    decoded = jwt.decode(
        token,
        public_key,
        algorithms=['RS256'],
        issuer='https://auth.example.com',
        audience='https://auth.example.com',
        leeway=60  # 60 seconds clock skew tolerance
    )
    
    print('Token is valid:', decoded)
    
    # Check whitelist status
    if not decoded.get('isWhitelisted'):
        raise Exception('User is not whitelisted')
    
    # Use the token claims
    user_id = decoded['sub']
    github_id = decoded['githubId']
    
except jwt.ExpiredSignatureError:
    print('Token has expired')
except jwt.InvalidTokenError as e:
    print('Token verification failed:', str(e))
```

### Go Verification Example

```go
package main

import (
    "crypto/rsa"
    "encoding/json"
    "fmt"
    "io/ioutil"
    "net/http"
    
    "github.com/golang-jwt/jwt/v5"
)

type Claims struct {
    Sub            string `json:"sub"`
    GitHubID       string `json:"githubId"`
    IsWhitelisted  bool   `json:"isWhitelisted"`
    jwt.RegisteredClaims
}

func getPublicKey() (*rsa.PublicKey, error) {
    resp, err := http.Get("https://auth.example.com/api/jwks")
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    keyData, err := ioutil.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }
    
    return jwt.ParseRSAPublicKeyFromPEM(keyData)
}

func verifyToken(tokenString string) (*Claims, error) {
    publicKey, err := getPublicKey()
    if err != nil {
        return nil, err
    }
    
    token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
        if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
        }
        return publicKey, nil
    }, jwt.WithIssuer("https://auth.example.com"),
       jwt.WithAudience("https://auth.example.com"),
       jwt.WithLeeway(60))  // 60 seconds clock skew tolerance
    
    if err != nil {
        return nil, err
    }
    
    if claims, ok := token.Claims.(*Claims); ok && token.Valid {
        if !claims.IsWhitelisted {
            return nil, fmt.Errorf("user is not whitelisted")
        }
        return claims, nil
    }
    
    return nil, fmt.Errorf("invalid token")
}
```

## Refreshing Tokens

Tokens can be refreshed before they expire to obtain a new 30-day token.

### Refresh Request

```bash
curl -X POST "https://auth.example.com/api/token" \
  -H "Content-Type: application/json" \
  -d '{"token": "YOUR_CURRENT_TOKEN"}'
```

### Success Response

```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "30d"
}
```

### Error Responses

#### Expired Token (401)

```json
{
  "error": "EXPIRED_TOKEN",
  "message": "The provided token has expired. Please authenticate again."
}
```

#### Invalid Token (400)

```json
{
  "error": "INVALID_TOKEN",
  "message": "The provided token is invalid or malformed."
}
```

#### Whitelist Revoked (403)

```json
{
  "error": "WHITELIST_REVOKED",
  "message": "Your access has been revoked. Please contact the administrator."
}
```

#### User Not Found (404)

```json
{
  "error": "USER_NOT_FOUND",
  "message": "User associated with this token no longer exists."
}
```

## CLI Usage

### Setting Up the CLI

Store your JWT token in an environment variable or configuration file:

```bash
# Option 1: Environment variable
export AF_AUTH_TOKEN="your_jwt_token_here"

# Option 2: Config file
echo "YOUR_TOKEN" > ~/.af-auth-token
chmod 600 ~/.af-auth-token
```

### Making Authenticated Requests

```bash
# Using Authorization header
curl -X GET "https://api.example.com/protected-resource" \
  -H "Authorization: Bearer $AF_AUTH_TOKEN"

# Example CLI command (pseudo-code)
af-cli deploy --token $AF_AUTH_TOKEN
```

### Automatic Token Refresh

Implement automatic token refresh in your CLI:

```javascript
async function ensureValidToken() {
  const token = readStoredToken();
  
  try {
    // Verify token locally first
    const decoded = jwt.decode(token);
    const expiresAt = decoded.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    
    // Refresh if token expires in less than 7 days
    if (expiresAt - now < 7 * 24 * 60 * 60 * 1000) {
      const response = await fetch('https://auth.example.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        saveToken(data.token);
        return data.token;
      } else {
        throw new Error('Token refresh failed: ' + data.message);
      }
    }
    
    return token;
  } catch (error) {
    console.error('Token validation failed:', error.message);
    throw new Error('Please re-authenticate: af-cli login');
  }
}
```

## Key Management

### Key Rotation

To rotate signing keys:

1. **Generate new key pair:**

   ```bash
   openssl genrsa -out jwt-private-v2.pem 2048
   openssl rsa -in jwt-private-v2.pem -pubout -out jwt-public-v2.pem
   ```

2. **Deploy new private key to production:**
   - Upload to Google Cloud Secret Manager
   - Update `JWT_PRIVATE_KEY_PATH` environment variable
   - Restart service

3. **Maintain old public key for 30 days:**
   - Keep both public keys accessible via JWKS endpoint
   - Allows existing tokens to be verified until they expire

4. **After 30 days, remove old keys:**
   - Remove old public key from JWKS endpoint
   - Delete old private key from Secret Manager

### Key Storage

**Development:**
- Store keys in `src/config/keys/` directory
- Add `jwt-private*.pem` to `.gitignore`
- Never commit private keys to version control

**Production:**
- Use Google Cloud Secret Manager or AWS Secrets Manager
- Mount secrets as files or environment variables
- Restrict IAM access to service accounts only
- Enable secret rotation and versioning
- Monitor secret access logs

### Environment Variables

```bash
# Key file paths (recommended for production)
JWT_PRIVATE_KEY_PATH=/secrets/jwt-private.pem
JWT_PUBLIC_KEY_PATH=/secrets/jwt-public.pem

# JWT configuration
JWT_EXPIRES_IN=30d
JWT_ISSUER=https://auth.example.com
JWT_AUDIENCE=https://auth.example.com
JWT_CLOCK_TOLERANCE_SECONDS=60
```

## Security Best Practices

### Token Security

1. **Never log or display tokens in plain text**
   - Redact tokens in logs
   - Use `[REDACTED]` in error messages
   - Don't expose tokens in URLs

2. **Store tokens securely**
   - Use secure storage mechanisms (OS keychain, encrypted files)
   - Set restrictive file permissions (600)
   - Clear tokens on logout

3. **Validate all token claims**
   - Check `isWhitelisted` status
   - Verify `iss` and `aud` match expected values
   - Handle expired tokens gracefully

4. **Use HTTPS exclusively**
   - Never send tokens over unencrypted connections
   - Validate SSL certificates
   - Use certificate pinning for high-security scenarios

### Whitelist Revocation

When a user's whitelist status is revoked:

- Existing tokens remain valid until expiration (30 days)
- Refresh attempts will fail with `WHITELIST_REVOKED` error
- User must contact administrator for re-whitelisting

**To immediately revoke access:**
- Implement a token blacklist/revocation list
- Check revocation status during each request
- Store revoked token IDs in Redis with TTL matching token expiry

### Clock Skew Tolerance

The system tolerates 60 seconds of clock skew by default. This prevents:

- Tokens being rejected due to minor time differences
- Issues with servers in different time zones
- Problems during NTP synchronization

Configure via `JWT_CLOCK_TOLERANCE_SECONDS` environment variable.

## Troubleshooting

### Token Verification Fails

**Issue:** "Invalid signature" error

**Solution:**
- Ensure you're using the correct public key
- Download the latest public key from `/api/jwks`
- Verify the algorithm is RS256, not HS256

### Token Expired

**Issue:** "Token has expired" error

**Solution:**
- Request a token refresh via `POST /api/token`
- If refresh fails, re-authenticate via web flow
- Check system clock is synchronized

### Whitelist Revoked

**Issue:** "Your access has been revoked" error

**Solution:**
- Contact the system administrator
- Provide your GitHub username and user ID
- Wait for whitelist status to be restored

### Clock Skew Issues

**Issue:** Tokens rejected as "not yet valid" or "expired" prematurely

**Solution:**
- Ensure server clocks are synchronized via NTP
- Increase `JWT_CLOCK_TOLERANCE_SECONDS` if needed
- Check for significant time zone misconfigurations

### Public Key Not Found

**Issue:** Cannot retrieve public key from `/api/jwks`

**Solution:**
- Verify the auth service is running
- Check network connectivity
- Ensure firewall rules allow access
- Download and cache the public key

## API Reference

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/token` | GET | Issue new JWT for authenticated user |
| `/api/token` | POST | Refresh existing JWT |
| `/api/jwks` | GET | Get public key in PEM format |
| `/.well-known/jwks.json` | GET | Get JWKS with public key |

### Query Parameters

#### GET /api/token

- `userId` (required, string): User UUID to generate token for

### Request Body

#### POST /api/token

```json
{
  "token": "string (required) - Current JWT to refresh"
}
```

### Response Format

#### Success Response

```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "30d"
}
```

#### Error Response

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error description"
}
```

## Additional Resources

- [JWT.io](https://jwt.io/) - JWT debugger and information
- [RFC 7519](https://tools.ietf.org/html/rfc7519) - JSON Web Token specification
- [RFC 7517](https://tools.ietf.org/html/rfc7517) - JSON Web Key (JWK) specification
- [OWASP JWT Security](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html) - Security best practices
