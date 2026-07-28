ALTER TABLE "materials" RENAME COLUMN "max_rate" TO "base_rate";--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "buffer" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "base_rate_snapshot" numeric(14, 4);
