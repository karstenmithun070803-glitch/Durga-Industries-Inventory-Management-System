// ============================================================
// Phase: PWA
// Category: E2E
// Tests: PWA manifest + icons are publicly reachable (NOT auth-gated) so the
//        app stays installable, while protected routes still redirect. Guards
//        both the middleware matcher exemption and the belt-and-braces early
//        return in src/middleware.ts — a regression there silently breaks
//        installability without changing any page.
// Source: src/middleware.ts, src/app/manifest.ts
// ============================================================

import { test, expect } from "@playwright/test";

// These assertions must hold for logged-OUT visitors: browsers fetch the
// manifest/icons without credentials.
test.use({ storageState: { cookies: [], origins: [] } });

const PUBLIC_ASSETS = [
  "/icon.png",
  "/apple-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
];

test.describe("pwa", () => {
  test("manifest is publicly served with the correct content type", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    // A future middleware refactor could re-serve this as text/plain, which kills
    // installability without changing the status code.
    expect(res.headers()["content-type"]).toContain("application/manifest+json");

    const manifest = await res.json();
    expect(manifest.short_name).toBe("DVN IMS");
    expect(manifest.display).toBe("standalone");
    // Installability needs at least one `any` icon >= 192px.
    const hasAnyIcon = manifest.icons.some((i: { sizes: string; purpose?: string }) => {
      const purposeOk = !i.purpose || i.purpose.split(/\s+/).includes("any");
      const edge = parseInt(String(i.sizes).split("x")[0], 10);
      return purposeOk && edge >= 192;
    });
    expect(hasAnyIcon).toBe(true);
    expect(
      manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")
    ).toBe(true);
  });

  for (const asset of PUBLIC_ASSETS) {
    test(`icon ${asset} is publicly reachable (not redirected to /login)`, async ({ request }) => {
      const res = await request.get(asset);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/png");
    });
  }

  test("a protected route still redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/stock");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
