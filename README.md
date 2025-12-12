# AF Auth - Authentication Service

**Version 1.1.0** - A production-ready TypeScript Node.js authentication service with GitHub OAuth, JWT tokens, service registry, and comprehensive deployment guides.

> **Latest Release**: See [CHANGELOG.md](./CHANGELOG.md) for v1.1.0 release notes  
> **Roadmap**: See [docs/ROADMAP.md](./docs/ROADMAP.md) for planned features and future iterations

## Features

### Core Authentication
- 🔐 **GitHub OAuth 2.0** - Complete OAuth flow with state-based CSRF protection and one-time use validation
- 👥 **Whitelist-Based Access** - Default-deny security model with database-backed whitelist
- 🎟️ **JWT Token System** - RS256-signed tokens with configurable expiration (default 30 days) and refresh flow
- 🔄 **Token Refresh** - `POST /api/token` endpoint for refreshing expired JWTs
- 🔑 **Public Key Distribution** - JWKS endpoint (`GET /api/jwks`) for downstream JWT verification

### Service Integration
- 🏢 **Service Registry** - Secure API for downstream services to access user GitHub tokens
- 🔐 **Service Authentication** - Bcrypt-hashed API keys with Basic auth scheme
- 📊 **Audit Logging** - Comprehensive access tracking without exposing sensitive data
- 🛠️ **Management CLI** - TypeScript-based CLI for service and whitelist management

### Infrastructure
- 🗄️ **PostgreSQL Database** - Prisma ORM with idempotent migrations and connection resilience
- 🔴 **Redis Integration** - Distributed OAuth state storage for multi-instance deployments
- 📝 **Structured Logging** - Pino logger with automatic sensitive data redaction
- 📊 **Prometheus Metrics** - Comprehensive metrics for monitoring OAuth, JWT, rate limits, and performance
- ✅ **Health Checks** - Kubernetes/Cloud Run compatible endpoints (`/health`, `/ready`, `/live`) with component status
- 🚀 **Cloud Run Ready** - Complete deployment guide with Secret Manager and VPC networking
- 🎨 **SSR Pages** - React-based server-side rendered authentication pages
- 🧪 **Comprehensive Testing** - 104+ tests covering OAuth, JWT, service registry, and more

### Security
- 🔒 **Secret Management** - Google Secret Manager integration with zero-downtime rotation
- 🔐 **RS256 JWT Signing** - Asymmetric cryptography with private key protection
- 🔑 **Key Rotation Tracking** - Automated monitoring and warnings for overdue key rotations (JWT, encryption, service API keys)
- 🛡️ **Security Headers** - Comprehensive HTTP security headers (CSP, HSTS, X-Frame-Options, etc.)
- 📋 **Security Documentation** - Complete guides for secret rotation, JWT verification, and incident response
- 🛡️ **Encryption** - TLS in transit, AES-256-GCM for GitHub tokens, bcrypt for API keys
- 🚦 **Rate Limiting** - Redis-backed rate limiting for authentication and API endpoints

## Quick Start

### Prerequisites

- Node.js 18 or higher
- PostgreSQL 14 or higher
- GitHub account (for creating OAuth app)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/AgentFoundryExamples/af-auth.git
   cd af-auth
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration (see below)
   ```

4. Create a GitHub OAuth App:
   - Follow the [GitHub App Setup Guide](./docs/github-app-setup.md)
   - Add the credentials to your `.env` file

5. Start PostgreSQL (using Docker):
   ```bash
   docker run --name af-auth-postgres \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_DB=af_auth \
     -p 5432:5432 \
     -d postgres:16-alpine
   ```

6. Run database migrations:
   ```bash
   npm run db:generate
   npm run db:migrate:dev
   ```

7. Start the development server:
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3000`

### Configuration

Edit `.env` with your credentials:

```bash
# Required Configuration
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
SESSION_SECRET=generate_using_openssl_rand_hex_32

# Optional Configuration
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback
BASE_URL=http://localhost:3000
ADMIN_CONTACT_EMAIL=admin@example.com
ADMIN_CONTACT_NAME=Administrator
```

See [GitHub App Setup Guide](./docs/github-app-setup.md) for detailed setup instructions.

### Testing the OAuth Flow

1. Navigate to the login page:
   ```bash
   open http://localhost:3000/auth/github
   ```

2. Click "Sign in with GitHub" and authorize the app

3. New users will see the "Unauthorized" page (default)

4. Whitelist yourself in the database:
   ```bash
   npm run db:studio
   # Navigate to users table, set is_whitelisted = true
   ```

5. Sign in again to see the "Token Ready" page

