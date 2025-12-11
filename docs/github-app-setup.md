# GitHub App Setup Guide

This guide walks you through creating and configuring a GitHub App for OAuth authentication with AF Auth.

## Overview

AF Auth uses GitHub OAuth 2.0 to authenticate users. You'll need to create a GitHub App (or OAuth App) and configure it with the appropriate permissions and callback URLs.

## Prerequisites

- GitHub account with permission to create apps (organization or personal)
- AF Auth service deployed or running locally
- Access to configure environment variables

## Creating a GitHub App

### Option 1: GitHub App (Recommended)

GitHub Apps provide more granular permissions and better security than OAuth Apps.

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

8. **Note Your Credentials**
   - **Client ID**: Found at the top of the app settings page
   - **Client Secret**: The secret you just generated

### Option 2: OAuth App (Alternative)

If you prefer a simpler setup, you can use an OAuth App instead.

1. **Navigate to OAuth App Settings**
   - Go to [Settings > Developer settings > OAuth Apps](https://github.com/settings/developers)
   - Click **New OAuth App**

2. **Configure the OAuth App**
   - **Application name**: `AF Auth`
   - **Homepage URL**: Your service URL
   - **Authorization callback URL**: `https://auth.example.com/auth/github/callback`
   - Click **Register application**

3. **Generate Client Secret**
   - Click **Generate a new client secret**
   - Copy the secret immediately

4. **Note Your Credentials**
   - **Client ID**: Displayed on the app page
   - **Client Secret**: The secret you just generated

## Configuring AF Auth

### Environment Variables

Add the following environment variables to your `.env` file or deployment configuration:

```bash
# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
GITHUB_CALLBACK_URL=https://auth.example.com/auth/github/callback

# Session Configuration (for CSRF protection)
SESSION_SECRET=generate_a_random_32_character_string_here
SESSION_MAX_AGE_MS=600000

# UI Configuration
ADMIN_CONTACT_EMAIL=admin@example.com
ADMIN_CONTACT_NAME=System Administrator
```

### Required Secrets

| Variable | Description | Example |
|----------|-------------|---------|
| `GITHUB_CLIENT_ID` | GitHub App/OAuth App Client ID | `Iv1.a1b2c3d4e5f6g7h8` |
| `GITHUB_CLIENT_SECRET` | GitHub App/OAuth App Client Secret | `1234567890abcdef...` |
| `GITHUB_CALLBACK_URL` | OAuth callback URL (must match GitHub App config) | `https://auth.example.com/auth/github/callback` |
| `SESSION_SECRET` | Secret for CSRF token generation (min 32 chars) | Use `openssl rand -hex 32` to generate |
| `SESSION_MAX_AGE_MS` | Session state validity in milliseconds | `600000` (10 minutes) |

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
echo -n "your_client_id" | gcloud secrets create github-client-id --data-file=-
echo -n "your_client_secret" | gcloud secrets create github-client-secret --data-file=-
echo -n "your_session_secret" | gcloud secrets create session-secret --data-file=-

# Grant Cloud Run access to secrets
gcloud secrets add-iam-policy-binding github-client-id \
  --member="serviceAccount:your-project@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Deploy with secrets
gcloud run deploy af-auth \
  --image gcr.io/your-project/af-auth \
  --update-secrets GITHUB_CLIENT_ID=github-client-id:latest \
  --update-secrets GITHUB_CLIENT_SECRET=github-client-secret:latest \
  --update-secrets SESSION_SECRET=session-secret:latest
```

## Production Deployment Considerations

> **⚠️ IMPORTANT**: The current implementation has known limitations for production multi-instance deployments. Review and address these before deploying to production with auto-scaling or multiple instances.

### 1. OAuth State Storage (Multi-Instance Issue)

**Issue**: OAuth state tokens are stored in an in-memory Map, which does NOT work correctly with multiple service instances (Cloud Run auto-scaling, Kubernetes replicas, load-balanced deployments).

**Impact**: When a user initiates OAuth on instance A but the callback is handled by instance B, the state token won't be found, causing authentication failures.

**Solution Required**: Replace the in-memory Map with a distributed cache:

```typescript
// Example: Redis implementation for state storage
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });

// Store state with TTL
async function generateState(): Promise<string> {
  const state = crypto.randomBytes(32).toString('hex');
  await redis.setex(
    `oauth:state:${state}`, 
    config.session.maxAge / 1000, 
    Date.now().toString()
  );
  return state;
}

// Validate and consume state (atomic operation)
async function validateState(state: string): Promise<boolean> {
  const timestamp = await redis.getdel(`oauth:state:${state}`);
  if (!timestamp) return false;
  
  const age = Date.now() - parseInt(timestamp);
  return age <= config.session.maxAge;
}
```

**Alternative Solutions**:
- Google Cloud Memorystore (Redis-compatible)
- AWS ElastiCache
- Memcached with appropriate TTL

### 2. Rate Limiting

**Issue**: OAuth endpoints (`/auth/github` and `/auth/github/callback`) lack rate limiting, making them vulnerable to abuse.

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

### 3. Token Storage Encryption

**Issue**: GitHub access tokens and refresh tokens are stored in plaintext in the PostgreSQL database.

**Impact**: If database access is compromised, tokens can be used to access user GitHub accounts.

**Solution Recommended**: Implement encryption at rest:

```typescript
import crypto from 'crypto';

// Encryption configuration
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes
const ALGORITHM = 'aes-256-gcm';

function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  // Store: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decryptToken(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

**Database Migration Required**:
```sql
-- Add encrypted columns
ALTER TABLE users ADD COLUMN github_access_token_encrypted TEXT;
ALTER TABLE users ADD COLUMN github_refresh_token_encrypted TEXT;

-- Migrate existing data
-- DROP old columns after migration
```

### 4. Development vs Production Configuration

For development and single-instance deployments, the current implementation is sufficient. For production:

**Minimum Requirements**:
- ✅ Single instance deployment (e.g., Cloud Run with min/max instances set to 1)
- ✅ Development/testing environments
- ✅ Low-traffic applications

**Requires Updates**:
- ❌ Multi-instance deployments with auto-scaling
- ❌ Kubernetes with horizontal pod autoscaling
- ❌ Load-balanced deployments
- ❌ High-traffic production applications

### Implementation Priority

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

## OAuth Scopes

AF Auth requests minimal scopes for security:

- `user:email` - Read user email addresses

### Why These Scopes?

- **user:email**: Required to retrieve the authenticated user's email address for identification and communication

### Adding Additional Scopes

If you need additional GitHub data, modify the scope in `src/services/github-oauth.ts`:

```typescript
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    state,
    scope: 'user:email read:user', // Add additional scopes here
  });
  // ...
}
```

See [GitHub's OAuth scopes documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps) for available scopes.

## Monitoring and Logging

AF Auth logs all authentication events:

- OAuth flow initiation
- State generation and validation
- Token exchange
- User creation/update
- Whitelist checks

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
- `state` - OAuth state token (for debugging)

**Note**: Access tokens and secrets are automatically redacted from logs.

## References

- [GitHub Apps Documentation](https://docs.github.com/en/apps)
- [GitHub OAuth Apps Documentation](https://docs.github.com/en/apps/oauth-apps)
- [OAuth 2.0 Specification](https://oauth.net/2/)
- [AF Auth Architecture](../README.md)
