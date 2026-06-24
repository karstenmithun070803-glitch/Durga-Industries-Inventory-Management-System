ALTER TABLE "material_issue_items" ADD COLUMN "stage_id" uuid;--> statement-breakpoint
ALTER TABLE "material_issue_items" ADD CONSTRAINT "material_issue_items_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mii_stage_id" ON "material_issue_items" USING btree ("stage_id");