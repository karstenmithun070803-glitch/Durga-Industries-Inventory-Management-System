import {
  pgTable,
  uuid,
  text,
  boolean,
  numeric,
  integer,
  serial,
  timestamp,
  check,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const timestamps = {
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const softDelete = {
  is_active: boolean("is_active").notNull().default(true),
};

// ---------------------------------------------------------------------------
// MASTER TABLES
// ---------------------------------------------------------------------------

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  customer_name: text("customer_name").notNull(),
  address_1: text("address_1"),
  address_2: text("address_2"),
  street: text("street"),
  city: text("city"),
  state: text("state"),
  gstin: text("gstin"),
  ...softDelete,
  ...timestamps,
});

export const contractors = pgTable("contractors", {
  id: uuid("id").primaryKey().defaultRandom(),
  code_no: serial("code_no").unique().notNull(),
  name: text("name").notNull(),
  role: text("role"),
  contact: text("contact"),
  ...softDelete,
  ...timestamps,
});

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code_no: serial("code_no").unique().notNull(),
  name: text("name").notNull(),
  tin_no: text("tin_no"),
  cst_no: text("cst_no"),
  gstin: text("gstin"),
  address: text("address"),
  state: text("state"),
  ...softDelete,
  ...timestamps,
});

export const taxRates = pgTable("tax_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  vat_code: serial("vat_code").unique().notNull(),
  tax_percentage: numeric("tax_percentage", { precision: 5, scale: 2 }).notNull(),
  description: text("description").notNull(),
  inv_prefix: text("inv_prefix"),
  ...softDelete,
  ...timestamps,
});

export const units = pgTable("units", {
  id: uuid("id").primaryKey().defaultRandom(),
  unit_code: serial("unit_code").unique().notNull(),
  unit_name: text("unit_name").notNull(),
  ...softDelete,
  ...timestamps,
});

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    material_no: serial("material_no").unique().notNull(),
    name: text("name").notNull(),
    hsn_code: text("hsn_code"),
    tax_rate_id: uuid("tax_rate_id").references(() => taxRates.id),
    purchase_unit_id: uuid("purchase_unit_id").references(() => units.id),
    sales_unit_id: uuid("sales_unit_id").references(() => units.id),
    conversion_value: numeric("conversion_value", { precision: 10, scale: 4 }).default("1"),
    opening_stock: numeric("opening_stock", { precision: 12, scale: 4 }).notNull().default("0"),
    current_stock: numeric("current_stock", { precision: 12, scale: 4 }).notNull().default("0"),
    min_level: numeric("min_level", { precision: 12, scale: 4 }).default("0"),
    max_level: numeric("max_level", { precision: 12, scale: 4 }),
    ...softDelete,
    ...timestamps,
  },
  (table) => [
    check("current_stock_non_negative", sql`${table.current_stock} >= 0`),
  ]
);

export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  job_ref_no: serial("job_ref_no").unique().notNull(),
  vehicle_name: text("vehicle_name").notNull(),
  // 'New' = new chassis + new body | 'Old' = old chassis + new body
  type: text("type").notNull().default("New"),
  customer_id: uuid("customer_id").references(() => customers.id),
  ...softDelete,
  ...timestamps,
});

// Auth bridge: maps a username to a Supabase auth email
export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").unique().notNull(),
  // technical email used with Supabase Auth (e.g. "owner@durgaindustries.internal")
  supabase_auth_id: uuid("supabase_auth_id").unique(),
  display_name: text("display_name"),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// TRANSACTION TABLES
// ---------------------------------------------------------------------------

export const purchaseOrders = pgTable("purchase_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  // integer (not serial) — resets to 1 each FY; backend calculates next number
  po_number: integer("po_number").notNull(),
  po_date: timestamp("po_date", { withTimezone: true }).notNull().defaultNow(),
  supplier_id: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  total_amount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  // 'Draft' = editable, 'Received' = triggers stock addition
  status: text("status").notNull().default("Draft"),
  financial_year: text("financial_year").notNull(), // e.g. "2026-2027"
  ...timestamps,
}, (t) => [
  unique("po_number_fy_unique").on(t.po_number, t.financial_year),
]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  po_id: uuid("po_id")
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: "cascade" }),
  material_id: uuid("material_id")
    .notNull()
    .references(() => materials.id),
  qty: numeric("qty", { precision: 12, scale: 4 }).notNull(),
  unit_id: uuid("unit_id").references(() => units.id),
  rate: numeric("rate", { precision: 12, scale: 4 }).notNull().default("0"),
  // tax_percentage frozen at time of entry — survives future tax rate changes
  tax_percentage: numeric("tax_percentage", { precision: 5, scale: 2 }).notNull().default("0"),
  cgst_amount: numeric("cgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  sgst_amount: numeric("sgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  igst_amount: numeric("igst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  ...timestamps,
});

