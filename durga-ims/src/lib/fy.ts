// Pure FY utility helpers — no "use server", safe to import anywhere

export function getCurrentFY(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${year + 1}`;
}

export function fyDateRange(fy: string): { start: Date; end: Date } {
  const [startYear] = fy.split("-").map(Number);
  // Use explicit IST offset (+05:30) — business is in India
  return {
    start: new Date(`${startYear}-04-01T00:00:00+05:30`),
    end: new Date(`${startYear + 1}-03-31T23:59:59+05:30`),
  };
}

// Returns true if an ISO date string (YYYY-MM-DD) falls within the given FY.
// Pure string comparison — safe because ISO dates are lexicographically ordered.
export function isDateInFY(dateStr: string, fy: string): boolean {
  const [startYear] = fy.split("-").map(Number);
  return dateStr >= `${startYear}-04-01` && dateStr <= `${startYear + 1}-03-31`;
}

// Returns { from: "YYYY-MM", to: "YYYY-MM" } for the first and last month of a FY.
// Used by month-range report filters to auto-set from/to on FY change.
export function fyToMonthRange(fy: string): { from: string; to: string } {
  const [startYear] = fy.split("-").map(Number);
  return {
    from: `${startYear}-04`,
    to: `${startYear + 1}-03`,
  };
}

// Returns an array of FY strings (e.g. "2026-2027") going `count` years back
// from the current FY, most recent first. Used to populate the FY switcher dropdown.
export function getFYOptions(count = 5): string[] {
  const currentFY = getCurrentFY();
  const [startYear] = currentFY.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const y = startYear - i;
    return `${y}-${y + 1}`;
  });
}
