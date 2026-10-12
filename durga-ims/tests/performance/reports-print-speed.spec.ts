// ============================================================
// Category: Performance (regression guard)
// Tests: Print in each Reports sub-tab must (a) never block the
//        main thread (no long task > 250ms), (b) deliver a real
//        PDF blob quickly. Reports are tabular and use the
//        direct-draw engine in a Web Worker.
// Source: src/components/pdf/print-button.tsx
//         src/lib/pdf-engine/*
// Note: read-only against the configured DB (only runs reports).
// ============================================================

import { test, expect, type Page } from "@playwright/test";

const TABS = [
  "Invoice Summary",
  "Purchase Report",
  "Monthly Stock Report",
  "Stage Costing",
  "Vehicle Comparison",
] as const;

const MAX_LONG_TASK_MS = 250;
const MAX_PRINT_MS = 3_000;

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __opened: string[]; __long: number[] };
    w.__opened = [];
    w.__long = [];
    window.open = ((url?: string) => {
      if (url) w.__opened.push(String(url));
      return null;
    }) as typeof window.open;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    }).observe({ entryTypes: ["longtask"] });
  });
}

for (const tab of TABS) {
  test(`Print is non-blocking and fast: ${tab}`, async ({ page }) => {
    await instrument(page);
    await page.goto("/reports");
    await page.getByRole("button", { name: tab, exact: true }).first().click();

    const printBtn = page.locator('[data-testid="print-btn"]').first();
    if (!(await printBtn.isVisible({ timeout: 6_000 }).catch(() => false))) {
      const run = page.getByRole("button", { name: "Run Report" });
      if (await run.isVisible().catch(() => false)) await run.click();
    }
    if (!(await printBtn.isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip(true, `No printable data for "${tab}" with default filters`);
      return;
    }
    await page.evaluate(() => ((window as unknown as { __long: number[] }).__long.length = 0));

    const start = Date.now();
    await printBtn.click();
    await page.waitForFunction(() => (window as unknown as { __opened: string[] }).__opened.length > 0, null, {
      timeout: 15_000,
    });
    const elapsed = Date.now() - start;

    const { opened, longest, head } = await page.evaluate(async () => {
      const w = window as unknown as { __opened: string[]; __long: number[] };
      const url = w.__opened[w.__opened.length - 1];
      const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
      return {
        opened: url,
        longest: Math.max(0, ...w.__long),
        head: new TextDecoder().decode(buf.slice(0, 5)),
      };
    });

    console.log(`${tab}: click→PDF ${elapsed} ms, longest main-thread task ${Math.round(longest)} ms`);
    expect(opened.startsWith("blob:")).toBe(true);
    expect(head).toBe("%PDF-");
    expect(elapsed).toBeLessThan(MAX_PRINT_MS);
    expect(longest).toBeLessThan(MAX_LONG_TASK_MS);
  });
}
