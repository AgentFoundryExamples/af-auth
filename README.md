# AF Auth - Authentication Service

A TypeScript Node.js authentication service with GitHub OAuth support, whitelist-based access control, and PostgreSQL persistence.

## Features

- 🔐 **GitHub OAuth Integration** - Complete OAuth 2.0 flow with CSRF protection
- 🗄️ **PostgreSQL Database** - Prisma ORM with type-safe queries and user management
- 📝 **Structured Logging** - Pino logger with automatic sensitive data redaction
- 🔒 **Security-First Design** - Token redaction, whitelist-based access, state validation
- 🚀 **Cloud Run Ready** - Optimized for Google Cloud Platform deployment
- ✅ **Health Checks** - Kubernetes/Cloud Run compatible health endpoints
- 🔄 **Database Retry Logic** - Exponential backoff for connection resilience
- 📊 **Migration Support** - Prisma migrations for schema evolution
- 🎨 **Server-Side Rendered Pages** - Lightweight SSR pages for authentication flow
- 🧪 **Comprehensive Testing** - Unit and integration tests for OAuth flow

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

- [GitHub App Setup Guide](./docs/github-app-setup.md) - Complete guide for creating and configuring GitHub OAuth
- [UI Customization Guide](./docs/ui.md) - Customize SSR pages and branding
- [Database Schema & Setup](./docs/database.md) - Database structure and management
- [Logging Practices](./docs/logging.md) - Structured logging and security

## API Endpoints

### Authentication

- `GET /auth/github` - Initiate OAuth flow (renders login page)
- `GET /auth/github/callback` - OAuth callback handler

### Health & Monitoring

- `GET /health` - Health check with database status
- `GET /ready` - Readiness probe for orchestrators
- `GET /live` - Liveness probe for orchestrators

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

### Cloud Run

The service is optimized for Google Cloud Run deployment:

1. Build and push container:
   ```bash
   gcloud builds submit --tag gcr.io/PROJECT_ID/af-auth
   ```

2. Deploy to Cloud Run:
   ```bash
   gcloud run deploy af-auth \
     --image gcr.io/PROJECT_ID/af-auth \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated
   ```

3. Set environment variables via Secret Manager:
   ```bash
   gcloud run services update af-auth \
     --update-secrets DATABASE_URL=database-url:latest
   ```

## Production Deployment Notes

> **⚠️ WARNING**: The current implementation is suitable for development and single-instance deployments only. Before deploying to production with auto-scaling or multiple instances, review the [Production Deployment Considerations](./docs/github-app-setup.md#production-deployment-considerations) section.

**Known Limitations**:
- OAuth state storage uses in-memory Map (not multi-instance safe)
- No rate limiting on authentication endpoints
- Tokens stored in plaintext in database

**Recommended for**:
- ✅ Development and testing
- ✅ Single-instance deployments (Cloud Run with min/max instances = 1)
- ✅ Low-traffic applications

**Requires updates for**:
- ❌ Auto-scaling deployments
- ❌ Kubernetes with horizontal pod autoscaling
- ❌ Load-balanced multi-instance deployments

See [docs/github-app-setup.md](./docs/github-app-setup.md#production-deployment-considerations) for detailed solutions and implementation examples.

## Security

- Sensitive data is automatically redacted from logs
- Database tokens should be encrypted at rest (future enhancement)
- Whitelist-based access control
- Connection retry with exponential backoff
- Health checks for monitoring

## Roadmap

- [x] GitHub OAuth 2.0 flow implementation
- [x] Server-side rendered authentication pages
- [x] CSRF protection with state validation
- [x] Whitelist-based access control
- [ ] JWT token generation and validation
- [ ] Token refresh flow
- [ ] Rate limiting
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Docker compose for local development
- [ ] CI/CD pipeline
- [ ] Token encryption at rest
- [ ] Session persistence (Redis)
- [ ] Multi-factor authentication (MFA)



# Permanents (License, Contributing, Author)

Do not change any of the below sections

## License

This Agent Foundry Project is licensed under the Apache 2.0 License - see the LICENSE file for details.

## Contributing

Feel free to submit issues and enhancement requests!

## Author

Created by Agent Foundry and John Brosnihan
