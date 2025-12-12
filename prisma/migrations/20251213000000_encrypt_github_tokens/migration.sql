-- Migration: Encrypt GitHub Tokens
-- This migration updates the schema comments to reflect that tokens are now encrypted
-- The actual encryption of existing data is handled by the migration script

-- Update comments to reflect encrypted storage
COMMENT ON COLUMN "users"."github_access_token" IS 'Encrypted GitHub OAuth access token (AES-256-GCM). Encrypted at application layer before storage.';
COMMENT ON COLUMN "users"."github_refresh_token" IS 'Encrypted GitHub OAuth refresh token (AES-256-GCM). Encrypted at application layer before storage.';

-- Note: No schema changes required as tokens were already stored as TEXT fields
-- The encryption is transparent at the database level
-- See: scripts/migrate-encrypt-tokens.ts for data migration procedure
