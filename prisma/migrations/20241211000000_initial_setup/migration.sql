-- CreateTable: users table for GitHub OAuth authentication
-- This migration is idempotent and safe to re-run

-- ⚠️  SECURITY WARNING ⚠️
-- GitHub access tokens and refresh tokens are stored as PLAINTEXT in this schema.
-- This is NOT SECURE for production use. Before deploying to production:
-- 1. Implement application-level encryption for token fields
-- 2. Use a key management service (e.g., Google Cloud KMS, AWS KMS)
-- 3. Consider using PostgreSQL pgcrypto extension for database-level encryption
-- 4. Ensure proper key rotation and access controls
-- DO NOT store production tokens without encryption at rest!

-- Create extension for UUID generation if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "github_user_id" BIGINT NOT NULL,
    "github_access_token" TEXT,
    "github_refresh_token" TEXT,
    "github_token_expires_at" TIMESTAMPTZ(6),
    "is_whitelisted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Create unique index on github_user_id
CREATE UNIQUE INDEX IF NOT EXISTS "users_github_user_id_key" ON "users"("github_user_id");

-- Create index on is_whitelisted for faster filtering
CREATE INDEX IF NOT EXISTS "users_is_whitelisted_idx" ON "users"("is_whitelisted");

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users"("created_at");

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON "users";
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON "users"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE "users" IS 'Stores user authentication and GitHub OAuth data';
COMMENT ON COLUMN "users"."id" IS 'Primary key - UUID v4';
COMMENT ON COLUMN "users"."github_user_id" IS 'GitHub user ID from OAuth - must be unique';
COMMENT ON COLUMN "users"."github_access_token" IS '⚠️  WARNING: Currently stored as PLAINTEXT! Must implement encryption before production. GitHub OAuth access token.';
COMMENT ON COLUMN "users"."github_refresh_token" IS '⚠️  WARNING: Currently stored as PLAINTEXT! Must implement encryption before production. GitHub OAuth refresh token.';
COMMENT ON COLUMN "users"."github_token_expires_at" IS 'Token expiration timestamp in UTC';
COMMENT ON COLUMN "users"."is_whitelisted" IS 'Whether user is whitelisted for access - defaults to false';
COMMENT ON COLUMN "users"."created_at" IS 'Record creation timestamp in UTC';
COMMENT ON COLUMN "users"."updated_at" IS 'Record last update timestamp in UTC - auto-updated by trigger';