export const materialIssues = pgTable("material_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  // integer (not serial) — resets to 1 each FY; backend calculates next number
  slip_number: integer("slip_number").notNull(),
  issue_date: timestamp("issue_date", { withTimezone: true }).notNull().defaultNow(),
  vehicle_id: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  margin_percentage: numeric("margin_percentage", { precision: 5, scale: 2 }).default("0"),
  total_amount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  financial_year: text("financial_year").notNull(),
  ...timestamps,
}, (t) => [
  unique("slip_number_fy_unique").on(t.slip_number, t.financial_year),
]);

export const materialIssueItems = pgTable("material_issue_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  issue_id: uuid("issue_id")
    .notNull()
    .references(() => materialIssues.id, { onDelete: "cascade" }),
  material_id: uuid("material_id")
    .notNull()
    .references(() => materials.id),
  hsn_code: text("hsn_code"),
  qty: numeric("qty", { precision: 12, scale: 4 }).notNull(),
  unit_id: uuid("unit_id").references(() => units.id),
  rate: numeric("rate", { precision: 12, scale: 4 }).notNull().default("0"),
  tax_percentage: numeric("tax_percentage", { precision: 5, scale: 2 }).notNull().default("0"),
  cgst_amount: numeric("cgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  sgst_amount: numeric("sgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  igst_amount: numeric("igst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  // null = unassigned; optional per-line contractor
  contractor_id: uuid("contractor_id").references(() => contractors.id),
  // FALSE = pass-through / service item — no stock movement on save
  affects_inventory: boolean("affects_inventory").notNull().default(true),
  ...timestamps,
});

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  // text e.g. "D1800005" — prefix from tax_rates.inv_prefix + sequential integer
  bill_number: text("bill_number").notNull(),
  bill_date: timestamp("bill_date", { withTimezone: true }).notNull().defaultNow(),
  rate_date: timestamp("rate_date", { withTimezone: true }),
  tax_percentage: numeric("tax_percentage", { precision: 5, scale: 2 }).default("0"),
  material_margin: numeric("material_margin", { precision: 5, scale: 2 }).default("0"),
  discount: numeric("discount", { precision: 14, scale: 2 }).default("0"),
  vehicle_id: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  net_amount: numeric("net_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  rev_charge_status: boolean("rev_charge_status").notNull().default(false),
  financial_year: text("financial_year").notNull(),
  ...timestamps,
}, (t) => [
  unique("bill_number_fy_unique").on(t.bill_number, t.financial_year),
]);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoice_id: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  material_id: uuid("material_id")
    .notNull()
    .references(() => materials.id),
  hsn_code: text("hsn_code"),
  qty: numeric("qty", { precision: 12, scale: 4 }).notNull(),
  unit_id: uuid("unit_id").references(() => units.id),
  rate: numeric("rate", { precision: 12, scale: 4 }).notNull().default("0"),
  // historical lock — survives future tax rate changes
  tax_percentage: numeric("tax_percentage", { precision: 5, scale: 2 }).notNull().default("0"),
  cgst_amount: numeric("cgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  sgst_amount: numeric("sgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  igst_amount: numeric("igst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// STOCK LEDGER  (immutable — rows are NEVER updated or deleted)
// ---------------------------------------------------------------------------
// transaction_type validated in app layer (not DB CHECK) so new types can be
// added without migrations. Current values:
//   'PO_INWARD'  — stock added when PO marked Received
//   'ISSUE'      — stock deducted when Material Issue saved
//   'REVERSAL'   — stock restored when PO/Issue edited or deleted
//   'ADJUSTMENT' — manual correction via Stock Dashboard
export const stockLedger = pgTable("stock_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  material_id: uuid("material_id")
    .notNull()
    .references(() => materials.id),
  transaction_type: text("transaction_type").notNull(),
  reference_id: uuid("reference_id"),     // FK to the source document
  reference_type: text("reference_type"), // e.g. "purchase_order", "material_issue"
  qty_change: numeric("qty_change", { precision: 12, scale: 4 }).notNull(),
  stock_after: numeric("stock_after", { precision: 12, scale: 4 }).notNull(),
  reason: text("reason"),        // required for ADJUSTMENT
  adjusted_by: text("adjusted_by"), // username, required for ADJUSTMENT
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // no updated_at — this table is append-only
});

// ---------------------------------------------------------------------------
// RELATIONS  (used by Drizzle for type-safe joins — no DB impact)
// ---------------------------------------------------------------------------

export const customersRelations = relations(customers, ({ many }) => ({
  vehicles: many(vehicles),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  customer: one(customers, {
    fields: [vehicles.customer_id],
    references: [customers.id],
  }),
  materialIssues: many(materialIssues),
  invoices: many(invoices),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  purchaseOrders: many(purchaseOrders),
}));

export const taxRatesRelations = relations(taxRates, ({ many }) => ({
  materials: many(materials),
}));

export const unitsRelations = relations(units, ({ many }) => ({
  materialsByPurchaseUnit: many(materials, { relationName: "purchaseUnit" }),
  materialsBySalesUnit: many(materials, { relationName: "salesUnit" }),
  purchaseOrderItems: many(purchaseOrderItems),
  materialIssueItems: many(materialIssueItems),
  invoiceItems: many(invoiceItems),
}));

export const materialsRelations = relations(materials, ({ one, many }) => ({
  taxRate: one(taxRates, {
    fields: [materials.tax_rate_id],
    references: [taxRates.id],
  }),
  purchaseUnit: one(units, {
    fields: [materials.purchase_unit_id],
    references: [units.id],
    relationName: "purchaseUnit",
  }),
  salesUnit: one(units, {
    fields: [materials.sales_unit_id],
    references: [units.id],
    relationName: "salesUnit",
  }),
  purchaseOrderItems: many(purchaseOrderItems),
  materialIssueItems: many(materialIssueItems),
  invoiceItems: many(invoiceItems),
  stockLedger: many(stockLedger),
}));

export const contractorsRelations = relations(contractors, ({ many }) => ({
  materialIssueItems: many(materialIssueItems),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [purchaseOrders.supplier_id],
    references: [suppliers.id],
  }),
  items: many(purchaseOrderItems),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.po_id],
    references: [purchaseOrders.id],
  }),
  material: one(materials, {
    fields: [purchaseOrderItems.material_id],
    references: [materials.id],
  }),
  unit: one(units, {
    fields: [purchaseOrderItems.unit_id],
    references: [units.id],
  }),
}));

