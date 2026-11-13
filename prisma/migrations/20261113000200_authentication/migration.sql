CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "disabled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"))
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "user_preferences" (
  "user_id" UUID NOT NULL,
  "timezone" VARCHAR(100) NOT NULL DEFAULT 'America/Bahia',
  "email_enabled" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);
CREATE TABLE "sessions" (
  "id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "user_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "auth_throttles" (
  "key" VARCHAR(100) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "auth_throttles_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "auth_throttles_expires_at_idx" ON "auth_throttles"("expires_at");
