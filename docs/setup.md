# Local Development Setup Guide

This guide will help you set up the AF Auth service for local development.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18 or higher ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **PostgreSQL** 14 or higher, OR **Docker** ([Download](https://www.docker.com/))
- **Git** ([Download](https://git-scm.com/))

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone https://github.com/AgentFoundryExamples/af-auth.git
cd af-auth
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required Node.js packages.

### 3. Set Up PostgreSQL Database

You have two options:

#### Option A: Using Docker (Recommended)

Start PostgreSQL using Docker Compose:

```bash
docker-compose up -d
```

Verify PostgreSQL is running:

```bash
docker-compose ps
```

You should see the `af-auth-postgres` container running.

To stop PostgreSQL:
```bash
docker-compose down
```

To stop and remove all data:
```bash
docker-compose down -v
```

#### Option B: Using Local PostgreSQL

If you have PostgreSQL installed locally:

1. Create a database:
   ```bash
   createdb af_auth
   ```

2. Or using psql:
   ```bash
   psql -U postgres
   CREATE DATABASE af_auth;
   \q
   ```

### 4. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and update the following:

#### Required Secrets

**Important**: You must generate cryptographic keys and secrets before running the application.

1. **Generate JWT signing keys** (RSA 2048-bit):

```bash
# Generate RSA private key
openssl genpkey -algorithm RSA -out jwt-private.pem -pkeyopt rsa_keygen_bits:2048

# Extract public key
openssl rsa -pubout -in jwt-private.pem -out jwt-public.pem

# Base64 encode for environment variables (Linux)
JWT_PRIVATE_KEY=$(base64 -w 0 jwt-private.pem)
JWT_PUBLIC_KEY=$(base64 -w 0 jwt-public.pem)

# Base64 encode for environment variables (macOS)
JWT_PRIVATE_KEY=$(base64 -i jwt-private.pem -o -)
JWT_PUBLIC_KEY=$(base64 -i jwt-public.pem -o -)

# Add to .env file
echo "JWT_PRIVATE_KEY=$JWT_PRIVATE_KEY" >> .env
echo "JWT_PUBLIC_KEY=$JWT_PUBLIC_KEY" >> .env

# Clean up PEM files (IMPORTANT: keep backups in a secure location)
rm jwt-private.pem jwt-public.pem
```

2. **Generate GitHub token encryption key**:

```bash
# Generate 256-bit encryption key (64 hex characters)
GITHUB_TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
echo "GITHUB_TOKEN_ENCRYPTION_KEY=$GITHUB_TOKEN_ENCRYPTION_KEY" >> .env
```

3. **Generate session secret**:

```bash
# Generate session secret (64 hex characters)
SESSION_SECRET=$(openssl rand -hex 32)
echo "SESSION_SECRET=$SESSION_SECRET" >> .env
```

4. **Set up GitHub OAuth App**:

- Go to GitHub Settings → Developer settings → OAuth Apps → New OAuth App
- Set Application name: "AF Auth (Local Development)"
- Set Homepage URL: `http://localhost:3000`
- Set Authorization callback URL: `http://localhost:3000/auth/github/callback`
- Click "Register application"
- Copy the Client ID and generate a new Client secret
- Add to `.env`:

```bash
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

#### Basic Configuration

Update the remaining configuration in `.env`:

```bash
# Server Configuration
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
BASE_URL=http://localhost:3000

# Database Configuration
# For Docker:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/af_auth

# For local PostgreSQL (adjust username/password as needed):
# DATABASE_URL=postgresql://your_username:your_password@localhost:5432/af_auth

# Database SSL/TLS (disabled for local development)
DB_SSL_ENABLED=false
DB_SSL_REJECT_UNAUTHORIZED=true

# Logging Configuration
LOG_LEVEL=debug
LOG_PRETTY=true

# JWT Configuration
JWT_EXPIRES_IN=30d
JWT_ISSUER=http://localhost:3000
JWT_AUDIENCE=http://localhost:3000
JWT_CLOCK_TOLERANCE_SECONDS=60

# UI Configuration
ADMIN_CONTACT_EMAIL=admin@example.com
ADMIN_CONTACT_NAME=Administrator
```

**Security Note**: The JWT private key and GitHub token encryption key are extremely sensitive. Never commit these to source control or share them publicly.

### 5. Generate Prisma Client

```bash
npm run db:generate
```

This generates the TypeScript types for your database schema.

### 6. Run Database Migrations

Apply the initial database schema:

```bash
npm run db:migrate:dev
```

This will:
- Create the `users` table
- Set up indexes
- Add triggers for automatic timestamp updates

### 7. Verify Database Connection

Optional: Open Prisma Studio to view your database:

```bash
npm run db:studio
```

This opens a web interface at `http://localhost:5555` where you can view and edit data.

### 8. Build the Project

Compile TypeScript to JavaScript:

```bash
npm run build
```

### 9. Run Tests

Verify everything is working:

```bash
npm test
```

All tests should pass.

### 10. Start the Development Server

```bash
npm run dev
```

The server will start at `http://localhost:3000`

### 11. Verify the Server is Running

Open another terminal and test the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-12-11T10:30:00.000Z",
  "uptime": 5.2,
  "environment": "development",
  "database": {
    "connected": true,
    "healthy": true
  }
}
```

## Common Development Tasks

### Running the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

### Database Operations

Generate Prisma client after schema changes:
```bash
npm run db:generate
```

Create a new migration:
```bash
npm run db:migrate:dev --name your_migration_name
```

Apply migrations in production:
```bash
npm run db:migrate
```

View database in browser:
```bash
npm run db:studio
```

### Code Quality

Run linter:
```bash
npm run lint
```

Fix linting issues:
```bash
npm run lint:fix
```

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Generate test coverage report:
```bash
npm run test:coverage
```

## Troubleshooting

### Database Connection Failed

**Error**: `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solutions**:
1. Verify PostgreSQL is running:
   ```bash
   docker-compose ps  # for Docker
   # OR
   pg_isready -h localhost -p 5432  # for local PostgreSQL
   ```

2. Check your `DATABASE_URL` in `.env`

3. Ensure PostgreSQL port 5432 is not in use by another application:
   ```bash
   lsof -i :5432  # macOS/Linux
   netstat -ano | findstr :5432  # Windows
   ```

### Port 3000 Already in Use

**Error**: `Error: listen EADDRINUSE: address already in use :::3000`

**Solutions**:
1. Change the port in `.env`:
   ```bash
   PORT=3001
   ```

2. Or stop the process using port 3000:
   ```bash
   lsof -ti:3000 | xargs kill  # macOS/Linux
   ```

### Migration Failed

**Error**: Migration errors

**Solutions**:
1. Check migration status:
   ```bash
   npx prisma migrate status
   ```

2. Reset the database (⚠️ loses all data):
   ```bash
   npx prisma migrate reset
   ```

3. Or manually fix and resolve:
   ```bash
   npx prisma migrate resolve --rolled-back MIGRATION_NAME
   ```

### npm install Failures

**Error**: Package installation errors

**Solutions**:
1. Clear npm cache:
   ```bash
   npm cache clean --force
   ```

2. Delete and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. Try using exact Node.js version:
   ```bash
   node --version  # should be 18 or higher
   ```

### TypeScript Build Errors

**Error**: TypeScript compilation errors

**Solutions**:
1. Regenerate Prisma client:
   ```bash
   npm run db:generate
   ```

2. Clean and rebuild:
   ```bash
   rm -rf dist
   npm run build
   ```

### Database SSL Connection Errors

**Error**: `SSL connection error` or `certificate verify failed`

**Solutions for Local Development**:
1. Disable SSL for local development in `.env`:
   ```bash
   DB_SSL_ENABLED=false
   ```

2. If using Cloud SQL or managed PostgreSQL that requires SSL:
   ```bash
   # Enable SSL but allow self-signed certificates
   DB_SSL_ENABLED=true
   DB_SSL_REJECT_UNAUTHORIZED=false
   ```

**Solutions for Production**:
1. Ensure DATABASE_URL includes SSL parameters:
   ```bash
   # For Cloud SQL with Unix socket
   DATABASE_URL=postgresql://user:pass@/dbname?host=/cloudsql/project:region:instance&sslmode=require
   
   # For TCP with SSL
   DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require
   ```

2. Provide CA certificate if using custom CA:
   ```bash
   # Base64 encode your CA certificate
   DB_SSL_CA=$(base64 -w 0 ca-cert.pem)
   echo "DB_SSL_CA=$DB_SSL_CA" >> .env
   ```

3. For mutual TLS (client certificate authentication):
   ```bash
   # Base64 encode client certificate and key
   DB_SSL_CERT=$(base64 -w 0 client-cert.pem)
   DB_SSL_KEY=$(base64 -w 0 client-key.pem)
   echo "DB_SSL_CERT=$DB_SSL_CERT" >> .env
   echo "DB_SSL_KEY=$DB_SSL_KEY" >> .env
   ```

### Missing Environment Variables

**Error**: `Missing required environment variable: JWT_PRIVATE_KEY` (or similar)

**Solutions**:
1. Ensure all required secrets are generated and added to `.env`:
   - `JWT_PRIVATE_KEY` (base64-encoded RSA private key)
   - `JWT_PUBLIC_KEY` (base64-encoded RSA public key)
   - `GITHUB_TOKEN_ENCRYPTION_KEY` (at least 32 characters)
   - `GITHUB_CLIENT_ID` (from GitHub OAuth App)
   - `GITHUB_CLIENT_SECRET` (from GitHub OAuth App)
   - `SESSION_SECRET` (at least 32 characters)
   - `DATABASE_URL` (PostgreSQL connection string)

2. Re-run the secret generation steps from section 4 above

3. Verify `.env` file exists and is in the project root directory

## Development Workflow

1. **Make code changes** in `src/`
2. **Run tests** to verify changes: `npm test`
3. **Run linter** to check code quality: `npm run lint:fix`
4. **Test manually** using `npm run dev`
5. **Check health endpoint** to ensure service is working
6. **Commit changes** with meaningful commit messages

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | development | Environment (development/production) |
| `PORT` | No | 3000 | Server port |
| `HOST` | No | 0.0.0.0 | Server host |
| `BASE_URL` | No | http://localhost:{PORT} | Public base URL of the service |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `DB_POOL_MIN` | No | 2 | Minimum connection pool size |
| `DB_POOL_MAX` | No | 10 | Maximum connection pool size |
| `DB_CONNECTION_TIMEOUT_MS` | No | 5000 | Connection timeout in milliseconds |
| `DB_MAX_RETRIES` | No | 3 | Maximum connection retry attempts |
| `DB_RETRY_DELAY_MS` | No | 1000 | Base retry delay in milliseconds |
| `DB_SSL_ENABLED` | No | true (prod), false (dev) | Enable SSL/TLS for database connections |
| `DB_SSL_REJECT_UNAUTHORIZED` | No | true | Reject connections with invalid certificates |
| `DB_SSL_CA` | No | - | CA certificate for SSL (base64-encoded) |
| `DB_SSL_CERT` | No | - | Client certificate for mutual TLS (base64-encoded) |
| `DB_SSL_KEY` | No | - | Client key for mutual TLS (base64-encoded) |
| `LOG_LEVEL` | No | info | Log level (trace/debug/info/warn/error/fatal) |
| `LOG_PRETTY` | No | true (dev) | Enable pretty printing of logs |
| `GITHUB_CLIENT_ID` | Yes | - | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | Yes | - | GitHub OAuth App client secret |
| `GITHUB_CALLBACK_URL` | No | {BASE_URL}/auth/github/callback | OAuth callback URL |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Yes | - | Encryption key for GitHub tokens (min 32 chars) |
| `SESSION_SECRET` | Yes | - | Secret for session encryption (min 32 chars) |
| `SESSION_MAX_AGE_MS` | No | 600000 | Session lifetime in milliseconds (10 minutes) |
| `JWT_PRIVATE_KEY` | Yes | - | RSA private key for JWT signing (base64-encoded PEM) |
| `JWT_PUBLIC_KEY` | Yes | - | RSA public key for JWT verification (base64-encoded PEM) |
| `JWT_EXPIRES_IN` | No | 30d | JWT expiration time (e.g., 30d, 24h, 7200s) |
| `JWT_ISSUER` | No | {BASE_URL} | JWT issuer claim |
| `JWT_AUDIENCE` | No | {BASE_URL} | JWT audience claim |
| `JWT_CLOCK_TOLERANCE_SECONDS` | No | 60 | Clock skew tolerance for JWT validation |
| `ADMIN_CONTACT_EMAIL` | No | admin@example.com | Admin contact email for UI |
| `ADMIN_CONTACT_NAME` | No | Administrator | Admin contact name for UI |

## Security Best Practices

### Secret Management

1. **Never commit secrets to source control**
   - Add `.env` to `.gitignore` (already configured)
   - Use separate `.env` files for different environments
   - Use secret management services in production (e.g., GCP Secret Manager)

2. **Rotate secrets regularly**
   - GitHub OAuth secrets: Every 90 days
   - Session secret: Every 60 days
   - JWT keys: Every 180 days
   - Database credentials: Every 90 days
   - GitHub token encryption key: Every 90 days
   - See `docs/security.md` for detailed rotation procedures

3. **Use strong secrets**
   - JWT keys: Minimum 2048-bit RSA (4096-bit recommended for high security)
   - Encryption keys: Minimum 32 characters (64+ recommended)
   - Session secrets: Minimum 32 characters (64+ recommended)
   - All secrets should be cryptographically random

4. **Protect secrets in production**
   - Use environment variables or secret management services
   - Never log secrets or include them in error messages
   - Restrict access to production secrets to authorized personnel only
   - Use separate secrets for each environment (dev/staging/prod)

### Database Security

1. **Always use SSL/TLS in production**
   ```bash
   DB_SSL_ENABLED=true
   DB_SSL_REJECT_UNAUTHORIZED=true
   ```

2. **Use least-privilege database credentials**
   - Create dedicated database user for the application
   - Grant only required permissions (SELECT, INSERT, UPDATE, DELETE)
   - Revoke unnecessary privileges

3. **Enable connection encryption**
   - Use Cloud SQL with automatic SSL
   - Or configure PostgreSQL to require SSL connections
   - Verify SSL is enabled by checking connection logs

## Next Steps

- Review [Database Documentation](./database.md) for schema details
- Review [Logging Documentation](./logging.md) for logging practices
- Implement GitHub OAuth flow (see issue tracker)
- Add JWT token generation (see issue tracker)

## Getting Help

- Check the [main README](../README.md) for project overview
- Review the [documentation](../docs/) for detailed guides
- Open an issue on GitHub for bugs or questions
