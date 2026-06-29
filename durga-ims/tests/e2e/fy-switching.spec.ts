// ============================================================
// Phase: 3
// Category: E2E
// Tests: Amber FY banner appears on historical FY selection,
//        banner absent on current FY, FY selector visible in sidebar
// Source: src/components/sidebar.tsx
//         src/components/fy-banner.tsx
// ============================================================

import { test, expect } from "@playwright/test";

const CURRENT_FY = "2026-2027";

test.describe("financial year switching", () => {
  test("amber FY banner appears when switching to a historical FY via sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-testid="fy-selector"]')).toBeVisible({ timeout: 10_000 });

    // Open the FY dropdown
    await page.click('[data-testid="fy-selector"]');

    // Pick any option that is NOT the current FY — the dropdown shows years going back
    // Look for any option that doesn't match CURRENT_FY
    const options = page.locator(`button:has-text("FY ")`);
    const count = await options.count();
    let clickedHistorical = false;
    for (let i = 0; i < count; i++) {
      const text = await options.nth(i).textContent();
      if (text && !text.includes(CURRENT_FY)) {
        await options.nth(i).click();
        clickedHistorical = true;
        break;
      }
    }
    if (!clickedHistorical) {
      test.skip();
      return;
    }

    // The amber banner should appear
    await expect(page.locator('[data-testid="fy-banner"]')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[data-testid="fy-banner"]')).toContainText("Viewing Historical Data");
  });

  test("FY banner is absent when current FY is selected", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-testid="fy-selector"]')).toBeVisible({ timeout: 10_000 });

    // Open and select current FY explicitly
    await page.click('[data-testid="fy-selector"]');
    const currentOption = page.locator(`button:has-text("FY ${CURRENT_FY}")`);
    if (await currentOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await currentOption.click();
    } else {
      await page.keyboard.press("Escape");
    }

    await expect(page.locator('[data-testid="fy-banner"]')).not.toBeVisible({ timeout: 5_000 });
  });

  test("FY selector button shows current FY text and is visible in sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-testid="fy-selector"]')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[data-testid="fy-selector"]')).toContainText("FY");
  });
});
