# Database Migrations

This directory contains database migration files managed by Prisma.

## Migration Structure

Each migration is stored in a timestamped directory with the format:
```
YYYYMMDDHHMMSS_migration_name/
  └── migration.sql
```

## Running Migrations

### Development
```bash
npm run db:migrate:dev
```

This will:
1. Apply pending migrations
2. Generate Prisma Client
3. Prompt for migration names if creating new ones

### Production
```bash
npm run db:migrate
```

This will:
1. Apply pending migrations only
2. Fail if there are unapplied migrations that would cause data loss

## Creating New Migrations

### Automatic (Recommended)
1. Modify `prisma/schema.prisma`
2. Run `npm run db:migrate:dev --name your_migration_name`
3. Review the generated SQL in the new migration directory
4. Test the migration on a dev database

### Manual
1. Create a new directory: `prisma/migrations/YYYYMMDDHHMMSS_migration_name/`
2. Create `migration.sql` with your SQL commands
3. Run `npm run db:migrate:dev` to apply

## Migration Best Practices

1. **Idempotency**: Use `IF NOT EXISTS` and `IF EXISTS` clauses
2. **Data Safety**: Never drop tables or columns without backups
3. **Testing**: Test migrations on staging before production
4. **Rollback Plans**: Have a rollback strategy for each migration
5. **Downtime**: Design zero-downtime migrations when possible

## Migration Guidelines

### Adding Columns
```sql
-- Safe: Add nullable column
ALTER TABLE users ADD COLUMN IF NOT EXISTS new_column TEXT;

-- Safer: Add column with default
ALTER TABLE users ADD COLUMN IF NOT EXISTS new_column TEXT DEFAULT 'value';
```

### Removing Columns
```sql
-- WARNING: Test thoroughly before running
-- Phase 1: Stop using the column in application code
-- Phase 2: Deploy new code
-- Phase 3: Remove column after verification
ALTER TABLE users DROP COLUMN IF EXISTS old_column;
```

### Renaming Columns
```sql
-- Safer approach: Add new column, copy data, remove old
-- Phase 1: Add new column
ALTER TABLE users ADD COLUMN IF NOT EXISTS new_name TEXT;

-- Phase 2: Backfill data
UPDATE users SET new_name = old_name WHERE new_name IS NULL;

-- Phase 3: Update application code to use new_name
-- Deploy application

-- Phase 4: Remove old column (after verification)
ALTER TABLE users DROP COLUMN IF EXISTS old_name;
```

### Adding Indexes
```sql
-- Safe: Add index concurrently (PostgreSQL)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ON table(column);
```

## Checking Migration Status

```bash
npx prisma migrate status
```

This shows:
- Applied migrations
- Pending migrations
- Migration history

## Troubleshooting

### Failed Migration

If a migration fails:

1. Check the error message
2. Review the migration SQL
3. Fix the issue
4. Mark migration as rolled back:
   ```bash
   npx prisma migrate resolve --rolled-back MIGRATION_NAME
   ```
5. Rerun the migration

### Out of Sync Schema

If schema and database are out of sync:

1. Generate a new migration:
   ```bash
   npm run db:migrate:dev --name sync_schema
   ```

2. Review the generated SQL carefully
3. Apply if safe

### Manual Intervention Required

If you need to manually fix the database:

1. Make manual changes in the database
2. Mark migration as applied:
   ```bash
   npx prisma migrate resolve --applied MIGRATION_NAME
   ```

## Emergency Procedures

### Rollback Last Migration

1. Restore database from backup
2. Mark migration as rolled back
3. Fix the migration SQL
4. Reapply

### Skip Failed Migration

⚠️ **Only in emergencies**

```bash
npx prisma migrate resolve --applied MIGRATION_NAME
```

This marks a migration as applied without running it.

## Migration History

### 20241211000000_initial_setup
- Created `users` table with UUID primary key
- Added GitHub OAuth fields (user_id, access_token, refresh_token, expires_at)
- Added whitelist flag (default: false)
- Added timestamps (created_at, updated_at)
- Created unique index on github_user_id
- Created indexes on is_whitelisted and created_at
- Added auto-update trigger for updated_at

### 20251212003115_add_service_registry
- Created `service_registry` table for managing authorized downstream services
- Created `service_audit_logs` table for tracking all service access attempts
- Added bcrypt-hashed API keys for service authentication
- Added allowed_scopes field for future scope-based permissions
- Added is_active flag for soft-delete functionality
- Added last_used_at timestamp for tracking service usage
- Created indexes on service_identifier, is_active for query performance
- Created indexes on audit log fields (service_id, user_id, created_at, success)
- Added auto-update trigger for service_registry.updated_at
- Added comprehensive table and column comments for documentation

### 20251212003212_
- Schema sync migration created by Prisma
- Removed default values from UUID and timestamp fields to match Prisma's expectations
- Removed indexes on users table (users_created_at_idx, users_is_whitelisted_idx)

### 20251213000000_encrypt_github_tokens
- **Token Encryption Enhancement (v1.2)**
- Updated schema comments to reflect encrypted token storage
- No schema changes (encryption is transparent at database level)
- Tokens stored in encrypted format: `salt:iv:authTag:ciphertext`
- Uses AES-256-GCM authenticated encryption
- See `scripts/migrate-encrypt-tokens.ts` for data migration from plaintext tokens

## Token Encryption Migration

**Important**: If upgrading from a version prior to v1.2, you must encrypt existing plaintext tokens:

```bash
# Preview changes (recommended first step)
npm run migrate:encrypt-tokens -- --dry-run

# Apply encryption to existing tokens
npm run migrate:encrypt-tokens
```

The migration script:
- ✅ Is idempotent (safe to run multiple times)
- ✅ Validates encryption by round-trip decrypt before committing
- ✅ Skips already-encrypted tokens automatically
- ✅ Preserves null tokens
- ✅ Provides detailed logging

See [docs/security.md](../docs/security.md) for more information on token encryption and key rotation.
