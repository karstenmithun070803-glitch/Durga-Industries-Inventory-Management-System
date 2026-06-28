// Cache tag constants for Next.js unstable_cache() and revalidateTag().
// Rule: tag strings exist ONLY here. Import CACHE_TAGS everywhere else.
// Invalidation contract: every mutation affecting a cached entity must call
// revalidateTag(CACHE_TAGS.<entity>) before returning.

export const CACHE_TAGS = {
  materials:   "materials",
  suppliers:   "suppliers",
  customers:   "customers",
  vehicles:    "vehicles",
  contractors: "contractors",
  units:       "units",
  taxRates:    "tax-rates",
  settings:    "settings",
  stages:      "stages",
  dashboard:   "dashboard-stats",
} as const;
