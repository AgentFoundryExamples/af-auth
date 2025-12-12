# AF Auth - Product Roadmap

This document outlines the completed features, current capabilities, and planned future enhancements for the AF Auth service.

## Table of Contents

- [Current Status (v1.1.0)](#current-status-v110)
- [Completed Features](#completed-features)
- [In Progress](#in-progress)
- [Planned Features](#planned-features)
- [Future Considerations](#future-considerations)
- [Community Requests](#community-requests)

## Current Status (v1.1.0)

**Release Date**: December 12, 2025

AF Auth is a production-ready authentication service suitable for **multi-instance deployments** with comprehensive OAuth, JWT, and service registry capabilities. The system provides enterprise-grade security features including secret rotation, audit logging, key rotation tracking, and deployment automation.

### Deployment Readiness

- ✅ **Multi-Instance Production**: Ready for Cloud Run deployments with autoscaling (Redis-based state storage)
- ✅ **Single-Instance Production**: Ready for Cloud Run deployments with `max-instances=1`
- ✅ **Development & Testing**: Full local development support with Docker Compose

### Documentation Status

- ✅ Comprehensive deployment guides (Cloud Run, local)
- ✅ Complete API reference with examples
- ✅ Security best practices and rotation procedures
- ✅ Operations runbooks for common tasks
- ✅ Developer quick-start guides

## Completed Features

### ✅ Core Authentication (v1.1.0)

#### GitHub OAuth 2.0
- [x] Complete OAuth 2.0 flow implementation
- [x] State-based CSRF protection with cryptographically secure tokens
- [x] One-time use state validation (prevents replay attacks)
- [x] Configurable session expiration (default 10 minutes)
- [x] Automatic expired state cleanup
- [x] Error handling with user-friendly error pages
- [x] Production-ready OAuth app configuration guide

#### Whitelist-Based Access Control
- [x] Default-deny security model (new users start as non-whitelisted)
- [x] User upsert logic (prevents duplicate accounts)
- [x] Database-backed whitelist persistence
- [x] Pre-whitelisting support (prevent race conditions)
- [x] Whitelist management via Prisma Studio
- [x] SQL-based whitelist operations documented
- [x] Management script for whitelist operations (planned for v1.2)

### ✅ JWT Token System (v1.1.0)

#### Token Generation & Validation
- [x] RS256-signed JWT tokens (asymmetric cryptography)
- [x] Configurable token validity period (JWT_EXPIRES_IN: 30d default, supports s/m/h/d units)
- [x] Standard claims: `sub`, `iss`, `aud`, `iat`, `exp`, `jti`
- [x] Custom claims: `githubId`
- [x] RSA key pair generation and management
- [x] Private key security (excluded from version control)
- [x] Token generation on successful authentication
- [x] Token revocation support via JTI tracking

#### Token Refresh
- [x] `POST /api/token` refresh endpoint
- [x] Signature validation on refresh
- [x] Expiry validation with configurable clock skew
- [x] Real-time whitelist status verification
- [x] Specific error codes for debugging
- [x] Token refresh flow documentation

#### Public Key Distribution
- [x] `GET /api/jwks` JWKS endpoint for downstream services
- [x] PEM-formatted public key distribution
- [x] Verification examples (Node.js, Python)
- [x] Decentralized verification without shared secrets
- [x] Documentation for service integration

### ✅ Service Registry (v1.1.0)

#### Service Authentication
- [x] Service registration with unique identifiers
- [x] Bcrypt-hashed API keys (12 rounds, industry standard)
- [x] 256-bit entropy API keys via `crypto.randomBytes(32)`
- [x] Basic authentication scheme (`Bearer serviceId:apiKey`)
- [x] Service activation/deactivation
- [x] Last-used timestamp tracking
- [x] Service description and metadata

#### GitHub Token Access API
- [x] `POST /api/github-token` endpoint for authenticated services
- [x] User lookup by UUID or GitHub ID
- [x] Whitelist validation before token access
- [x] GitHub token encryption at rest with AES-256-GCM
- [x] Automatic token refresh when expiring soon
- [x] Comprehensive error responses
- [x] Rate limiting per service (Redis-backed)

#### Audit Logging
- [x] Complete access logging without exposing tokens
- [x] Structured JSON logs for queryability
- [x] Service authentication attempt logging
- [x] Success/failure tracking
- [x] IP address and user agent capture
- [x] Automatic sensitive data redaction

#### Management Tools
- [x] CLI tool for service management (`npm run service-registry`)
- [x] Create, list, activate, deactivate operations
- [x] API key rotation workflow
- [x] TypeScript-based with type safety
- [x] Database connection lifecycle management

### ✅ User Interface (v1.1.0)

#### Server-Side Rendered Pages
- [x] React-based SSR pages with inline styles
- [x] Login page with GitHub OAuth button
- [x] Token-ready page with JWT display
- [x] Copy-to-clipboard functionality (vanilla JS)
- [x] Unauthorized page for non-whitelisted users
- [x] Error page with detailed error messages
- [x] Configurable branding (admin contact, styling)
- [x] Responsive design for mobile and desktop
- [x] UI customization guide

### ✅ Infrastructure & Deployment (v1.1.0)

#### Database
- [x] PostgreSQL 15+ support via Prisma ORM
- [x] Three-table schema (users, services, oauth_states)
- [x] Idempotent migrations with safety comments
- [x] Exponential backoff retry logic (3 retries default)
- [x] Connection health checks
- [x] Cloud SQL integration guide
- [x] Database configuration documentation

#### Health & Monitoring
- [x] `/health` endpoint with database status
- [x] `/ready` readiness probe for Kubernetes/Cloud Run
- [x] `/live` liveness probe for orchestrators
- [x] Uptime tracking and reporting
- [x] Environment-aware health responses

#### Logging
- [x] Pino structured logging (10x faster than Winston)
- [x] Automatic sensitive data redaction
- [x] HTTP request logging via `pino-http`
- [x] Custom log levels based on status codes
- [x] Cloud Run metadata integration
- [x] Pretty-print for development, JSON for production
- [x] Logging best practices documentation

#### Cloud Run Deployment
- [x] Comprehensive Cloud Run deployment guide
- [x] Artifact Registry container storage
- [x] Secret Manager integration
- [x] IAM and service account setup
- [x] VPC networking for private database access
- [x] Custom domain and HTTPS configuration
- [x] Scaling configuration examples
- [x] Monitoring and logging setup
- [x] Update and rollback procedures
- [x] Troubleshooting guide

### ✅ Security (v1.1.0)

#### Secret Management
- [x] Google Secret Manager integration
- [x] Zero-downtime secret rotation procedures
- [x] Rotation schedules documented (GitHub: 90d, Session: 60d, JWT: 180d, DB: 90d, GitHub token encryption: 90d)
- [x] Key rotation tracking system with automated warnings
- [x] Rotation status checker CLI (`npm run check-key-rotation`)
- [x] Service API key rotation tracking
- [x] Version control for secrets
- [x] No secrets in code or configuration files
- [x] Environment variable injection

#### Encryption & Hashing
- [x] TLS for data in transit
- [x] AES-256-GCM for GitHub tokens at rest (authenticated encryption)
- [x] AES-256 for data at rest (Cloud SQL)
- [x] Bcrypt for API key hashing (12 rounds)
- [x] RS256 for JWT signing
- [x] Encrypted database backups

#### Security Headers & Protection
- [x] Comprehensive HTTP security headers via Helmet
- [x] Content-Security-Policy (CSP) with configurable directives
- [x] HTTP Strict Transport Security (HSTS) for production
- [x] X-Frame-Options to prevent clickjacking
- [x] X-Content-Type-Options to prevent MIME sniffing
- [x] Referrer-Policy control
- [x] Permissions-Policy for browser features
- [x] Rate limiting on authentication and API endpoints (Redis-backed)
- [x] Prototype pollution protection
- [x] Input validation with Zod schemas

#### Security Documentation
- [x] Security guide with best practices
- [x] JWT verification examples for downstream services
- [x] Key rotation tracking and monitoring procedures
- [x] GitHub token encryption and migration guide
- [x] Token revocation procedures
- [x] Incident response playbooks
- [x] Production security considerations
- [x] Compliance guidance

### ✅ Developer Experience (v1.1.0)

#### Build & Test
- [x] TypeScript compilation (`npm run build`)
- [x] Development server with hot reload (`npm run dev`)
- [x] Jest test suite with 104+ tests
- [x] Test coverage reporting
- [x] ESLint with TypeScript support
- [x] Automated linting (`npm run lint`)

#### Documentation
- [x] Quick start guide in README
- [x] Complete API reference
- [x] Comprehensive deployment guides
- [x] Security and operations runbooks
- [x] Database schema documentation
- [x] UI customization guide
- [x] Mermaid diagrams for complex flows
- [x] Code examples for all features

## In Progress

Currently, there are no features actively in development. The v1.1.0 release represents a stable, feature-complete authentication service for both single-instance and multi-instance deployments.

## Planned Features

### High Priority (v1.2.0 - Q1 2026)

#### Admin UI
- [ ] **Web-Based Admin Dashboard**: Manage users and services without SQL/CLI
  - User management (view, whitelist, revoke)
  - Service registry management (create, rotate, deactivate)
  - Audit log viewer with filtering and search
  - Authentication via GitHub OAuth (admin users)
  - Role-based access control (admin vs. viewer)
- [ ] **Admin API Endpoints**: REST API for programmatic admin operations
- [ ] **Admin UI Documentation**: Usage guide and screenshots

### Medium Priority (v1.3.0 - Q2 2026)

#### Enhanced Whitelist Management
- [ ] **Whitelist Management Script**: CLI tool for whitelist operations
  - Add/remove users by GitHub username or email
  - Bulk import from CSV or JSON
  - List whitelisted users with filtering
  - Pre-whitelist users before first login
- [ ] **Whitelist Management API**: Authenticated API for whitelist CRUD operations
- [ ] **Auto-Approval Workflows**: Configurable rules for automatic whitelisting
  - GitHub organization membership
  - Email domain matching
  - GitHub team membership

#### OpenAPI/Swagger Documentation
- [ ] **OpenAPI 3.0 Specification**: Complete API definition
  - Endpoint documentation with schemas
  - Request/response examples
  - Authentication schemes
- [ ] **Swagger UI**: Interactive API documentation
  - Embedded in service at `/api-docs`
  - Try-it-out functionality
  - Authentication support for testing
- [ ] **SDK Generation**: Auto-generated client libraries (Node.js, Python, Go)

### Low Priority (v1.4.0+ - Q3 2026 and beyond)

#### Multi-Factor Authentication (MFA)
- [ ] **TOTP Support**: Time-based one-time passwords
  - QR code generation for authenticator apps
  - Backup codes for recovery
  - Per-user MFA enrollment
- [ ] **SMS-Based MFA**: SMS verification (via Twilio or similar)
- [ ] **MFA Enforcement**: Configurable MFA requirement policies
- [ ] **Recovery Workflows**: Account recovery with MFA

#### Enhanced Monitoring & Metrics
- [ ] **Grafana Dashboards**: Pre-built dashboard templates for visualization
- [ ] **Enhanced Alerting**: Additional alert rule examples
  - Failed authentication spikes
  - Database connection failures
  - API error rate increases
  - Key rotation overdue alerts

#### Additional OAuth Providers
- [ ] **Google OAuth**: Support for Google account authentication
- [ ] **Microsoft OAuth**: Support for Microsoft/Azure AD
- [ ] **Generic OIDC**: Support for any OpenID Connect provider
- [ ] **Multi-Provider Support**: Link multiple OAuth accounts to one user
- [ ] **Provider Selection UI**: User choice of authentication provider

#### CI/CD Pipeline
- [ ] **GitHub Actions Workflows**: Automated testing and deployment
  - Lint, build, and test on every PR
  - Automated security scanning (CodeQL, Dependabot)
  - Automated deployment to staging on merge
  - Manual promotion to production
- [ ] **Automated Database Migrations**: Safe migration deployment in CI/CD
- [ ] **Rollback Automation**: Automated rollback on deployment failure

#### Performance Enhancements
- [ ] **Response Caching**: Cache public key, health checks, and static responses
  - Redis-based caching layer
  - Configurable TTL per endpoint
  - Cache invalidation on key rotation
- [ ] **Database Query Optimization**: Index optimization and query analysis
- [ ] **Connection Pooling Tuning**: Optimize Prisma connection pool settings

## Future Considerations

These items are not yet prioritized but may be considered based on community feedback and use case requirements.

### Advanced Features

- **Webhook Support**: Notify downstream services of authentication events
- **API Key Management**: Alternative authentication method for service-to-service calls (beyond JWT)
- **Session Management API**: View and revoke active sessions
- **User Profile API**: User self-service for profile updates
- **Audit Log Export**: Bulk export of audit logs for compliance
- **SAML Support**: Enterprise SAML 2.0 authentication
- **LDAP Integration**: Active Directory and LDAP authentication
- **Custom Claims**: Allow administrators to add custom JWT claims per user
- **Token Scopes**: Fine-grained permissions within JWTs
- **Geo-Restriction**: Limit authentication by geographic location

### Infrastructure & Operations

- **Kubernetes Deployment Guide**: Helm charts and deployment instructions
- **Terraform Modules**: Infrastructure-as-code for Cloud Run deployment
- **Docker Compose for Production**: Self-hosted deployment option
- **Automated Backup & Restore**: Database backup automation
- **Blue-Green Deployment**: Zero-downtime deployment strategy
- **Canary Deployments**: Gradual rollout with traffic splitting

### Developer Tools

- **GraphQL API**: Alternative API interface
- **CLI Client**: Command-line tool for authentication testing
- **Postman Collection**: API testing collection
- **Test Fixtures**: Shared test data for integration testing
- **Mock Server**: Standalone mock for development

## Community Requests

This section tracks feature requests from users and contributors. To request a feature, please open an issue on GitHub with the `enhancement` label.

### Open Requests

None yet - this is the initial release!

### Accepted Requests

None yet.

### Declined Requests

None yet.

## Versioning Strategy

AF Auth follows [Semantic Versioning 2.0.0](https://semver.org/):

- **Major version** (X.0.0): Breaking changes to API or data models
- **Minor version** (1.X.0): New features, backward compatible
- **Patch version** (1.1.X): Bug fixes and security patches, backward compatible

### Release Cadence

- **Minor releases**: Quarterly (Q1, Q2, Q3, Q4)
- **Patch releases**: As needed for security and critical bugs
- **Major releases**: When necessary for architectural changes

## Contributing

We welcome contributions! Please see our [Contributing Guide](../CONTRIBUTING.md) for details on:

- How to submit feature requests
- Development setup and guidelines
- Pull request process
- Code review expectations

## Feedback

Have feedback on the roadmap? Please:

1. **Feature Requests**: Open a GitHub issue with the `enhancement` label
2. **Priority Feedback**: Comment on existing roadmap items in issues
3. **Use Case Sharing**: Help us understand your deployment scenarios

For questions, reach out via GitHub Issues or contact the maintainers.

---

**Last Updated**: December 12, 2025  
**Current Version**: 1.1.0  
**Next Planned Release**: 1.2.0 (Q1 2026)