export const materialIssuesRelations = relations(materialIssues, ({ one, many }) => ({
  vehicle: one(vehicles, {
    fields: [materialIssues.vehicle_id],
    references: [vehicles.id],
  }),
  items: many(materialIssueItems),
}));

export const materialIssueItemsRelations = relations(materialIssueItems, ({ one }) => ({
  materialIssue: one(materialIssues, {
    fields: [materialIssueItems.issue_id],
    references: [materialIssues.id],
  }),
  material: one(materials, {
    fields: [materialIssueItems.material_id],
    references: [materials.id],
  }),
  unit: one(units, {
    fields: [materialIssueItems.unit_id],
    references: [units.id],
  }),
  contractor: one(contractors, {
    fields: [materialIssueItems.contractor_id],
    references: [contractors.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  vehicle: one(vehicles, {
    fields: [invoices.vehicle_id],
    references: [vehicles.id],
  }),
  items: many(invoiceItems),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoice_id],
    references: [invoices.id],
  }),
  material: one(materials, {
    fields: [invoiceItems.material_id],
    references: [materials.id],
  }),
  unit: one(units, {
    fields: [invoiceItems.unit_id],
    references: [units.id],
  }),
}));

export const stockLedgerRelations = relations(stockLedger, ({ one }) => ({
  material: one(materials, {
    fields: [stockLedger.material_id],
    references: [materials.id],
  }),
}));
