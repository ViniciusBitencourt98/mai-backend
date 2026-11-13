CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TABLE "tasks" (
 "id" UUID NOT NULL PRIMARY KEY,
 "title" VARCHAR(200) NOT NULL,
 "description" TEXT,
 "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
 "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
 "start_date" DATE,
 "due_date" DATE,
 "completed_at" TIMESTAMPTZ(3),
 "owner_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "project_id" UUID,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL,
 "archived_at" TIMESTAMPTZ(3),
 CONSTRAINT "tasks_project_id_owner_id_fkey" FOREIGN KEY ("project_id", "owner_id") REFERENCES "projects"("id", "owner_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "tasks_dates_check" CHECK ("due_date" IS NULL OR "start_date" IS NULL OR "due_date" >= "start_date"),
 CONSTRAINT "tasks_completion_check" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL))
);
CREATE INDEX "tasks_owner_id_status_due_date_idx" ON "tasks"("owner_id", "status", "due_date");
CREATE INDEX "tasks_owner_id_priority_idx" ON "tasks"("owner_id", "priority");
CREATE INDEX "tasks_owner_id_due_date_idx" ON "tasks"("owner_id", "due_date");
CREATE INDEX "tasks_owner_id_project_id_idx" ON "tasks"("owner_id", "project_id");
CREATE INDEX "tasks_owner_id_created_at_idx" ON "tasks"("owner_id", "created_at");
CREATE INDEX "tasks_owner_id_updated_at_idx" ON "tasks"("owner_id", "updated_at");
CREATE TABLE "subtasks" (
 "id" UUID NOT NULL PRIMARY KEY,
 "task_id" UUID NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "title" VARCHAR(200) NOT NULL,
 "completed" BOOLEAN NOT NULL DEFAULT false,
 "position" INTEGER NOT NULL CHECK ("position" >= 0),
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "subtasks_order_key" UNIQUE ("task_id", "position") DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX "subtasks_task_id_position_idx" ON "subtasks"("task_id", "position");
