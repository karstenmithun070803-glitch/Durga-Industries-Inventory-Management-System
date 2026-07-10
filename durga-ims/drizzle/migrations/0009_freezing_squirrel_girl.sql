ALTER TABLE "app_users" ADD COLUMN "role" text DEFAULT 'employee' NOT NULL;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "max_rate" numeric(14, 4);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_materials_name_lower" ON "materials" USING btree (lower(trim("name")));--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_role_valid" CHECK ("app_users"."role" IN ('admin', 'employee'));