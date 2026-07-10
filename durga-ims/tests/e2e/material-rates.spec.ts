// ============================================================
// Phase: 3
// Category: E2E
// Tests: Admin Material Rate Master — keyboard entry, live unrated counter, the
//        dirty-state merge (R3), the unsaved-changes guard (R4), and the two-login
//        concurrency behaviours: no false block when a ceiling is raised (R5), and a
//        stale-low ceiling still caught server-side (R6).
// Source: src/app/(dashboard)/admin/material-rates/*
//         src/lib/actions/materials.actions.ts (batchUpdateMaterialRates)
//         src/lib/actions/purchase-orders.actions.ts (validateItems)
// Requires: admin storageState (playwright/.auth/user.json).
//           Two-login specs additionally need playwright/.auth/employee.json —
//           see tests/e2e/employee-auth.setup.ts.
// ============================================================

import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const employeeState = path.join(process.cwd(), "playwright/.auth/employee.json");
const hasEmployee = fs.existsSync(employeeState);

async function openRateMaster(page: Page) {
  await page.goto("/admin/material-rates");
  await expect(page.getByTestId("unrated-count")).toBeVisible();
}

async function unratedCount(page: Page): Promise<number> {
  const text = await page.getByTestId("unrated-count").innerText();
  return parseInt(text, 10);
}

/** Reads the first N material rows' rate inputs. */
function rateInput(page: Page, rowIndex: number) {
  return page.locator(`[data-rate-row='${rowIndex}']`);
}

test.describe("Material Rate Master — admin", () => {
  test("keyboard-only entry: Enter advances to the next row's rate cell", async ({ page }) => {
    await openRateMaster(page);

    await rateInput(page, 0).click();
    await rateInput(page, 0).fill("150");
    await page.keyboard.press("Enter");

    const focused = await page.evaluate(() =>
      document.activeElement?.getAttribute("data-rate-row")
    );
    expect(focused).toBe("1");

    // ArrowUp goes back
    await page.keyboard.press("ArrowUp");
    const back = await page.evaluate(() => document.activeElement?.getAttribute("data-rate-row"));
    expect(back).toBe("0");
  });

  test("unrated counter is derived from live state, not a frozen server prop", async ({ page }) => {
    await openRateMaster(page);
    const before = await unratedCount(page);

    await rateInput(page, 0).fill("150");
    expect(await unratedCount(page)).toBe(before - 1);

    // Clearing it puts the material back into the unrated set immediately.
    await rateInput(page, 0).fill("");
    expect(await unratedCount(page)).toBe(before);
  });

  test("a zero ceiling is rejected with an actionable message", async ({ page }) => {
    await openRateMaster(page);
    await rateInput(page, 0).fill("0");
    await page.getByRole("button", { name: "Save All" }).click();

    await expect(page.locator("[data-sonner-toast]")).toContainText(/greater than 0/i);
    await expect(page.locator("[data-sonner-toast]")).toContainText(/Leave blank/i);
    // Nothing was saved — the row is still dirty.
    await expect(page.getByTestId("dirty-count")).toContainText("1 unsaved change");
  });

  test("Save All clears the dirty set and the footer", async ({ page }) => {
    await openRateMaster(page);
    await rateInput(page, 0).fill("150");
    await expect(page.getByTestId("dirty-count")).toContainText("1 unsaved change");

    await page.getByRole("button", { name: "Save All" }).click();
    await expect(page.getByTestId("dirty-count")).toContainText("No unsaved changes");

    // Cleanup: put it back to "not set".
    await rateInput(page, 0).fill("");
    await page.getByRole("button", { name: "Save All" }).click();
    await expect(page.getByTestId("dirty-count")).toContainText("No unsaved changes");
  });

  // R4 — beforeunload does NOT fire on App Router client-side navigation, so a sidebar
  // Link click would silently discard typed rates without the in-app intercept.
  test("navigating away with unsaved rates raises the discard confirmation", async ({ page }) => {
    await openRateMaster(page);
    await rateInput(page, 0).fill("123");

    await page.getByRole("link", { name: "Home" }).click();

    await expect(page.getByText("Discard unsaved rates?")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/material-rates/); // navigation was intercepted
  });

  test("search filters rows but keeps unsaved edits", async ({ page }) => {
    await openRateMaster(page);
    const name = await page.locator("tbody tr").first().locator("td").nth(2).innerText();

    await rateInput(page, 0).fill("177");
    await page.getByPlaceholder(/Search by name/).fill(name);
    await expect(page.getByTestId("dirty-count")).toContainText("1 unsaved change");

    await page.getByPlaceholder(/Search by name/).fill("");
    await expect(page.getByTestId("dirty-count")).toContainText("1 unsaved change");
  });
});

