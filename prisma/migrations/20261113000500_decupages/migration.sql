CREATE TABLE "decupages" (
  "id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "owner_id" UUID NOT NULL,
  "project_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "archived_at" TIMESTAMPTZ(3),
  CONSTRAINT "decupages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "decupages_owner_id_archived_at_updated_at_idx" ON "decupages"("owner_id", "archived_at", "updated_at");
CREATE INDEX "decupages_owner_id_created_at_idx" ON "decupages"("owner_id", "created_at");
CREATE INDEX "decupages_owner_id_updated_at_idx" ON "decupages"("owner_id", "updated_at");
CREATE INDEX "decupages_owner_id_project_id_idx" ON "decupages"("owner_id", "project_id");
CREATE INDEX "decupages_tags_idx" ON "decupages" USING GIN ("tags");
ALTER TABLE "decupages" ADD CONSTRAINT "decupages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decupages" ADD CONSTRAINT "decupages_project_id_owner_id_fkey" FOREIGN KEY ("project_id", "owner_id") REFERENCES "projects"("id", "owner_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "decupage_segments" (
 "id" UUID NOT NULL PRIMARY KEY,
 "decupage_id" UUID NOT NULL REFERENCES "decupages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "position" INTEGER NOT NULL CHECK ("position" >= 0),
 "start_ms" INTEGER NOT NULL CHECK ("start_ms" >= 0),
 "end_ms" INTEGER CHECK ("end_ms" IS NULL OR "end_ms" >= "start_ms"),
 "description" TEXT NOT NULL DEFAULT '',
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "decupage_segments_order_key" UNIQUE ("decupage_id", "position") DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX "decupage_segments_decupage_id_position_idx" ON "decupage_segments"("decupage_id", "position");
