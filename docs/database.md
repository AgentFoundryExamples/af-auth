# Database Documentation

## Overview

This service uses PostgreSQL as its primary data store with Prisma ORM for type-safe database access. The database schema supports GitHub OAuth authentication with user whitelisting capabilities.

## Database Schema

### Users Table

The `users` table stores user identity and authentication information for GitHub OAuth flow.

```prisma
model User {
  id                     String    @id @default(uuid()) @db.Uuid
  githubUserId           BigInt    @unique @map("github_user_id")
  githubAccessToken      String?   @map("github_access_token") @db.Text
  githubRefreshToken     String?   @map("github_refresh_token") @db.Text
  githubTokenExpiresAt   DateTime? @map("github_token_expires_at") @db.Timestamptz(6)
  isWhitelisted          Boolean   @default(false) @map("is_whitelisted")
  createdAt              DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt              DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@map("users")
}
```

#### Column Descriptions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique identifier for the user (auto-generated) |
| `github_user_id` | BIGINT | UNIQUE, NOT NULL | GitHub user ID from OAuth |
| `github_access_token` | TEXT | NULLABLE | GitHub OAuth access token (encrypted at rest recommended) |
| `github_refresh_token` | TEXT | NULLABLE | GitHub OAuth refresh token (encrypted at rest recommended) |
| `github_token_expires_at` | TIMESTAMPTZ | NULLABLE | Token expiration timestamp (stored in UTC) |
| `is_whitelisted` | BOOLEAN | DEFAULT FALSE | Whether user is whitelisted for access |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp (UTC) |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp (UTC) |

### Service Registry Table

The `service_registry` table controls which downstream services can access user GitHub tokens.

```prisma
model ServiceRegistry {
  id                     String    @id @default(uuid()) @db.Uuid
  serviceIdentifier      String    @unique @map("service_identifier") @db.VarChar(255)
  hashedApiKey           String    @map("hashed_api_key") @db.Text
  allowedScopes          String[]  @default([]) @map("allowed_scopes")
  isActive               Boolean   @default(true) @map("is_active")
  description            String?   @db.Text
  createdAt              DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt              DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  lastUsedAt             DateTime? @map("last_used_at") @db.Timestamptz(6)

  @@index([serviceIdentifier])
  @@index([isActive])
  @@map("service_registry")
}
```

#### Column Descriptions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique identifier for the service |
| `service_identifier` | VARCHAR(255) | UNIQUE, NOT NULL | Human-readable service name |
| `hashed_api_key` | TEXT | NOT NULL | Bcrypt-hashed API key (12 rounds) |
| `allowed_scopes` | TEXT[] | DEFAULT [] | Future: scopes this service can access |
| `is_active` | BOOLEAN | DEFAULT TRUE | Whether service is active |
| `description` | TEXT | NULLABLE | Human-readable description |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp (UTC) |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp (UTC) |
| `last_used_at` | TIMESTAMPTZ | NULLABLE | Last time service accessed API |

### Service Audit Logs Table

The `service_audit_logs` table provides an audit trail of all service registry access attempts.

```prisma
model ServiceAuditLog {
  id                     String    @id @default(uuid()) @db.Uuid
  serviceId              String    @map("service_id") @db.Uuid
  userId                 String    @map("user_id") @db.Uuid
  action                 String    @db.VarChar(100)
  success                Boolean   @default(true)
  errorMessage           String?   @map("error_message") @db.Text
  ipAddress              String?   @map("ip_address") @db.VarChar(45)
  userAgent              String?   @map("user_agent") @db.Text
  createdAt              DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([serviceId])
  @@index([userId])
  @@index([createdAt])
  @@index([success])
  @@map("service_audit_logs")
}
```

#### Column Descriptions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique identifier for the log entry |
| `service_id` | UUID | NOT NULL | Service that made the request |
| `user_id` | UUID | NOT NULL | User whose token was requested |
| `action` | VARCHAR(100) | NOT NULL | Action performed (e.g., "github_token_access") |
| `success` | BOOLEAN | DEFAULT TRUE | Whether the action succeeded |
| `error_message` | TEXT | NULLABLE | Error message if action failed |
| `ip_address` | VARCHAR(45) | NULLABLE | IP address of requester |
| `user_agent` | TEXT | NULLABLE | User agent of requester |
| `created_at` | TIMESTAMPTZ | NOT NULL | Timestamp of the action |