### Health Check

Test the service is running:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 42.5,
  "environment": "development",
  "database": {
    "connected": true,
    "healthy": true
  }
}
```

## Development

### Dependency Management

**ESLint Migration (v1.1.0+)**
- Migrated from ESLint 8.x to ESLint 9.x with flat config system
- Configuration now uses `eslint.config.js` instead of `.eslintrc.js`
- Upgraded to `typescript-eslint` v8 and `@eslint/js` for modern linting
- No changes required to existing lint rules or developer workflow
- Run `npm run lint` and `npm run lint:fix` as before

**Dependency Security**
- All npm audit vulnerabilities resolved (0 high/critical issues)
- Upgraded deprecated packages: axios 1.13.2, express 4.22.1, tsx 4.21.0, bcrypt 6.0.0
- Remaining transitive deprecations (glob@7, inflight) from jest 29.x - no security impact
- Updated TypeScript to 5.9.3 for improved compatibility

### Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Start development server with hot reload
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report
- `npm run db:migrate:dev` - Create and apply migrations (development)
- `npm run db:migrate` - Apply migrations (production)
- `npm run db:generate` - Generate Prisma client
- `npm run db:studio` - Open Prisma Studio
- `npm run service-registry` - Manage service registry (create, list, rotate services)

### Project Structure

```
af-auth/
├── src/
│   ├── config/          # Configuration management
│   ├── db/              # Database client and utilities
│   ├── pages/           # SSR page components (React)
│   ├── routes/          # Express route handlers
│   ├── services/        # Business logic services
│   ├── utils/           # Utilities (logger, etc.)
│   └── server.ts        # Express server setup
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── migrations/      # Database migrations
├── docs/
│   ├── database.md      # Database documentation
│   ├── logging.md       # Logging documentation
│   ├── github-app-setup.md  # GitHub OAuth setup guide
│   └── ui.md            # UI customization guide
├── .env.example         # Environment variables template
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant AFAuth as AF Auth Service
    participant GitHub
    participant Database

    User->>CLI: Initiate login
    CLI->>AFAuth: GET /auth/github
    AFAuth->>AFAuth: Generate CSRF state token
    AFAuth->>User: Render login page with GitHub OAuth URL
    User->>GitHub: Click "Sign in with GitHub"
    GitHub->>User: Authorization prompt
    User->>GitHub: Approve
    GitHub->>AFAuth: GET /auth/github/callback?code=...&state=...
    AFAuth->>AFAuth: Validate state token
    AFAuth->>GitHub: Exchange code for access token
    GitHub->>AFAuth: Return access token
    AFAuth->>GitHub: GET /user (with access token)
    GitHub->>AFAuth: Return user data
    AFAuth->>Database: Upsert user record
    Database->>AFAuth: User record (with whitelist status)
    alt User is whitelisted
        AFAuth->>User: Render "Token Ready" page
        Note over User: JWT tokens can now be issued
    else User is not whitelisted
        AFAuth->>User: Render "Unauthorized" page
        Note over User: Contact admin for access
    end
