-- CreateTable
CREATE TABLE "revoked_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jti" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "token_issued_at" TIMESTAMPTZ(6) NOT NULL,
    "token_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_by" VARCHAR(255),
    "reason" TEXT,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "revoked_tokens_jti_key" ON "revoked_tokens"("jti");

-- CreateIndex
CREATE INDEX "revoked_tokens_jti_idx" ON "revoked_tokens"("jti");

-- CreateIndex
CREATE INDEX "revoked_tokens_user_id_idx" ON "revoked_tokens"("user_id");

-- CreateIndex
CREATE INDEX "revoked_tokens_token_expires_at_idx" ON "revoked_tokens"("token_expires_at");

-- CreateIndex
CREATE INDEX "revoked_tokens_revoked_at_idx" ON "revoked_tokens"("revoked_at");