### Design Decisions

1. **UUID Primary Key**: UUIDs are used instead of sequential integers to prevent enumeration attacks and allow for distributed ID generation.

2. **GitHub User ID Uniqueness**: The `github_user_id` field has a unique constraint to prevent duplicate GitHub accounts from being registered.

3. **Whitelist Flag**: The `is_whitelisted` field defaults to `false` to implement a secure-by-default approach where new users must be explicitly granted access.

4. **Timestamps in UTC**: All timestamps are stored in UTC (`TIMESTAMPTZ`) to avoid issues with clock drift, time zones, and daylight saving time changes.

5. **Nullable Tokens**: Token fields are nullable to support users who haven't completed authentication or whose tokens have been revoked.

6. **Bcrypt for API Keys**: Service API keys are hashed using bcrypt with 12 rounds before storage for security.

7. **Audit Indexing**: Service audit logs are indexed on serviceId, userId, createdAt, and success for efficient querying.

## Local Development Setup

### Prerequisites

- Node.js 18+ 
- PostgreSQL 14+ (or use Docker)
- npm or yarn

### Database Setup

#### Option 1: Using Docker

```bash
# Start PostgreSQL container
docker run --name af-auth-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=af_auth \
  -p 5432:5432 \
  -d postgres:16-alpine

# Verify container is running
docker ps | grep af-auth-postgres
```

#### Option 2: Local PostgreSQL Installation

```bash
# Create database (adjust for your OS)
createdb af_auth

# Or using psql
psql -U postgres -c "CREATE DATABASE af_auth;"
```

### Environment Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Update the `DATABASE_URL` in `.env`:
   ```
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/af_auth
   ```

### Running Migrations

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run migrations (development)
npm run db:migrate:dev

# Run migrations (production)
npm run db:migrate
```

### Migration Management

Migrations are stored in the `prisma/migrations` directory and are automatically applied in the order they were created.

#### Creating New Migrations

```bash
# Create a new migration
npm run db:migrate:dev --name describe_your_changes
```

#### Checking Migration Status

```bash
# View migration history
npx prisma migrate status
```

#### Idempotent Migrations

All migrations are designed to be idempotent where possible. The initial migration uses `CREATE TABLE IF NOT EXISTS` patterns to allow safe re-runs.

### Database Studio

Prisma Studio provides a GUI for viewing and editing data:

```bash
npm run db:studio
```

Access at `http://localhost:5555`

## Cloud SQL Setup

For production deployment on Google Cloud Platform:

### Creating Cloud SQL Instance

```bash
# Set variables
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export INSTANCE_NAME="af-auth-db"

# Create PostgreSQL instance
gcloud sql instances create ${INSTANCE_NAME} \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=${REGION} \
  --root-password="$(openssl rand -base64 32)" \
  --backup-start-time=02:00 \
  --enable-bin-log \
  --retained-backups-count=30 \
  --database-flags=max_connections=100

# Create database
gcloud sql databases create af_auth \
  --instance=${INSTANCE_NAME}

# Get connection name (needed for Cloud Run)
gcloud sql instances describe ${INSTANCE_NAME} \
  --format='value(connectionName)'
# Output: project-id:region:instance-name
```

### IAM Authentication (Recommended)

Use Cloud IAM for secure, keyless database authentication:

```bash
# Create service account for Cloud Run
gcloud iam service-accounts create af-auth-sa \
  --display-name="AF Auth Service Account"

# Get service account email
export SA_EMAIL="af-auth-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Create database user with IAM authentication
gcloud sql users create ${SA_EMAIL} \
  --instance=${INSTANCE_NAME} \
  --type=CLOUD_IAM_SERVICE_ACCOUNT

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudsql.client"
```

Connect to database and grant permissions:

```sql
-- Connect via Cloud SQL Proxy or direct connection
GRANT ALL PRIVILEGES ON DATABASE af_auth TO "af-auth-sa@project-id.iam.gserviceaccount.com";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "af-auth-sa@project-id.iam.gserviceaccount.com";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "af-auth-sa@project-id.iam.gserviceaccount.com";
```