```

## Documentation

### Project Information
- [CHANGELOG](./CHANGELOG.md) - Version history and release notes
- [ROADMAP](./docs/ROADMAP.md) - Product roadmap and planned features

### Setup and Configuration

- [Local Setup Guide](./docs/setup.md) - Complete local development setup
- [GitHub App Setup Guide](./docs/github-app-setup.md) - Complete guide for creating and configuring GitHub OAuth
- [Database Schema & Setup](./docs/database.md) - Database structure, migrations, and Cloud SQL setup

### Deployment

- [Cloud Run Deployment Guide](./docs/deployment/cloud-run.md) - Comprehensive Cloud Run deployment with Secret Manager, IAM, and scaling
- [Security Guide](./docs/security.md) - Security best practices, secret rotation, and JWT verification
- [Operations Guide](./docs/operations.md) - Operational runbooks for logging, monitoring, and whitelist management

### Features and APIs

- [API Documentation](./docs/api.md) - Complete API reference
- [JWT Authentication](./docs/jwt.md) - JWT token generation and verification
- [Service Registry](./docs/service-registry.md) - Managing downstream service access
- [Logging Practices](./docs/logging.md) - Structured logging and security
- [UI Customization Guide](./docs/ui.md) - Customize SSR pages and branding

## API Endpoints

### Authentication
- `GET /auth/github` - Initiate OAuth flow (renders login page)
- `GET /auth/github/callback` - OAuth callback handler

### JWT Token Management
- `POST /api/token` - Refresh JWT tokens
- `GET /api/jwks` - Get JWT public key for verification
- `GET /.well-known/jwks.json` - JWKS endpoint (alternative path)

### Service Registry
- `POST /api/github-token` - Get user GitHub token (authenticated services only)

### Health & Monitoring
- `GET /health` - Health check with database, Redis, encryption, and metrics status
- `GET /ready` - Readiness probe for orchestrators (includes metrics validation when enabled)
- `GET /live` - Liveness probe for orchestrators
- `GET /metrics` - Prometheus metrics endpoint (protected by bearer token)

**Complete API Reference**: See [docs/api.md](./docs/api.md)

## Environment Variables

See [.env.example](./.env.example) for all available configuration options.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/db` |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | `Iv1.abc123...` |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | `secret123...` |
| `SESSION_SECRET` | Secret for CSRF token generation | Generate with `openssl rand -hex 32` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `BASE_URL` | `http://localhost:3000` | Base URL of the service |
| `LOG_LEVEL` | `info` | Logging level |
| `LOG_PRETTY` | `true` in dev | Pretty print logs |
| `JWT_EXPIRES_IN` | `30d` | JWT expiration time (format: number+unit, e.g., 30d, 7d, 24h, 60m, 3600s) |
| `REDIS_HOST` | - | Redis host for multi-instance deployments |
| `REDIS_PORT` | `6379` | Redis port |
| `METRICS_ENABLED` | `true` | Enable Prometheus metrics collection |
| `METRICS_AUTH_TOKEN` | - | Bearer token for metrics endpoint (recommended for production) |
| `ADMIN_CONTACT_EMAIL` | `admin@example.com` | Admin email for access requests |
| `ADMIN_CONTACT_NAME` | `Administrator` | Admin name display |

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## Deployment

### Quick Start for Cloud Run

For comprehensive deployment instructions, see the [Cloud Run Deployment Guide](./docs/deployment/cloud-run.md).

Quick deployment workflow:

1. **Build and push container**:
   ```bash
   gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT_ID/af-auth/af-auth:latest
   ```

2. **Create Cloud SQL instance**:
   ```bash
   gcloud sql instances create af-auth-db \
     --database-version=POSTGRES_15 \
     --tier=db-f1-micro \
     --region=us-central1
   ```

3. **Configure secrets**:
   ```bash
   echo -n "your_github_client_id" | gcloud secrets create github-client-id --data-file=-
   echo -n "your_github_client_secret" | gcloud secrets create github-client-secret --data-file=-
   openssl rand -hex 32 | gcloud secrets create session-secret --data-file=-
   ```

4. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy af-auth \
     --image=us-central1-docker.pkg.dev/PROJECT_ID/af-auth/af-auth:latest \
     --region=us-central1 \
     --set-secrets="GITHUB_CLIENT_ID=github-client-id:latest" \
     --set-secrets="GITHUB_CLIENT_SECRET=github-client-secret:latest" \
     --set-secrets="SESSION_SECRET=session-secret:latest" \
     --add-cloudsql-instances=PROJECT_ID:us-central1:af-auth-db
   ```

5. **Run database migrations**:
   ```bash
   gcloud run jobs create af-auth-migrate \
     --image=us-central1-docker.pkg.dev/PROJECT_ID/af-auth/af-auth:latest \
     --command=npm --args="run,db:migrate"
   ```

See the [full deployment guide](./docs/deployment/cloud-run.md) for:
- IAM and service account setup
- Secret Manager configuration
- VPC networking
- Custom domains and HTTPS
- Scaling configuration
- Monitoring and logging setup

## Security

AF Auth implements comprehensive security controls across multiple layers. See the [Security Guide](./docs/security.md) for complete details.

### Key Security Features

- **Secret Management**: All secrets stored in Google Secret Manager with versioning and rotation support
- **JWT Authentication**: RS256-signed tokens with configurable expiration (default 30 days) and public key distribution
- **Key Rotation Tracking**: Automated monitoring with warnings for overdue JWT, encryption, and service API key rotations
- **GitHub Token Encryption**: AES-256-GCM authenticated encryption for GitHub tokens at rest
- **Security Headers**: Comprehensive HTTP security headers including CSP, HSTS, and X-Frame-Options
- **Rate Limiting**: Redis-backed distributed rate limiting to prevent brute force and abuse
- **Audit Logging**: Comprehensive audit trail with automatic sensitive data redaction
- **IAM Integration**: Cloud IAM for database and secret access
- **Whitelist-Based Access**: Default-deny access model with explicit user approval
- **Encryption**: Data encrypted in transit (TLS) and at rest (AES-256-GCM)

### Security Best Practices

1. **Secret Rotation**: Rotate secrets regularly according to documented schedules (see [Security Guide](./docs/security.md) for detailed rotation procedures and intervals)
2. **Key Rotation Monitoring**: Use `npm run check-key-rotation` to monitor rotation status and receive automated warnings
3. **Least Privilege**: Grant minimal required IAM permissions
4. **Network Isolation**: Use VPC connectors for private database access
5. **Monitoring**: Enable alerts for failed authentication attempts and unauthorized access
6. **Rate Limiting**: Configure appropriate rate limits for your traffic patterns
7. **Incident Response**: Follow documented playbooks for security incidents

### Verifying JWTs in Downstream Services

Downstream services can verify JWTs using the public key:

```bash
# Download public key
curl https://auth.example.com/api/jwks > jwt-public.pem
```

Node.js example:

```javascript
const jwt = require('jsonwebtoken');
const fs = require('fs');

