CREATE TABLE "events" (
 "id" UUID NOT NULL PRIMARY KEY, "title" VARCHAR(200) NOT NULL, "description" TEXT,
 "start_at" TIMESTAMPTZ(3) NOT NULL, "end_at" TIMESTAMPTZ(3) NOT NULL,
 "timezone" VARCHAR(100) NOT NULL, "location" VARCHAR(1000),
 "owner_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "project_id" UUID,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL, "archived_at" TIMESTAMPTZ(3),
 CONSTRAINT "events_project_id_owner_id_fkey" FOREIGN KEY ("project_id","owner_id") REFERENCES "projects"("id","owner_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "events_times_check" CHECK ("end_at" > "start_at" AND "end_at" <= "start_at" + interval '2678400 seconds')
);
CREATE INDEX "events_owner_id_start_at_end_at_idx" ON "events"("owner_id","start_at","end_at");
CREATE INDEX "events_owner_id_end_at_idx" ON "events"("owner_id","end_at");
CREATE INDEX "events_owner_id_project_id_idx" ON "events"("owner_id","project_id");
CREATE TABLE "event_recurrences" (
 "id" UUID NOT NULL PRIMARY KEY, "event_id" UUID NOT NULL REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "version" INTEGER NOT NULL CHECK ("version" BETWEEN 1 AND 100),
 "frequency" "TaskRecurrenceFrequency" NOT NULL, "interval" INTEGER NOT NULL DEFAULT 1 CHECK ("interval" BETWEEN 1 AND 365),
 "start_date" DATE NOT NULL, "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[], "end_date" DATE,
 "count" INTEGER CHECK ("count" BETWEEN 1 AND 10000), "timezone" VARCHAR(100) NOT NULL,
 "anchor_start_at" TIMESTAMPTZ(3) NOT NULL, "anchor_end_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "event_recurrences_times_check" CHECK ("anchor_end_at" > "anchor_start_at" AND "anchor_end_at" <= "anchor_start_at" + interval '2678400 seconds'),
 "state" "TaskRecurrenceState" NOT NULL DEFAULT 'ACTIVE',
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "event_recurrences_dates_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"),
 CONSTRAINT "event_recurrences_weekdays_check" CHECK (("frequency"='WEEKLY' AND cardinality("weekdays") BETWEEN 1 AND 7 AND "weekdays" <@ ARRAY[1,2,3,4,5,6,7]) OR ("frequency"<>'WEEKLY' AND cardinality("weekdays")=0))
);
CREATE UNIQUE INDEX "event_recurrences_event_id_version_key" ON "event_recurrences"("event_id","version");
CREATE TABLE "event_exceptions" (
 "rule_id" UUID NOT NULL REFERENCES "event_recurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE, "date" DATE NOT NULL,
 "title" VARCHAR(200) NOT NULL, "description" TEXT, "location" VARCHAR(1000),
 "start_at" TIMESTAMPTZ(3) NOT NULL, "end_at" TIMESTAMPTZ(3) NOT NULL, "cancelled" BOOLEAN NOT NULL DEFAULT false, "updated_at" TIMESTAMPTZ(3) NOT NULL,
 PRIMARY KEY ("rule_id","date"),
 CONSTRAINT "event_exceptions_times_check" CHECK ("end_at" > "start_at" AND "end_at" <= "start_at" + interval '2678400 seconds')
);
CREATE INDEX "event_exceptions_rule_id_start_at_end_at_idx" ON "event_exceptions"("rule_id","start_at","end_at");
