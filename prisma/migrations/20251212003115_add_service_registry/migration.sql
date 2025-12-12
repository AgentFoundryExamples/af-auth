-- CreateTable: service_registry for managing authorized downstream services
-- This migration is idempotent and safe to re-run
--
-- Purpose: Add support for service registry to control which downstream services
-- can retrieve GitHub access tokens on behalf of users. Includes audit logging.
--
-- Security considerations:
-- - API keys are stored as bcrypt hashes, never in plaintext
-- - All access attempts are logged with service ID and user UUID only (no tokens)
-- - Service credentials should be rotated regularly
-- - Audit logs should be retained for compliance requirements

-- Create service_registry table for authorized downstream services
CREATE TABLE IF NOT EXISTS "service_registry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_identifier" VARCHAR(255) NOT NULL,
    "hashed_api_key" TEXT NOT NULL,
    "allowed_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "service_registry_pkey" PRIMARY KEY ("id")
);

-- Create service_audit_logs table for tracking all access attempts
CREATE TABLE IF NOT EXISTS "service_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_audit_logs_pkey" PRIMARY KEY ("id")
);

-- Create unique index on service_identifier for fast lookups and to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS "service_registry_service_identifier_key" ON "service_registry"("service_identifier");

-- Create index on service_identifier for query performance (redundant with unique index above but explicit)
CREATE INDEX IF NOT EXISTS "service_registry_service_identifier_idx" ON "service_registry"("service_identifier");

-- Create index on is_active for filtering active services
CREATE INDEX IF NOT EXISTS "service_registry_is_active_idx" ON "service_registry"("is_active");

-- Create indexes for audit log queries
CREATE INDEX IF NOT EXISTS "service_audit_logs_service_id_idx" ON "service_audit_logs"("service_id");
CREATE INDEX IF NOT EXISTS "service_audit_logs_user_id_idx" ON "service_audit_logs"("user_id");
CREATE INDEX IF NOT EXISTS "service_audit_logs_created_at_idx" ON "service_audit_logs"("created_at");
CREATE INDEX IF NOT EXISTS "service_audit_logs_success_idx" ON "service_audit_logs"("success");

-- Create trigger to automatically update updated_at timestamp for service_registry
CREATE OR REPLACE FUNCTION update_service_registry_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_service_registry_updated_at ON "service_registry";
CREATE TRIGGER update_service_registry_updated_at
    BEFORE UPDATE ON "service_registry"
    FOR EACH ROW
    EXECUTE FUNCTION update_service_registry_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE "service_registry" IS 'Registry of authorized downstream services that can retrieve GitHub access tokens';
COMMENT ON COLUMN "service_registry"."id" IS 'Primary key - UUID';
COMMENT ON COLUMN "service_registry"."service_identifier" IS 'Unique identifier for the service (e.g., "analytics-service", "ci-pipeline")';
COMMENT ON COLUMN "service_registry"."hashed_api_key" IS 'Bcrypt hash of the service API key - never store plaintext';
COMMENT ON COLUMN "service_registry"."allowed_scopes" IS 'Array of scopes this service is allowed to access (for future use)';
COMMENT ON COLUMN "service_registry"."is_active" IS 'Whether this service is currently active and allowed to access the API';
COMMENT ON COLUMN "service_registry"."description" IS 'Human-readable description of the service purpose';
COMMENT ON COLUMN "service_registry"."created_at" IS 'Record creation timestamp in UTC';
COMMENT ON COLUMN "service_registry"."updated_at" IS 'Record last update timestamp in UTC - auto-updated by trigger';
COMMENT ON COLUMN "service_registry"."last_used_at" IS 'Timestamp of last successful API access by this service';

COMMENT ON TABLE "service_audit_logs" IS 'Audit log of all service access attempts to GitHub token API';
COMMENT ON COLUMN "service_audit_logs"."id" IS 'Primary key - UUID';
COMMENT ON COLUMN "service_audit_logs"."service_id" IS 'ID of the service making the request';
COMMENT ON COLUMN "service_audit_logs"."user_id" IS 'ID of the user whose token was requested';
COMMENT ON COLUMN "service_audit_logs"."action" IS 'Action performed (e.g., "retrieve_github_token")';
COMMENT ON COLUMN "service_audit_logs"."success" IS 'Whether the request was successful';
COMMENT ON COLUMN "service_audit_logs"."error_message" IS 'Error message if the request failed (no sensitive data)';
COMMENT ON COLUMN "service_audit_logs"."ip_address" IS 'IP address of the requesting service';
COMMENT ON COLUMN "service_audit_logs"."user_agent" IS 'User agent of the requesting service';
COMMENT ON COLUMN "service_audit_logs"."created_at" IS 'Timestamp of the access attempt in UTC';
