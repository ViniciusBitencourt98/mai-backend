CREATE TYPE "TaskRecurrenceFrequency" AS ENUM ('DAILY','WEEKLY','MONTHLY','CUSTOM_DAYS');
CREATE TYPE "TaskRecurrenceState" AS ENUM ('ACTIVE','PAUSED','ENDED');
CREATE TABLE "task_recurrences" (
 "id" UUID NOT NULL PRIMARY KEY, "task_id" UUID NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "version" INTEGER NOT NULL CHECK ("version" BETWEEN 1 AND 100),
 "frequency" "TaskRecurrenceFrequency" NOT NULL, "interval" INTEGER NOT NULL DEFAULT 1 CHECK ("interval" BETWEEN 1 AND 365),
 "start_date" DATE NOT NULL, "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[], "end_date" DATE,
 "count" INTEGER CHECK ("count" BETWEEN 1 AND 10000), "timezone" VARCHAR(100) NOT NULL,
 "state" "TaskRecurrenceState" NOT NULL DEFAULT 'ACTIVE',
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "task_recurrences_dates_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"),
 CONSTRAINT "task_recurrences_weekdays_check" CHECK (("frequency"='WEEKLY' AND cardinality("weekdays") BETWEEN 1 AND 7 AND "weekdays" <@ ARRAY[1,2,3,4,5,6,7]) OR ("frequency"<>'WEEKLY' AND cardinality("weekdays")=0))
);
CREATE UNIQUE INDEX "task_recurrences_task_id_version_key" ON "task_recurrences"("task_id","version");
CREATE TABLE "task_occurrences" (
 "rule_id" UUID NOT NULL REFERENCES "task_recurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "date" DATE NOT NULL, "completed_at" TIMESTAMPTZ(3), "updated_at" TIMESTAMPTZ(3) NOT NULL,
 PRIMARY KEY ("rule_id","date")
);
CREATE TABLE "task_occurrence_events" (
 "id" UUID NOT NULL PRIMARY KEY, "rule_id" UUID NOT NULL, "date" DATE NOT NULL, "completed" BOOLEAN NOT NULL,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("rule_id","date") REFERENCES "task_occurrences"("rule_id","date") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "task_occurrence_events_rule_id_date_created_at_idx" ON "task_occurrence_events"("rule_id","date","created_at");
