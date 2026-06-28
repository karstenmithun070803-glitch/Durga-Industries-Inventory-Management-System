// Standard test scenarios used across integration tests (Phase 2+).
// Each scenario describes the DB state to set up before running a test group.
// Actual seeding uses factory functions from seed.ts.

export const SCENARIO_EMPTY = {
  name: "empty",
  description: "No records in any table. Tests empty-state UI and zero-result queries.",
} as const;

export const SCENARIO_MINIMAL = {
  name: "minimal",
  description: "One record per entity type. Tests basic CRUD and single-record views.",
} as const;

export const SCENARIO_REALISTIC = {
  name: "realistic",
  description: "Multiple records per entity, cross-entity relationships, mix of TN and out-of-state customers. Tests filtering, pagination, and GST type variance.",
} as const;
