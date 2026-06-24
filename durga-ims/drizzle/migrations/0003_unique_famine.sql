ALTER TABLE "invoice_insurance" ALTER COLUMN "discount" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "invoice_insurance" ALTER COLUMN "discount" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "standard_cost" numeric(14, 4);