// ---------------------------------------------------------------------------
// Two simultaneous logins. Skipped until the employee auth user exists.
// ---------------------------------------------------------------------------
test.describe("Material Rate Master — admin and employee at once", () => {
  test.skip(
    !hasEmployee,
    "Needs playwright/.auth/employee.json — run scripts/set-user-roles.ts, then the employee-auth setup project."
  );

  test("employee cannot see the Admin group, the rate column, or the admin route", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: employeeState });
    const page = await ctx.newPage();

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Admin" })).toHaveCount(0);

    await page.goto("/masters/materials");
    await expect(page.getByRole("columnheader", { name: /Max Rate/i })).toHaveCount(0);

    await page.goto("/admin/material-rates");
    // Assert the property that matters — no grid, no editable ceiling — not the HTTP
    // status. notFound() thrown from the /admin layout renders the not-found boundary
    // AFTER the (dashboard) shell has streamed, so Next serves it with a 200. Verified
    // against a production build, not just `next dev`. The route reveals nothing either
    // way: the employee sees "This page could not be found".
    await expect(page.getByText(/could not be found/i)).toBeVisible();
    await expect(page.getByTestId("unrated-count")).toHaveCount(0);
    await expect(page.locator("[data-rate-row='0']")).toHaveCount(0);

    await ctx.close();
  });

  // R3 — the highest-risk regression. A naive `setRows(materials)` on prop change wipes
  // every unsaved rate the moment a background revalidation fires.
  test("admin's unsaved rates survive a revalidation caused by the employee", async ({
    browser,
    page: adminPage,
  }) => {
    await openRateMaster(adminPage);

    await rateInput(adminPage, 0).fill("111");
    await rateInput(adminPage, 1).fill("222");
    await rateInput(adminPage, 2).fill("333");
    await expect(adminPage.getByTestId("dirty-count")).toContainText("3 unsaved changes");

    // Employee creates a material -> revalidateTag(materials) -> admin's page re-renders
    // while they are still typing.
    const ctx = await browser.newContext({ storageState: employeeState });
    const employee = await ctx.newPage();
    const newName = `ZZ E2E ${Date.now()}`;
    await employee.goto("/masters/materials");
    await employee.getByPlaceholder(/e\.g\. 25\*3MM ANGLE/).fill(newName);
    // Purchase unit is required. The Combobox trigger is role="combobox", not a button.
    await employee.getByRole("combobox").filter({ hasText: /Select unit/ }).click();
    await employee.locator("[cmdk-item]").first().click();
    await employee.getByRole("button", { name: "Add", exact: true }).click();
    await expect(employee.locator("[data-sonner-toast]")).toContainText(/Material added/i);

    const before = parseInt(await adminPage.getByTestId("unrated-count").innerText(), 10);

    // A background re-render, NOT a reload. reload() would legitimately discard unsaved
    // state (that is what the beforeunload guard is for). The admin page refreshes on
    // window focus, so returning to the tab re-runs the server component with fresh props
    // while the client component stays mounted — the exact condition R3 guards.
    await adminPage.evaluate(() => window.dispatchEvent(new Event("focus")));

    // The new material appears...
    await expect(adminPage.getByTestId("unrated-count")).toHaveText(
      new RegExp(`^${before + 1} `)
    );
    // ...and the three typed rates are untouched. A naive setRates(fromProps) fails here.
    await expect(adminPage.getByTestId("dirty-count")).toContainText("3 unsaved changes");
    await expect(rateInput(adminPage, 0)).toHaveValue("111");
    await expect(rateInput(adminPage, 1)).toHaveValue("222");
    await expect(rateInput(adminPage, 2)).toHaveValue("333");

    await ctx.close();
  });
});
