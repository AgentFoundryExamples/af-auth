# GitHub App Setup Guide

This guide walks you through creating and configuring a GitHub App for OAuth authentication with AF Auth.

## Overview

AF Auth uses GitHub App OAuth flow to authenticate users with multi-instance support via Redis-backed state storage. This setup is compatible with Cloud Run autoscaling and Kubernetes deployments.

## Prerequisites

- GitHub account with permission to create apps (organization or personal)
- AF Auth service deployed or running locally
- Redis instance (for production multi-instance deployments)
- Access to configure environment variables

## Creating a GitHub App

### GitHub App (Required for Production)

GitHub Apps provide granular permissions, better security, and support for OAuth flows.

1. **Navigate to GitHub App Settings**
   - For personal account: Go to [Settings > Developer settings > GitHub Apps](https://github.com/settings/apps)
   - For organization: Go to Organization Settings > Developer settings > GitHub Apps
   - Click **New GitHub App**

2. **Configure Basic Information**
   - **GitHub App name**: `AF Auth` (or your preferred name)
   - **Homepage URL**: Your service URL (e.g., `https://auth.example.com`)
   - **Callback URL**: `https://auth.example.com/auth/github/callback`
     - For local development: `http://localhost:3000/auth/github/callback`
     - You can add multiple callback URLs for different environments
   
3. **Configure Permissions**
   
   Under **Account permissions**, set:
   - **Email addresses**: Read-only
   
   These minimal permissions allow the app to read the user's email address, which is used for identification.

4. **Webhook Configuration**
   - **Active**: Uncheck (not needed for OAuth flow)

5. **Where can this GitHub App be installed?**
   - Select **Any account** to allow any GitHub user to authenticate
   - Or select **Only on this account** to restrict to your organization

6. **Create the App**
   - Click **Create GitHub App**

7. **Generate Client Secret**
   - After creation, scroll to **Client secrets**
   - Click **Generate a new client secret**
   - **Important**: Copy this secret immediately - you won't be able to see it again!

8. **Generate Private Key**
   - Scroll to **Private keys** section
   - Click **Generate a private key**
   - A `.pem` file will be downloaded automatically
   - **Important**: Store this file securely - it's needed for authentication

9. **Note Your Credentials**
   - **App ID**: Found at the top of the app settings page (e.g., `123456`)
   - **Client ID**: Found in the app settings page (e.g., `Iv1.a1b2c3d4e5f6g7h8`)
   - **Client Secret**: The secret you generated in step 7
   - **Private Key**: The `.pem` file you downloaded in step 8

10. **Install the App**
    - Click **Install App** in the left sidebar
    - Select the account where you want to install the app
    - Choose **All repositories** or **Only select repositories**
    - Click **Install**
    - After installation, note the **Installation ID** from the URL:
      - URL format: `https://github.com/settings/installations/12345678`
      - The number at the end is your Installation ID

## Configuring AF Auth

### Environment Variables

Add the following environment variables to your `.env` file or deployment configuration:

```bash
# GitHub App Configuration
GITHUB_APP_ID=123456
GITHUB_INSTALLATION_ID=12345678
GITHUB_APP_PRIVATE_KEY=base64_encoded_private_key_here
GITHUB_CLIENT_ID=Iv1.a1b2c3d4e5f6g7h8
GITHUB_CLIENT_SECRET=your_client_secret_here
GITHUB_CALLBACK_URL=https://auth.example.com/auth/github/callback

# Redis Configuration (Required for multi-instance deployments)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_here
REDIS_DB=0
REDIS_STATE_TTL_SECONDS=600

# Session Configuration
SESSION_SECRET=generate_a_random_32_character_string_here
SESSION_MAX_AGE_MS=600000

# UI Configuration
ADMIN_CONTACT_EMAIL=admin@example.com
ADMIN_CONTACT_NAME=System Administrator
```

### Required Secrets

| Variable | Description | Example |
|----------|-------------|---------|
| `GITHUB_APP_ID` | GitHub App ID | `123456` |
| `GITHUB_INSTALLATION_ID` | Installation ID after installing the app | `12345678` |
| `GITHUB_APP_PRIVATE_KEY` | Base64-encoded private key (PEM format) | See encoding instructions below |
| `GITHUB_CLIENT_ID` | GitHub App Client ID | `Iv1.a1b2c3d4e5f6g7h8` |
| `GITHUB_CLIENT_SECRET` | GitHub App Client Secret | `1234567890abcdef...` |
| `GITHUB_CALLBACK_URL` | OAuth callback URL (must match GitHub App config) | `https://auth.example.com/auth/github/callback` |
| `REDIS_HOST` | Redis server hostname | `localhost` or Cloud Memorystore IP |
| `REDIS_PORT` | Redis server port | `6379` |
| `REDIS_PASSWORD` | Redis authentication password | Optional for local dev |
| `SESSION_SECRET` | Secret for CSRF token generation (min 32 chars) | Use `openssl rand -hex 32` |
| `SESSION_MAX_AGE_MS` | Session state validity in milliseconds | `600000` (10 minutes) |

### Encoding the Private Key

The GitHub App private key must be base64-encoded for secure transmission via environment variables:

```bash
# Linux
base64 -w 0 < your-app-name.2024-12-12.private-key.pem

# macOS
base64 -i your-app-name.2024-12-12.private-key.pem -o -

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("your-app-name.2024-12-12.private-key.pem"))
```

Copy the output and set it as the `GITHUB_APP_PRIVATE_KEY` environment variable.

### Generating Strong Secrets

Use these commands to generate cryptographically secure secrets:

```bash
# Generate SESSION_SECRET (64 character hex string)
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Callback URL Configuration

The callback URL is where GitHub redirects users after authentication.

### Development

For local development:
```
http://localhost:3000/auth/github/callback
```

### Production

For production deployment:
```
https://your-domain.com/auth/github/callback
```

### Multiple Environments

You can configure multiple callback URLs in your GitHub App settings to support development, staging, and production environments simultaneously.

## Security Best Practices

### Protecting Secrets

1. **Never commit secrets to version control**
   - The `.env` file is in `.gitignore` by default
   - Use secret management systems (Google Secret Manager, AWS Secrets Manager, etc.)

2. **Rotate secrets regularly**
   - Generate new client secrets periodically
   - Update `SESSION_SECRET` on a regular schedule

3. **Use different apps for different environments**
   - Create separate GitHub Apps for development, staging, and production
   - This isolates credentials and reduces risk

### Secret Management in Production

#### Google Cloud Run (Recommended)

```bash
# Store secrets in Secret Manager
echo -n "123456" | gcloud secrets create github-app-id --data-file=-
echo -n "12345678" | gcloud secrets create github-installation-id --data-file=-
base64 -w 0 < private-key.pem | gcloud secrets create github-app-private-key --data-file=-
echo -n "Iv1.a1b2c3d4e5f6g7h8" | gcloud secrets create github-client-id --data-file=-
echo -n "your_client_secret" | gcloud secrets create github-client-secret --data-file=-
echo -n "your_session_secret" | gcloud secrets create session-secret --data-file=-
echo -n "your_redis_password" | gcloud secrets create redis-password --data-file=-

# Grant Cloud Run access to secrets
for secret in github-app-id github-installation-id github-app-private-key github-client-id github-client-secret session-secret redis-password; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:your-project@appspot.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done

# Deploy with secrets
gcloud run deploy af-auth \
  --image gcr.io/your-project/af-auth \
  --update-secrets GITHUB_APP_ID=github-app-id:latest \
  --update-secrets GITHUB_INSTALLATION_ID=github-installation-id:latest \
  --update-secrets GITHUB_APP_PRIVATE_KEY=github-app-private-key:latest \
  --update-secrets GITHUB_CLIENT_ID=github-client-id:latest \
  --update-secrets GITHUB_CLIENT_SECRET=github-client-secret:latest \
  --update-secrets SESSION_SECRET=session-secret:latest \
  --update-secrets REDIS_PASSWORD=redis-password:latest
```

## Production Deployment Considerations

### Redis for Multi-Instance Deployments

**Required for Production**: AF Auth now uses Redis for distributed OAuth state storage, which is essential for multi-instance deployments.

**Benefits**:
- ✅ Works correctly with Cloud Run auto-scaling
- ✅ Works with Kubernetes horizontal pod autoscaling
- ✅ Works with load-balanced deployments
- ✅ Atomic state validation prevents race conditions
- ✅ Automatic TTL-based expiration

**Setup Required**:
- Deploy Redis instance (Cloud Memorystore, ElastiCache, or self-hosted)
- Configure VPC connector for Cloud Run to access Redis
- Set Redis environment variables in deployment configuration

See `docs/deployment/cloud-run.md` for detailed Redis setup instructions.

### Rate Limiting (Recommended)

**Consideration**: OAuth endpoints (`/auth/github` and `/auth/github/callback`) should have rate limiting in production to prevent abuse.

**Impact**: Attackers could:
- Exhaust OAuth state storage
- Cause denial of service
- Attempt to enumerate valid callback codes

**Solution Required**: Add rate limiting middleware:

```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

// Apply to auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/auth', authLimiter, authRoutes);
```

### Token Storage Security

**Current Implementation**: GitHub access tokens and refresh tokens are encrypted at rest using AES-256-GCM before storing in the PostgreSQL database.

**Security Features**:
- ✅ AES-256-GCM encryption with authentication tags
- ✅ Unique IV (initialization vector) per encryption
- ✅ GITHUB_TOKEN_ENCRYPTION_KEY environment variable (min 32 chars)
- ✅ Token migration script for upgrading plaintext tokens

**Configuration**:
```bash
# Generate encryption key (64 characters recommended)
openssl rand -hex 32

# Set in environment
GITHUB_TOKEN_ENCRYPTION_KEY=your_64_character_hex_string_here
```

See `docs/security.md` for encryption implementation details and key rotation procedures.

### Development vs Production Configuration

**Production-Ready Features**:
- ✅ Multi-instance deployments with auto-scaling (via Redis)
- ✅ Kubernetes with horizontal pod autoscaling
- ✅ Load-balanced deployments
- ✅ High-traffic production applications
- ✅ OAuth state persistence across instances
- ✅ Atomic state validation (no race conditions)

**Recommended for Production**:
- Configure Redis with high availability (replica sets)
- Enable Redis persistence (AOF or RDB)
- Set up monitoring for Redis connection health
- Configure rate limiting on auth endpoints
- Use separate GitHub Apps for dev, staging, and production

### Implementation Checklist

1. **Critical** (required for multi-instance): Distributed state storage
2. **High** (security): Rate limiting on auth endpoints
3. **Medium** (security): Token encryption at rest
4. **Low** (enhancement): Session persistence, token refresh flow

## Testing the Setup

### 1. Start the Service

```bash
npm run dev
```

### 2. Access the Login Page

Navigate to:
```
http://localhost:3000/auth/github
```

You should see the login page with a "Sign in with GitHub" button.

### 3. Complete OAuth Flow

1. Click "Sign in with GitHub"
2. GitHub will ask you to authorize the app
3. After authorization, you'll be redirected to:
   - **Unauthorized page** if you're not whitelisted (default for new users)
   - **Token Ready page** if you're whitelisted

### 4. Verify Database Entry

Check that a user record was created:

```bash
npm run db:studio
```

Navigate to the `users` table and verify:
- `github_user_id` matches your GitHub user ID
- `github_access_token` is populated
- `is_whitelisted` is `false` for new users

## Whitelisting Users

New users are created with `is_whitelisted=false` by default. To grant access:

### Using Prisma Studio

1. Open Prisma Studio:
   ```bash
   npm run db:studio
   ```

2. Navigate to the `users` table
3. Find the user by `github_user_id`
4. Change `is_whitelisted` to `true`
5. Save the change

### Using SQL

```sql
-- Whitelist a user by GitHub user ID
UPDATE users 
SET is_whitelisted = true 
WHERE github_user_id = 12345678;

-- Verify the change
SELECT id, github_user_id, is_whitelisted 
FROM users 
WHERE github_user_id = 12345678;
```

### Using Prisma Client (Programmatically)

```typescript
import { prisma } from './src/db';

async function whitelistUser(githubUserId: number) {
  const user = await prisma.user.update({
    where: { githubUserId: BigInt(githubUserId) },
    data: { isWhitelisted: true },
  });
  
  console.log(`User ${user.id} has been whitelisted`);
}

whitelistUser(12345678);
```

## Troubleshooting

### "Missing required environment variable: GITHUB_CLIENT_ID"

**Cause**: Environment variables not loaded

**Solution**: 
- Verify `.env` file exists in project root
- Check that all required variables are set
- Restart the application after changing `.env`

### "Invalid or expired authentication session"

**Cause**: OAuth state token expired or invalid

**Solution**:
- State tokens expire after `SESSION_MAX_AGE_MS` (default 10 minutes)
- Start a new authentication flow from `/auth/github`
- For development, increase `SESSION_MAX_AGE_MS` if needed

### "Failed to exchange authorization code for token"

**Cause**: Invalid client credentials or callback URL mismatch

**Solution**:
- Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are correct
- Ensure `GITHUB_CALLBACK_URL` exactly matches the URL configured in GitHub App
- Check that the callback URL includes the correct protocol (`http://` or `https://`)

### Callback URL Mismatch

**Error**: `The redirect_uri MUST match the registered callback URL for this application.`

**Solution**:
- The callback URL in your `.env` must exactly match the URL in GitHub App settings
- Common issues:
  - Missing trailing slash
  - HTTP vs HTTPS mismatch
  - Port number mismatch
  - Different domain/subdomain

## GitHub App Permissions

AF Auth uses minimal permissions for security. The GitHub App requires:

- **Email addresses**: Read-only access to retrieve authenticated user's email

### Why These Permissions?

- **Email addresses**: Required to retrieve the authenticated user's email address for identification and communication

No scope parameter is sent in the OAuth authorization URL as GitHub Apps use installation-based permissions instead of scope-based OAuth.

## Monitoring and Logging

AF Auth logs all authentication events with structured logging:

- OAuth flow initiation
- Redis state generation and validation
- Token exchange
- User creation/update
- Whitelist checks
- Redis connection health

### Viewing Logs

```bash
# Local development
npm run dev

# Production (Google Cloud Run)
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=af-auth"
```

### Key Log Fields

- `githubUserId` - GitHub user ID
- `userId` - Internal user UUID
- `isWhitelisted` - Whitelist status
- `requestId` - Request correlation ID for tracking OAuth flows
- `operation` - Redis operation name
- `durationMs` - Operation duration for performance monitoring

**Note**: Access tokens, secrets, and PII are automatically redacted from logs.

### Redis Monitoring

Monitor Redis health for production deployments:

```bash
# Check Redis connection status
GET /health  # Returns Redis status in health check

# Monitor Redis metrics in Cloud Monitoring (GCP)
gcloud monitoring dashboards create --config-from-file=redis-dashboard.yaml
```

## References

- [GitHub Apps Documentation](https://docs.github.com/en/apps)
- [GitHub App OAuth Flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Redis Best Practices](https://redis.io/docs/management/optimization/)
- [Cloud Memorystore Documentation](https://cloud.google.com/memorystore/docs/redis)
- [AF Auth Architecture](../README.md)
