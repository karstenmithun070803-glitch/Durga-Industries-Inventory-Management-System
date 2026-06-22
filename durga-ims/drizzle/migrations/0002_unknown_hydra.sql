CREATE TABLE "invoice_insurance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"bill_date" date NOT NULL,
	"tax_percentage" numeric(5, 2) DEFAULT '18',
	"material_margin" numeric(5, 2) DEFAULT '0',
	"discount" numeric(5, 2) DEFAULT '0',
	"net_amount" numeric(14, 2) DEFAULT '0',
	"gst_type" text NOT NULL,
	"include_tax" boolean DEFAULT false,
	"status" text DEFAULT 'Draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_insurance_invoice_id_unique" UNIQUE("invoice_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_insurance_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insurance_id" uuid NOT NULL,
	"material_id" uuid,
	"material_name_override" text,
	"hsn_code" text,
	"qty" numeric(12, 3) NOT NULL,
	"unit_id" uuid,
	"rate" numeric(14, 4) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"tax_percentage" numeric(5, 2) NOT NULL,
	"cgst_amount" numeric(14, 2) DEFAULT '0',
	"sgst_amount" numeric(14, 2) DEFAULT '0',
	"igst_amount" numeric(14, 2) DEFAULT '0',
	"gst_type" text NOT NULL,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "stage_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"default_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"unit_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stage_material_unique" UNIQUE("stage_id","material_id")
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_code" text NOT NULL,
	"stage_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stages_stage_code_unique" UNIQUE("stage_code")
);
--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "vehicle_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "include_tax" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "material_issues" ADD COLUMN "issue_type" text DEFAULT 'OLD' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_issues" ADD COLUMN "stage_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "reverted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "reverted_by" text;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD COLUMN "rate_at_time" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "invoice_insurance" ADD CONSTRAINT "invoice_insurance_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_insurance_items" ADD CONSTRAINT "invoice_insurance_items_insurance_id_invoice_insurance_id_fk" FOREIGN KEY ("insurance_id") REFERENCES "public"."invoice_insurance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_insurance_items" ADD CONSTRAINT "invoice_insurance_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_insurance_items" ADD CONSTRAINT "invoice_insurance_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_materials" ADD CONSTRAINT "stage_materials_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_materials" ADD CONSTRAINT "stage_materials_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_materials" ADD CONSTRAINT "stage_materials_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ii_ins_invoice_id" ON "invoice_insurance" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_iii_insurance_id" ON "invoice_insurance_items" USING btree ("insurance_id");--> statement-breakpoint
CREATE INDEX "idx_sm_stage_id" ON "stage_materials" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "idx_sm_material_id" ON "stage_materials" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_stages_is_active" ON "stages" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "material_issues" ADD CONSTRAINT "material_issues_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mi_issue_type" ON "material_issues" USING btree ("issue_type");--> statement-breakpoint
CREATE INDEX "idx_mi_stage_id" ON "material_issues" USING btree ("stage_id");