// ============================================================
// Phase: 4
// Category: Edge Case / Security
// Tests: SUPABASE_SERVICE_ROLE_KEY must not appear in .next/static/
//        (client-side bundle). Source files must not import or expose
//        the key in any client component.
// Source: .next/static/ (build artifact)
//         src/ (source files)
// ============================================================

import { describe, expect, it } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();

describe("security-bundle-check — SERVICE_ROLE_KEY not in client bundle", () => {
  it("PASS if .next/static/ doesn't exist (build not run) or key absent", () => {
    const staticDir = join(ROOT, ".next/static");
    if (!existsSync(staticDir)) {
      console.log("SKIP: .next/static/ not found. Run npm run build first.");
      return;
    }
    let matches = 0;
    try {
      execSync(`grep -r "SERVICE_ROLE" "${staticDir}"`, { stdio: "pipe" });
      matches = 1; // grep succeeded = found match = FAIL
    } catch {
      matches = 0; // grep exit 1 = no match = PASS
    }
    expect(matches).toBe(0);
  });

  it("SERVICE_ROLE_KEY not imported in any src/ file", () => {
    let found = false;
    try {
      execSync(
        `grep -r "SUPABASE_SERVICE_ROLE_KEY" "${join(ROOT, "src")}" --include="*.ts" --include="*.tsx"`,
        { stdio: "pipe" }
      );
      found = true;
    } catch {
      found = false;
    }
    expect(found).toBe(false);
  });
});