Connection string with IAM auth:

```
postgresql://af-auth-sa@project-id.iam.gserviceaccount.com@/af_auth?host=/cloudsql/project-id:region:instance-name&sslmode=disable
```

### SSL/TLS Configuration

For public IP connections, enforce SSL:

```bash
# Require SSL connections
gcloud sql instances patch ${INSTANCE_NAME} \
  --require-ssl

# Download server certificate
gcloud sql ssl-certs create client-cert client-key.pem \
  --instance=${INSTANCE_NAME}

# Get server CA certificate
gcloud sql ssl-certs list --instance=${INSTANCE_NAME}
```

Connection string with SSL:

```
postgresql://user:password@public-ip:5432/af_auth?sslmode=require&sslrootcert=server-ca.pem&sslcert=client-cert.pem&sslkey=client-key.pem
```

### Private IP (VPC)

For enhanced security, use private IP:

```bash
# Enable private IP
gcloud sql instances patch ${INSTANCE_NAME} \
  --network=projects/${PROJECT_ID}/global/networks/default \
  --no-assign-ip

# Create VPC connector for Cloud Run
gcloud compute networks vpc-access connectors create af-auth-connector \
  --region=${REGION} \
  --network=default \
  --range=10.8.0.0/28

# Configure Cloud Run to use VPC connector
gcloud run services update af-auth \
  --region=${REGION} \
  --vpc-connector=af-auth-connector \
  --vpc-egress=private-ranges-only
```

### Running Migrations on Cloud SQL

#### Option A: Cloud SQL Proxy (Local)

```bash
# Download Cloud SQL Proxy
curl -o cloud_sql_proxy https://dl.google.com/cloudsql/cloud_sql_proxy.linux.amd64
chmod +x cloud_sql_proxy

# Start proxy
./cloud_sql_proxy -instances=${PROJECT_ID}:${REGION}:${INSTANCE_NAME}=tcp:5432 &

# Run migrations
DATABASE_URL="postgresql://user:password@localhost:5432/af_auth" npm run db:migrate

# Stop proxy
killall cloud_sql_proxy
```

#### Option B: Cloud Run Jobs (Recommended)

```bash
# Create migration job
gcloud run jobs create af-auth-migrate \
  --image=us-central1-docker.pkg.dev/${PROJECT_ID}/af-auth/af-auth:latest \
  --region=${REGION} \
  --service-account=${SA_EMAIL} \
  --set-secrets="DATABASE_URL=database-url:latest" \
  --add-cloudsql-instances=${PROJECT_ID}:${REGION}:${INSTANCE_NAME} \
  --task-timeout=5m \
  --command=npm \
  --args="run,db:migrate"

# Execute migration
gcloud run jobs execute af-auth-migrate --region=${REGION}

# View logs
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=af-auth-migrate" \
  --limit=50
```

### SQL Schema Creation

If not using Prisma migrations, create tables manually:

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_user_id BIGINT UNIQUE NOT NULL,
  github_access_token TEXT,
  github_refresh_token TEXT,
  github_token_expires_at TIMESTAMPTZ,
  is_whitelisted BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_github_user_id ON users(github_user_id);
CREATE INDEX IF NOT EXISTS idx_users_is_whitelisted ON users(is_whitelisted);

-- Service registry table
CREATE TABLE IF NOT EXISTS service_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_identifier VARCHAR(255) UNIQUE NOT NULL,
  hashed_api_key TEXT NOT NULL,
  allowed_scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_registry_identifier ON service_registry(service_identifier);
CREATE INDEX IF NOT EXISTS idx_service_registry_is_active ON service_registry(is_active);

-- Service audit logs table
CREATE TABLE IF NOT EXISTS service_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  success BOOLEAN DEFAULT TRUE NOT NULL,
  error_message TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_service_audit_logs_service_id ON service_audit_logs(service_id);
CREATE INDEX IF NOT EXISTS idx_service_audit_logs_user_id ON service_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_service_audit_logs_created_at ON service_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_service_audit_logs_success ON service_audit_logs(success);

-- Trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_registry_updated_at
  BEFORE UPDATE ON service_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Connectivity Verification

Test database connectivity from Cloud Run:

