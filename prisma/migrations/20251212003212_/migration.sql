-- DropIndex
DROP INDEX "users_created_at_idx";

-- DropIndex
DROP INDEX "users_is_whitelisted_idx";

-- AlterTable
ALTER TABLE "service_audit_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "service_registry" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;
