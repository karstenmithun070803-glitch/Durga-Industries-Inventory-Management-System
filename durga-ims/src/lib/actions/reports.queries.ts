// Cached server-component queries for report filter dropdowns.
// NO "use server" — these are called directly from server components, not via client action POST.
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { vehicles, suppliers, materials, customers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CACHE_TAGS } from "@/lib/cache";

export const getActiveVehiclesForReports = unstable_cache(
  async () =>
    db
      .select({ id: vehicles.id, vehicle_name: vehicles.vehicle_name, job_ref_no: vehicles.job_ref_no })
      .from(vehicles)
      .where(eq(vehicles.is_active, true))
      .orderBy(vehicles.job_ref_no),
  ["reports-active-vehicles"],
  { tags: [CACHE_TAGS.vehicles], revalidate: false }
);

export const getActiveSuppliersForReports = unstable_cache(
  async () =>
    db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.is_active, true))
      .orderBy(suppliers.name),
  ["reports-active-suppliers"],
  { tags: [CACHE_TAGS.suppliers], revalidate: false }
);

export const getActiveMaterialsForReports = unstable_cache(
  async () =>
    db
      .select({ id: materials.id, name: materials.name, material_no: materials.material_no })
      .from(materials)
      .where(eq(materials.is_active, true))
      .orderBy(materials.material_no),
  ["reports-active-materials"],
  { tags: [CACHE_TAGS.materials], revalidate: false }
);

export const getActiveCustomersForReports = unstable_cache(
  async () =>
    db
      .select({ id: customers.id, customer_name: customers.customer_name, gstin: customers.gstin })
      .from(customers)
      .where(eq(customers.is_active, true))
      .orderBy(customers.customer_name),
  ["reports-active-customers"],
  { tags: [CACHE_TAGS.customers], revalidate: false }
);
