CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TABLE "projects" (
  "id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "color" CHAR(7),
  "start_date" DATE,
  "due_date" DATE,
  "owner_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "archived_at" TIMESTAMPTZ(3),
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "projects_dates_check" CHECK ("due_date" IS NULL OR "start_date" IS NULL OR "due_date" >= "start_date"),
  CONSTRAINT "projects_archive_check" CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL))
);
CREATE INDEX "projects_owner_id_status_updated_at_idx" ON "projects"("owner_id", "status", "updated_at");
CREATE INDEX "projects_owner_id_updated_at_idx" ON "projects"("owner_id", "updated_at");
CREATE INDEX "projects_owner_id_name_idx" ON "projects"("owner_id", "name");
CREATE INDEX "projects_owner_id_created_at_idx" ON "projects"("owner_id", "created_at");
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
