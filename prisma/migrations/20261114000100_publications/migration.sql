-- TASK-BE-012: additive editorial model. No data changes to existing tables.
CREATE TYPE "PublicationPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'LINKEDIN', 'OTHER');
CREATE TYPE "PublicationFormat" AS ENUM ('SHORT_VIDEO', 'LONG_VIDEO', 'REELS', 'STORIES', 'CAROUSEL', 'IMAGE', 'TEXT', 'OTHER');
CREATE TYPE "PublicationStatus" AS ENUM ('IDEA', 'PLANNED', 'IN_PRODUCTION', 'READY', 'PUBLISHED', 'CANCELLED');

CREATE TABLE "publications" (
  "id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "caption" TEXT,
  "platform" "PublicationPlatform" NOT NULL,
  "format" "PublicationFormat" NOT NULL,
  "status" "PublicationStatus" NOT NULL DEFAULT 'IDEA',
  "scheduled_at" TIMESTAMPTZ(3),
  "published_at" TIMESTAMPTZ(3),
  "external_url" VARCHAR(2000),
  "notes" TEXT,
  "project_id" UUID,
  "owner_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "archived_at" TIMESTAMPTZ(3),
  CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "publications_owner_id_archived_at_scheduled_at_idx" ON "publications"("owner_id", "archived_at", "scheduled_at");
CREATE INDEX "publications_owner_id_scheduled_at_idx" ON "publications"("owner_id", "scheduled_at");
CREATE INDEX "publications_owner_id_updated_at_idx" ON "publications"("owner_id", "updated_at");
CREATE INDEX "publications_owner_id_platform_scheduled_at_idx" ON "publications"("owner_id", "platform", "scheduled_at");
CREATE INDEX "publications_owner_id_format_scheduled_at_idx" ON "publications"("owner_id", "format", "scheduled_at");
CREATE INDEX "publications_owner_id_status_scheduled_at_idx" ON "publications"("owner_id", "status", "scheduled_at");
CREATE INDEX "publications_owner_id_project_id_idx" ON "publications"("owner_id", "project_id");
ALTER TABLE "publications" ADD CONSTRAINT "publications_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_project_id_owner_id_fkey" FOREIGN KEY ("project_id", "owner_id") REFERENCES "projects"("id", "owner_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
