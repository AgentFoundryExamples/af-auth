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

### Design Decisions

1. **UUID Primary Key**: UUIDs are used instead of sequential integers to prevent enumeration attacks and allow for distributed ID generation.

2. **GitHub User ID Uniqueness**: The `github_user_id` field has a unique constraint to prevent duplicate GitHub accounts from being registered.

3. **Whitelist Flag**: The `is_whitelisted` field defaults to `false` to implement a secure-by-default approach where new users must be explicitly granted access.

4. **Timestamps in UTC**: All timestamps are stored in UTC (`TIMESTAMPTZ`) to avoid issues with clock drift, time zones, and daylight saving time changes.

5. **Nullable Tokens**: Token fields are nullable to support users who haven't completed authentication or whose tokens have been revoked.

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