```bash
# Deploy test service
gcloud run deploy af-auth-test \
  --image=gcr.io/cloudsql-docker/gce-proxy:latest \
  --region=${REGION} \
  --service-account=${SA_EMAIL} \
  --add-cloudsql-instances=${PROJECT_ID}:${REGION}:${INSTANCE_NAME} \
  --command="/cloud_sql_proxy" \
  --args="${PROJECT_ID}:${REGION}:${INSTANCE_NAME}"

# Check logs for successful connection
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=af-auth-test" \
  --limit=10
```

## Connection Pooling

The database client is configured with connection pooling for optimal performance:

- **Minimum connections**: 2 (configurable via `DB_POOL_MIN`)
- **Maximum connections**: 10 (configurable via `DB_POOL_MAX`)
- **Connection timeout**: 5000ms (configurable via `DB_CONNECTION_TIMEOUT_MS`)

### Retry Logic

The database connection implements exponential backoff retry logic:

- **Max retries**: 3 (configurable via `DB_MAX_RETRIES`)
- **Base retry delay**: 1000ms (configurable via `DB_RETRY_DELAY_MS`)
- **Backoff strategy**: Exponential (delay × 2^attempt)

Example retry sequence:
1. Initial attempt (0ms)
2. First retry (1000ms delay)
3. Second retry (2000ms delay)
4. Third retry (4000ms delay)

## Production Considerations

### Security

1. **Token Storage**: Consider encrypting `github_access_token` and `github_refresh_token` at the application layer before storing in the database.

2. **Connection Strings**: Never commit `.env` files with production credentials. Use secret management systems (e.g., Google Secret Manager, AWS Secrets Manager).

3. **Least Privilege**: Database user should have minimal required permissions:
   ```sql
   CREATE USER af_auth_app WITH PASSWORD 'strong_password';
   GRANT CONNECT ON DATABASE af_auth TO af_auth_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO af_auth_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO af_auth_app;
   ```

### Backups

1. **Automated Backups**: Configure regular database backups (daily recommended).

2. **Point-in-Time Recovery**: Enable WAL archiving for PostgreSQL.

3. **Backup Testing**: Regularly test backup restoration procedures.

4. **Backup Before Migrations**: Always backup production data before running migrations:
   ```bash
   pg_dump -U postgres af_auth > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

### Migration Safety

1. **Test Migrations**: Always test migrations on a staging environment first.

2. **Rollback Plan**: Have a rollback plan for each migration. Avoid destructive changes when possible.

3. **Zero-Downtime Migrations**: For production:
   - Add columns as nullable first
   - Backfill data in a separate step
   - Add NOT NULL constraints after backfilling
   - Remove columns in subsequent releases

### Monitoring

Monitor these metrics in production:

- Connection pool utilization
- Query performance (slow query log)
- Database size and growth rate
- Failed connection attempts
- Lock contention

## Troubleshooting

### Connection Failures

If the service cannot connect to the database:

1. Check the `DATABASE_URL` is correct
2. Verify PostgreSQL is running: `pg_isready -h localhost -p 5432`
3. Check network connectivity and firewall rules
4. Review logs for specific error messages

### Migration Failures

If a migration fails:

1. Check the migration status: `npx prisma migrate status`
2. Review the migration file for syntax errors
3. Resolve schema conflicts manually if needed
4. Use `npx prisma migrate resolve` for marking migrations as applied/rolled back

### Duplicate GitHub ID Errors

If a duplicate `github_user_id` error occurs:

1. Check if the user already exists: `SELECT * FROM users WHERE github_user_id = ?`
2. If duplicate exists, consider merging accounts or using the existing record
3. Implement application-level checks before attempting INSERT

### Clock Drift Issues

If token expiry times seem incorrect:

1. Verify all servers use NTP for time synchronization
2. Check that timestamps are stored in UTC (TIMESTAMPTZ)
3. Use `NOW()` or `CURRENT_TIMESTAMP` for database-generated timestamps

## Schema Evolution

As the application evolves, schema changes should follow these principles:

1. **Backward Compatibility**: New columns should be nullable or have defaults
2. **Incremental Changes**: Break large schema changes into smaller migrations
3. **Documentation**: Update this document when schema changes
4. **Versioning**: Use semantic versioning for schema versions

## References

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
