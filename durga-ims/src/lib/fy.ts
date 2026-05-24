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
