CREATE TABLE "company_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"address" text,
	"gstin" text,
	"pan_no" text,
	"tan_no" text,
	"bank_name" text,
	"bank_account_no" text,
	"bank_ifsc" text,
	"bank_branch" text,
	"invoice_terms" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_slip_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"slip_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_slip_links_invoice_id_slip_id_unique" UNIQUE("invoice_id","slip_id")
);
--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "supplier_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "job_ref_no" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "customer_no" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "gst_type" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "status" text DEFAULT 'Draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "customer_name" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "customer_gstin" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "customer_state" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "customer_address" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_status" text DEFAULT 'Unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_date" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_notes" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "material_issue_items" ADD COLUMN "gst_type" text;--> statement-breakpoint
ALTER TABLE "material_issues" ADD COLUMN "status" text DEFAULT 'Draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "gst_type" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "affects_stock" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_bill_no" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_bill_date" date;--> statement-breakpoint
ALTER TABLE "invoice_slip_links" ADD CONSTRAINT "invoice_slip_links_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_slip_links" ADD CONSTRAINT "invoice_slip_links_slip_id_material_issues_id_fk" FOREIGN KEY ("slip_id") REFERENCES "public"."material_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_contractors_is_active" ON "contractors" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_customers_is_active" ON "customers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_ii_invoice_id" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_ii_material_id" ON "invoice_items" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_inv_financial_year" ON "invoices" USING btree ("financial_year");--> statement-breakpoint
CREATE INDEX "idx_inv_fy_status" ON "invoices" USING btree ("financial_year","status");--> statement-breakpoint
CREATE INDEX "idx_inv_vehicle_id" ON "invoices" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_mii_issue_id" ON "material_issue_items" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_mii_material_id" ON "material_issue_items" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_mi_financial_year" ON "material_issues" USING btree ("financial_year");--> statement-breakpoint
CREATE INDEX "idx_mi_vehicle_id" ON "material_issues" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_mi_fy_status" ON "material_issues" USING btree ("financial_year","status");--> statement-breakpoint
CREATE INDEX "idx_materials_is_active" ON "materials" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_poi_po_id" ON "purchase_order_items" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "idx_poi_material_id" ON "purchase_order_items" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_po_financial_year" ON "purchase_orders" USING btree ("financial_year");--> statement-breakpoint
CREATE INDEX "idx_po_fy_status" ON "purchase_orders" USING btree ("financial_year","status");--> statement-breakpoint
CREATE INDEX "idx_po_supplier_id" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_sl_material_id" ON "stock_ledger" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_sl_created_at" ON "stock_ledger" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sl_material_created" ON "stock_ledger" USING btree ("material_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_suppliers_is_active" ON "suppliers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_vehicles_is_active" ON "vehicles" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_vehicles_customer_id" ON "vehicles" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_customer_no_unique" UNIQUE("customer_no");