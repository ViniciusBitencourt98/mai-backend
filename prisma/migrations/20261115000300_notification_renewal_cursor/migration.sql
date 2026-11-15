-- Additive internal maintenance cursor. No changes to existing notification states.
CREATE TABLE "notification_maintenance_cursors" (
  "name" VARCHAR(50) NOT NULL,
  "last_rule_id" UUID,
  CONSTRAINT "notification_maintenance_cursors_pkey" PRIMARY KEY ("name")
);
-- No FK: deleting a reminder rule must not invalidate maintenance progress.
