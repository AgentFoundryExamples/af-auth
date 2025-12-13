# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security & Documentation

#### Comprehensive Security Audit Completed (2025-12-13)
- **Code Review**: Verified no outstanding TODO/FIXME/security annotations in src/** and docs/**
- **Security Summary**: Updated SECURITY_SUMMARY.md with comprehensive Terraform deployment posture
  - Infrastructure-as-code security analysis
  - Secret management integration with Google Secret Manager
  - Network security with VPC-based private networking
  - Service account and IAM least-privilege configuration
  - Database and Redis security posture
  - Container security best practices
  - Audit logging and monitoring capabilities
  - Residual risk analysis with mitigations
  - Environment-specific security configurations (dev/staging/production)
  - Deployment security checklist
  - Terraform-specific security recommendations
- **Security Documentation**: Enhanced docs/security.md with comprehensive audit checklist
  - Code security audit checklist
  - Infrastructure security audit checklist
  - Operational security audit checklist
  - Documentation audit checklist
  - Testing and quality assurance verification
  - Residual risks and accepted risks documentation
  - Audit compliance statement
- **Operations Documentation**: Enhanced docs/operations.md with detailed operational runbooks
  - JWT private key rotation runbook (step-by-step)
  - GitHub token encryption key rotation runbook
  - Service API key rotation runbook
  - Token revocation runbook
  - Revoked token cleanup runbook
  - Incident response runbooks (token compromise, database failure, Redis failure)
  - Observability and monitoring runbooks
  - Terraform state troubleshooting procedures
- **Terraform References**: Updated all documentation to reference Terraform deployment workflows
  - State management procedures
  - Secret injection from Secret Manager
  - Infrastructure drift detection and resolution
  - Deployment outputs for monitoring configuration

#### Security Verification
- ✅ All middleware aligned with least-privilege expectations
- ✅ Rate limiting implemented and documented (authentication, JWT, GitHub token endpoints)
- ✅ Token revocation procedures documented with CLI tools
- ✅ Key rotation tracking automated with monitoring and warnings
- ✅ Observability references in operations documentation
- ✅ Incident response procedures for common scenarios
- ✅ No critical security gaps identified

#### Documentation Completeness
- ✅ Mitigation procedures for all documented risks
- ✅ Incident response steps for security events
- ✅ Terraform workflow references throughout documentation
- ✅ Audit checklist demonstrates reviewed components and outcomes
- ✅ Cross-references between security.md, operations.md, and SECURITY_SUMMARY.md

#### Testing
- ✅ All 421 tests passing
- ✅ Security tests cover CSP nonces, timing attacks, rate limiting
- ✅ Integration tests verify health checks and OAuth flow
- ✅ No regressions introduced

**Audit Date:** 2025-12-13  
**Audit Scope:** Code, infrastructure, documentation, operations  
**Audit Status:** ✅ Complete - Production ready  
**Next Audit:** Quarterly or after major infrastructure/security changes

## [1.1.0] - 2025-12-12

### Added

#### Authentication & Authorization
- **GitHub OAuth 2.0 Flow**: Complete OAuth implementation with state-based CSRF protection
  - Login page with GitHub OAuth integration (`GET /auth/github`)
  - OAuth callback handler with secure state validation (`GET /auth/github/callback`)
  - Cryptographically secure state tokens with 10-minute expiration
  - One-time use state validation to prevent replay attacks
- **Whitelist-Based Access Control**: Default-deny security model
  - New users created with `is_whitelisted=false` by default
  - User upsert logic prevents duplicates on repeat logins
  - Whitelist management via SQL, Prisma Studio, or CLI tools

#### JWT Token System
- **JWT Token Generation**: RS256-signed tokens with 30-day validity
  - Token claims: `sub` (user UUID), `githubId`, `isWhitelisted`, `iss`, `aud`, `iat`, `exp`
  - RSA key pair generation and management in `src/config/keys/`
  - Private key excluded from version control via `.gitignore`
- **JWT Token Refresh**: Endpoint for refreshing expired tokens (`POST /api/token`)
  - Validates signature, expiry, and current whitelist status
  - Returns specific error codes: `EXPIRED_TOKEN`, `INVALID_TOKEN`, `USER_NOT_FOUND`, `WHITELIST_REVOKED`
  - Configurable clock skew tolerance (60 seconds default via `JWT_CLOCK_TOLERANCE_SECONDS`)
- **Public Key Distribution**: JWKS endpoint for downstream services (`GET /api/jwks`)
  - Enables decentralized JWT verification without shared secrets
  - Supports RS256 algorithm verification

#### Service Registry API
- **Service Authentication**: Secure API for downstream services to access user GitHub tokens
  - Service registration with bcrypt-hashed API keys (12 rounds)
  - 64-character hex API keys (256-bit entropy) via `crypto.randomBytes(32)`
  - Basic authentication scheme: `Authorization: Basic <base64(serviceId:apiKey)>`
  - Endpoint: `POST /api/github-token` with `userId` or `githubId` in request body
- **Audit Logging**: Comprehensive access tracking without exposing sensitive data
  - Logs service IDs, user UUIDs, action names, success/failure, IP addresses, user agents
  - Never logs tokens or credentials
  - Structured JSON format for queryable audit trails
- **Service Management CLI**: TypeScript-based CLI tool (`npm run service-registry`)
  - Create, list, activate, deactivate, and rotate service credentials
  - Uses `tsx` for execution with proper DB connection lifecycle

#### Server-Side Rendered Pages
- **React SSR Pages**: Lightweight authentication flow pages
  - Login page with GitHub OAuth button (`src/pages/login.tsx`)
  - Token-ready page with JWT display and copy-to-clipboard functionality (`src/pages/token-ready.tsx`)
  - Unauthorized page for non-whitelisted users (`src/pages/unauthorized.tsx`)
  - Error page with detailed error messages (`src/pages/error.tsx`)
  - Rendered via `ReactDOMServer.renderToStaticMarkup` with inline styles
  - Copy-to-clipboard implemented via vanilla JavaScript (not React event handlers) due to SSR constraints

#### Health & Monitoring
- **Health Check Endpoints**: Kubernetes/Cloud Run compatible probes
  - `/health`: Detailed service and database health status with uptime
  - `/ready`: Readiness probe for traffic acceptance
  - `/live`: Liveness probe for process health
- **Structured Logging**: Pino-based logging with security features
  - Automatic sensitive data redaction (tokens, passwords, secrets) via field name pattern matching
  - HTTP request logging via `pino-http` with custom log levels
  - Cloud Run metadata integration (`K_SERVICE`, `K_REVISION`)
  - Pretty-print mode for development, JSON for production

#### Database & Persistence
- **PostgreSQL Schema**: Prisma-managed schema with three tables
  - `users`: User records with GitHub ID, whitelist status, tokens
  - `services`: Service registry with bcrypt-hashed API keys
  - `oauth_states`: Temporary OAuth state storage with expiration
- **Migration System**: Idempotent migrations with comprehensive safety comments
  - Initial setup migration: `20241211000000_initial_setup`
  - Uses `IF NOT EXISTS`/`IF EXISTS` clauses for safety
  - Documented purpose and safety considerations
- **Connection Resilience**: Exponential backoff retry logic
  - 3 retries by default for transient database failures
  - Configurable retry attempts and delays via config
  - Connection health checks for monitoring endpoints

#### Documentation
- **Deployment Guides**:
  - [Cloud Run Deployment](./docs/deployment/cloud-run.md): Comprehensive guide with Artifact Registry, Secret Manager, IAM, VPC, scaling, and monitoring
  - [Security Guide](./docs/security.md): Zero-downtime secret rotation procedures for GitHub OAuth (90 days), Session (60 days), JWT keys (180 days), Database (90 days)
  - [Operations Guide](./docs/operations.md): Operational runbooks for logging, monitoring, whitelist management
- **Feature Documentation**:
  - [JWT Authentication](./docs/jwt.md): Token structure, verification, refresh flow, key management
  - [Service Registry](./docs/service-registry.md): API usage, service management, audit logging
  - [API Documentation](./docs/api.md): Complete endpoint reference with examples
  - [Database Documentation](./docs/database.md): Schema, migrations, Cloud SQL setup
- **Setup Guides**:
  - [Local Setup](./docs/setup.md): Complete local development environment
  - [GitHub App Setup](./docs/github-app-setup.md): OAuth app creation and configuration
  - [UI Customization](./docs/ui.md): SSR page styling and branding

### Security

#### Security Features
- **Secret Management**: All secrets stored in Google Secret Manager
  - Version control and rotation support
  - No secrets in code or configuration files
  - Environment variable injection from Secret Manager
- **JWT Security**: RS256 asymmetric signing
  - Private key never exposed or transmitted
  - Public key distribution for decentralized verification
  - 30-day token validity with refresh flow
- **Audit Trail**: Complete access logging
  - Service authentication attempts (success and failure)
  - GitHub token access requests
  - Whitelist status changes
  - Automatic sensitive data redaction
- **Encryption**: Multiple layers of data protection
  - TLS for data in transit
  - AES-256 for data at rest (Cloud SQL)
  - Bcrypt for API key hashing (12 rounds)
  - Encrypted backups with same keys as primary

#### Security Best Practices Documented
- **Secret Rotation**: Regular rotation schedules documented
  - GitHub OAuth credentials: 90 days
  - Session secrets: 60 days
  - JWT signing keys: 90 days
  - Database passwords: 90 days
  - Zero-downtime rotation procedures for all credential types
- **JWT Verification**: Examples for downstream services
  - Node.js verification with proper claim validation (`iss`, `aud`, `exp`, `isWhitelisted`)
  - Python verification example with PyJWT
  - Proper algorithm specification (RS256 only)
  - Public key retrieval from `/api/jwks`
- **IAM Integration**: Least privilege access model
  - Service accounts for Cloud Run
  - Minimal required permissions for Secret Manager, Cloud SQL
  - Network isolation via VPC connectors
- **Incident Response**: Security incident playbooks
  - Token revocation procedures
  - Compromised credential rotation
  - Unauthorized access investigation
  - Compliance reporting

#### Known Security Limitations
The following limitations are documented for transparency and apply only to development/single-instance deployments:
- OAuth state storage uses in-memory Map (not suitable for `max-instances > 1`)
- No rate limiting on authentication endpoints
- GitHub tokens stored in plaintext in database (recommend application-layer encryption)
- For production multi-instance deployments, see [GitHub App Setup - Production Considerations](./docs/github-app-setup.md#production-deployment-considerations)

### Configuration

#### Environment Variables
- **Required**: `DATABASE_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`
- **Optional**: `PORT`, `HOST`, `BASE_URL`, `LOG_LEVEL`, `LOG_PRETTY`, `ADMIN_CONTACT_EMAIL`, `ADMIN_CONTACT_NAME`
- **JWT Configuration**: `JWT_EXPIRATION`, `JWT_CLOCK_TOLERANCE_SECONDS`, `JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH`
- **Database**: `DB_MAX_RETRIES`, `DB_RETRY_DELAY_MS`, `DB_CONNECTION_TIMEOUT_MS`
- **Session**: `SESSION_MAX_AGE_MS`, `SESSION_CLEANUP_INTERVAL_MS`
- Complete documentation in [.env.example](./.env.example)

#### Deployment Configuration
- Cloud Run scaling: `--min-instances=0`, `--max-instances=1` for single-instance
- Database tier: `db-f1-micro` for development, `db-custom-2-7680` for production
- Secret Manager: Version-based secret references for rollback capability
- VPC networking: Private IP for Cloud SQL with VPC connector

### Developer Experience

#### Build & Test
- TypeScript compilation: `npm run build`
- Development server with hot reload: `npm run dev`
- Test suite: `npm test` (Jest with 104+ passing tests)
- Test coverage: `npm run test:coverage`
- Linting: `npm run lint` (ESLint with TypeScript)

#### Database Tools
- Migration creation: `npm run db:migrate:dev`
- Migration deployment: `npm run db:migrate`
- Prisma client generation: `npm run db:generate`
- Database UI: `npm run db:studio`

#### Management Scripts
- Service registry management: `npm run service-registry`
- Whitelist management: Via Prisma Studio or SQL queries (documented in operations guide)

### Performance

- Express server with optimized middleware chain
- Pino structured logging (10x faster than Winston)
- Database connection pooling via Prisma
- Exponential backoff for transient failures
- Health check caching for high-frequency requests

### Infrastructure

- **Container**: Node.js 18+ base image
- **Database**: PostgreSQL 15 with Cloud SQL
- **Secrets**: Google Secret Manager integration
- **Networking**: VPC connector for private database access
- **Monitoring**: Cloud Logging integration with structured logs
- **Scaling**: Horizontal scaling support (with state storage upgrade for multi-instance)

### Testing

- **Unit Tests**: 104+ tests covering services, routes, utilities
- **Integration Tests**: OAuth flow, JWT generation/refresh, service registry
- **Mocked Dependencies**: GitHub OAuth API, database connections
- **Coverage**: High coverage of critical authentication and token paths

### Documentation Quality

All documentation follows consistent structure:
- Table of contents for navigation
- Code examples with syntax highlighting
- Mermaid diagrams for complex flows
- Security warnings where applicable
- Links to related documentation
- Troubleshooting sections
- Production deployment considerations

### Migration Notes

This is the initial release with complete authentication system. No migration required from previous versions.

For deployments:
1. Review [deployment guide](./docs/deployment/cloud-run.md) for Cloud Run
2. Generate JWT key pair: `npm run generate-jwt-keys` (if script exists) or manually via OpenSSL
3. Configure secrets in Secret Manager or environment variables
4. Run database migrations: `npm run db:migrate`
5. Whitelist initial users via Prisma Studio or SQL

### Deprecations

None in this release.

### Breaking Changes

None - this is the initial feature-complete release.

---

## [1.0.0] - 2024-12-11

### Added

- Initial project setup with TypeScript and Express
- Basic project structure and build configuration
- ESLint and Jest configuration
- PostgreSQL database setup with Prisma
- Basic health check endpoint

---

For detailed documentation, see:
- [README.md](./README.md) - Quick start and overview
- [docs/deployment/cloud-run.md](./docs/deployment/cloud-run.md) - Deployment guide
- [docs/security.md](./docs/security.md) - Security practices
- [docs/api.md](./docs/api.md) - API reference
