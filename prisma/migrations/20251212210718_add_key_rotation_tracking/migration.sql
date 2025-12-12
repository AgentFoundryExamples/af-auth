-- CreateTable
CREATE TABLE "jwt_key_rotation" (
    "id" UUID NOT NULL,
    "key_identifier" VARCHAR(255) NOT NULL,
    "key_type" VARCHAR(50) NOT NULL,
    "last_rotated_at" TIMESTAMPTZ(6) NOT NULL,
    "next_rotation_due" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "rotation_interval_days" INTEGER,
    "metadata" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jwt_key_rotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jwt_key_rotation_key_identifier_key" ON "jwt_key_rotation"("key_identifier");

-- CreateIndex
CREATE INDEX "jwt_key_rotation_key_identifier_idx" ON "jwt_key_rotation"("key_identifier");

-- CreateIndex
CREATE INDEX "jwt_key_rotation_is_active_idx" ON "jwt_key_rotation"("is_active");

-- CreateIndex
CREATE INDEX "jwt_key_rotation_next_rotation_due_idx" ON "jwt_key_rotation"("next_rotation_due");

-- AlterTable
ALTER TABLE "service_registry" ADD COLUMN "last_api_key_rotated_at" TIMESTAMPTZ(6);
