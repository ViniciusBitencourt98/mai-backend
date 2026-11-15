-- Persistent foundation only. No jobs, sends or domain backfill.
CREATE TYPE "NotificationSourceType" AS ENUM ('TASK','EVENT','PUBLICATION');
CREATE TYPE "NotificationType" AS ENUM ('TASK_REMINDER','EVENT_REMINDER','PUBLICATION_REMINDER','DAILY_DIGEST');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING','RESERVED','PUBLISHED','SENT','FAILED','CANCELLED');
CREATE TYPE "NotificationResult" AS ENUM ('CREATED','RESERVED','QUEUED','PROVIDER_ACCEPTED','FAILED','CANCELLED');
CREATE TYPE "NotificationFailureCategory" AS ENUM ('NETWORK','PROVIDER_REJECTED','INTERNAL','LEASE_EXPIRED','STALE','USER_CANCELLED');

CREATE TABLE "reminder_rules" (
 "id" UUID NOT NULL,
 "owner_id" UUID NOT NULL,
 "source_type" "NotificationSourceType" NOT NULL,
 "source_id" UUID NOT NULL,
 "lead_minutes" INTEGER NOT NULL,
 "enabled" BOOLEAN NOT NULL DEFAULT true,
 "version" INTEGER NOT NULL DEFAULT 1,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "reminder_rules_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "reminder_rules_limits_check" CHECK ("lead_minutes" BETWEEN 0 AND 43200 AND "version">0)
);
CREATE UNIQUE INDEX "reminder_rules_owner_id_source_type_source_id_key" ON "reminder_rules"("owner_id","source_type","source_id");
CREATE UNIQUE INDEX "reminder_rules_id_owner_id_key" ON "reminder_rules"("id","owner_id");
ALTER TABLE "reminder_rules" ADD CONSTRAINT "reminder_rules_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "notification_outbox" (
 "id" UUID NOT NULL,
 "owner_id" UUID NOT NULL,
 "type" "NotificationType" NOT NULL,
 "source_type" "NotificationSourceType",
 "source_id" UUID,
 "reminder_rule_id" UUID,
 "rule_version" INTEGER,
 "source_version" CHAR(64) NOT NULL,
 "recurrence_rule_id" UUID,
 "recurrence_version" INTEGER,
 "occurrence_date" DATE,
 "digest_date" DATE,
 "timezone" VARCHAR(100) NOT NULL,
 "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
 "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
 "idempotency_key" CHAR(64) NOT NULL,
 "lease_token" UUID,
 "lease_until" TIMESTAMPTZ(3),
 "reserved_from" "NotificationStatus",
 "attempt_count" INTEGER NOT NULL DEFAULT 0,
 "published_at" TIMESTAMPTZ(3),
 "sent_at" TIMESTAMPTZ(3),
 "failed_at" TIMESTAMPTZ(3),
 "cancelled_at" TIMESTAMPTZ(3),
 "last_error" "NotificationFailureCategory",
 "provider_message_id" VARCHAR(200),
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "notification_outbox_hash_check" CHECK ("source_version" ~ '^[0-9a-f]{64}$' AND "idempotency_key" ~ '^[0-9a-f]{64}$'),
 CONSTRAINT "notification_outbox_identity_check" CHECK (
  ("type"='DAILY_DIGEST' AND "digest_date" IS NOT NULL AND "source_type" IS NULL AND "source_id" IS NULL AND "reminder_rule_id" IS NULL AND "rule_version" IS NULL AND "recurrence_rule_id" IS NULL AND "recurrence_version" IS NULL AND "occurrence_date" IS NULL)
  OR ("type"<>'DAILY_DIGEST' AND "digest_date" IS NULL AND "source_type" IS NOT NULL AND "source_id" IS NOT NULL AND "reminder_rule_id" IS NOT NULL AND "rule_version" IS NOT NULL AND "rule_version">0 AND "type"::text="source_type"::text||'_REMINDER')
 ),
 CONSTRAINT "notification_outbox_occurrence_check" CHECK (
  ("recurrence_rule_id" IS NULL AND "recurrence_version" IS NULL AND "occurrence_date" IS NULL)
  OR ("recurrence_rule_id" IS NOT NULL AND "recurrence_version" IS NOT NULL AND "recurrence_version">0 AND "occurrence_date" IS NOT NULL AND "source_type" IN ('TASK','EVENT'))
 ),
 CONSTRAINT "notification_outbox_lease_check" CHECK (
  ("status"='RESERVED' AND "lease_token" IS NOT NULL AND "lease_until" IS NOT NULL AND "reserved_from" IS NOT NULL AND "reserved_from" IN ('PENDING','PUBLISHED'))
  OR ("status"<>'RESERVED' AND "lease_token" IS NULL AND "lease_until" IS NULL AND "reserved_from" IS NULL)
 ),
 CONSTRAINT "notification_outbox_terminal_check" CHECK (
  ("status"='SENT')=("sent_at" IS NOT NULL) AND ("status"='FAILED')=("failed_at" IS NOT NULL) AND ("status"='CANCELLED')=("cancelled_at" IS NOT NULL)
  AND ("status"='SENT')=("provider_message_id" IS NOT NULL)
  AND ("status" IN ('FAILED','CANCELLED'))=("last_error" IS NOT NULL)
  AND ("status" NOT IN ('PUBLISHED','SENT') OR "published_at" IS NOT NULL)
  AND ("status"<>'RESERVED' OR "reserved_from"<>'PUBLISHED' OR "published_at" IS NOT NULL)
  AND ("status"<>'PENDING' OR "published_at" IS NULL)
  AND ("provider_message_id" IS NULL OR length(btrim("provider_message_id"))>0)
  AND "attempt_count">=0
 )
);
CREATE UNIQUE INDEX "notification_outbox_owner_id_idempotency_key_key" ON "notification_outbox"("owner_id","idempotency_key");
CREATE UNIQUE INDEX "notification_outbox_owner_id_type_digest_date_key" ON "notification_outbox"("owner_id","type","digest_date");
CREATE UNIQUE INDEX "notification_outbox_id_owner_id_key" ON "notification_outbox"("id","owner_id");
CREATE INDEX "notification_outbox_status_scheduled_at_idx" ON "notification_outbox"("status","scheduled_at");
CREATE INDEX "notification_outbox_status_lease_until_idx" ON "notification_outbox"("status","lease_until");
CREATE INDEX "notification_outbox_owner_id_scheduled_at_id_idx" ON "notification_outbox"("owner_id","scheduled_at","id");
CREATE INDEX "notification_outbox_owner_id_reminder_rule_id_status_idx" ON "notification_outbox"("owner_id","reminder_rule_id","status");
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_reminder_rule_id_owner_id_fkey" FOREIGN KEY ("reminder_rule_id","owner_id") REFERENCES "reminder_rules"("id","owner_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "notification_delivery_log" (
 "id" UUID NOT NULL,
 "outbox_id" UUID NOT NULL,
 "owner_id" UUID NOT NULL,
 "status" "NotificationStatus" NOT NULL,
 "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "result" "NotificationResult" NOT NULL,
 "error_category" "NotificationFailureCategory",
 "provider_message_id" VARCHAR(200),
 CONSTRAINT "notification_delivery_log_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "notification_delivery_log_result_check" CHECK (
  ("status"='PENDING' AND "result"='CREATED') OR ("status"='RESERVED' AND "result"='RESERVED')
  OR ("status"='PUBLISHED' AND "result"='QUEUED') OR ("status"='SENT' AND "result"='PROVIDER_ACCEPTED')
  OR ("status"='FAILED' AND "result"='FAILED') OR ("status"='CANCELLED' AND "result"='CANCELLED')
 ),
 CONSTRAINT "notification_delivery_log_detail_check" CHECK (("status" IN ('FAILED','CANCELLED'))=("error_category" IS NOT NULL) AND ("status"='SENT')=("provider_message_id" IS NOT NULL))
);
CREATE INDEX "notification_delivery_log_owner_id_outbox_id_attempted_at_id_idx" ON "notification_delivery_log"("owner_id","outbox_id","attempted_at","id");
ALTER TABLE "notification_delivery_log" ADD CONSTRAINT "notification_delivery_log_outbox_id_owner_id_fkey" FOREIGN KEY ("outbox_id","owner_id") REFERENCES "notification_outbox"("id","owner_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