const publicKey = fs.readFileSync('jwt-public.pem', 'utf8');

function verifyToken(token) {
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: 'https://auth.example.com',
    audience: 'https://auth.example.com'
  });
}
```

See [Security Guide](./docs/security.md) for verification examples in Python, Go, and other languages.

### Data Protection

- **Logged Data**: Tokens, passwords, and secrets automatically redacted from all logs
- **Database**: Recommend encrypting tokens at application layer before storage
- **Backups**: Encrypted with same keys as primary instance
- **Audit Logs**: Retained for 90 days with queryable structured format

### Production Deployment Considerations

**✅ Production-Ready Features**:
- ✅ Redis-based OAuth state storage (multi-instance safe)
- ✅ Rate limiting on authentication and API endpoints
- ✅ GitHub tokens encrypted at rest with AES-256-GCM
- ✅ Prometheus metrics for monitoring and alerting
- ✅ Comprehensive health checks with component status
- ✅ Key rotation tracking and automated warnings

**Deployment Requirements**:
- **Redis**: Required for multi-instance deployments (Cloud Run autoscaling, Kubernetes)
- **Metrics**: Enable `METRICS_ENABLED=true` and configure `METRICS_AUTH_TOKEN` for production observability
- **Security Headers**: Verify CSP and HSTS configurations for your OAuth callback URLs
- **Key Rotation**: Schedule regular checks with `npm run check-key-rotation` and configure rotation intervals

See [Security Guide](./docs/security.md) and [Operations Guide](./docs/operations.md) for detailed operational procedures.

## Roadmap

### ✅ Completed (v1.1.0)

- [x] GitHub OAuth 2.0 flow implementation
- [x] Server-side rendered authentication pages
- [x] CSRF protection with state validation
- [x] Redis-based OAuth state storage (multi-instance support)
- [x] Whitelist-based access control
- [x] JWT token generation and validation (RS256)
- [x] Configurable JWT expiration (JWT_EXPIRES_IN)
- [x] Token refresh flow (`POST /api/token`)
- [x] Public key distribution (`GET /api/jwks`)
- [x] Service Registry API for downstream services
- [x] Service authentication with bcrypt-hashed API keys
- [x] Rate limiting on authentication and API endpoints (Redis-backed)
- [x] GitHub token encryption at rest (AES-256-GCM)
- [x] Prometheus metrics and monitoring
- [x] Key rotation tracking and automated warnings
- [x] HTTP security headers (CSP, HSTS, X-Frame-Options)
- [x] Comprehensive audit logging
- [x] Cloud Run deployment guide
- [x] Security documentation (secret rotation, JWT verification)
- [x] Operations runbooks
- [x] Management CLI for service registry
- [x] Comprehensive testing (104+ tests)
- [x] Database migrations with Prisma
- [x] Health check endpoints with component status

### 🚧 Planned (v1.2.0 - Q1 2026)

- [ ] Admin UI for user and service management
- [ ] Whitelist management CLI tool
- [ ] Enhanced monitoring dashboards with Grafana templates

### 🔮 Future Iterations

- [ ] OpenAPI/Swagger documentation
- [ ] Multi-factor authentication (MFA)
- [ ] Additional OAuth providers (Google, Microsoft)
- [ ] CI/CD pipeline with GitHub Actions

**Full Roadmap**: See [docs/ROADMAP.md](./docs/ROADMAP.md) for detailed feature descriptions, timelines, and community requests.



# Permanents (License, Contributing, Author)

Do not change any of the below sections

## License

This Agent Foundry Project is licensed under the Apache 2.0 License - see the LICENSE file for details.

## Contributing

Feel free to submit issues and enhancement requests!

## Author

Created by Agent Foundry and John Brosnihan
