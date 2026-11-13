CREATE UNIQUE INDEX "projects_id_owner_id_key" ON "projects"("id", "owner_id");
CREATE TABLE "notes" (
  "id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "owner_id" UUID NOT NULL,
  "project_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "archived_at" TIMESTAMPTZ(3),
  CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notes_owner_id_archived_at_updated_at_idx" ON "notes"("owner_id", "archived_at", "updated_at");
CREATE INDEX "notes_owner_id_created_at_idx" ON "notes"("owner_id", "created_at");
CREATE INDEX "notes_owner_id_updated_at_idx" ON "notes"("owner_id", "updated_at");
CREATE INDEX "notes_owner_id_project_id_idx" ON "notes"("owner_id", "project_id");
CREATE INDEX "notes_tags_idx" ON "notes" USING GIN ("tags");
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_project_id_owner_id_fkey" FOREIGN KEY ("project_id", "owner_id") REFERENCES "projects"("id", "owner_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
