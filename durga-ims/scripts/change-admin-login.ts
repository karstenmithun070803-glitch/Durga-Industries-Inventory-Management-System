/**
 * One-off, idempotent. Renames the admin login dvncoach -> dvnvijay and sets a new
 * password, then revokes the admin's existing sessions.
 *
 *   cd durga-ims
 *   NODE_PATH="$(pwd)/node_modules" ADMIN_PASSWORD='...' npx tsx scripts/change-admin-login.ts
 *
 * If ADMIN_PASSWORD is unset the script prompts. The password is never hardcoded,
 * logged, or committed.
 *
 * Two identities change, and they are NOT the same thing:
 *   - auth.users.email   dvncoach@... -> dvnvijay@...   (the prefix IS the typed username:
 *                        login() builds `${username}@durgaindustries.internal`)
 *   - app_users.username mithun       -> dvnvijay       (what getCurrentUser() returns)
 * They were free to drift because getCurrentUser() joins on supabase_auth_id.
 *
 * Side effect, accepted: stock.actions.ts stamps the audit trail with
 * email.split("@")[0], so new stock edits record "dvnvijay" while historical rows keep
 * "dvncoach". Historical rows record what happened and are deliberately left alone.
 *
 * Rollback: step 0 prints the old email + bcrypt hash as a ready-to-paste UPDATE before
 * anything is written. That — not a database snapshot — is the safety net here: the risk
 * is lockout (there is no usable SUPABASE_SERVICE_ROLE_KEY to repair auth through the
 * admin API), and restoring a whole-DB snapshot would roll back real inventory data too.
 *
 * Writing auth.users directly is outside Supabase's supported API; it is what the
 * dashboard does underneath. Re-verified against this project before use:
 *   - pgcrypto is installed in the `extensions` schema. The qualification is deliberate:
 *     unqualified crypt() only resolves by accident of the current search_path.
 *   - auth.identities is empty (0 rows) and the existing accounts sign in regardless, so
 *     no identity row is required. Do not create one.
 *   - auth.refresh_tokens.user_id is `character varying`, while auth.sessions.user_id is
 *     `uuid`. Hence the ::text cast on the former only.
 *   - DIRECT_URL connects as the `postgres` superuser.
 *
 * ⚠ The four token columns MUST stay '' and never NULL. GoTrue scans them into
 * non-nullable strings, so a NULL makes every sign-in fail — and because login() collapses
 * any auth error into `?error=invalid`, it surfaces as "Invalid username or password"
 * rather than anything pointing at the real cause. This cost a debugging cycle already.
 * This script never writes them; do not "tidy" them in.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { createInterface } from "node:readline/promises";

const OLD_ADMIN_EMAIL = "dvncoach@durgaindustries.internal";
const NEW_USERNAME = "dvnvijay";
const NEW_EMAIL = `${NEW_USERNAME}@durgaindustries.internal`;
const CONFIRM_PHRASE = "change admin";

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

async function main() {
  const { DIRECT_URL } = process.env;
  if (!DIRECT_URL) throw new Error("DIRECT_URL missing from .env.local");

  const skipConfirm = process.argv.includes("--yes");
  const sql = postgres(DIRECT_URL, { prepare: false });

  try {
    // ── Resolve the admin auth user, idempotently ───────────────────────────
    // Re-runs after a partial success find NEW_EMAIL instead. Both present is an
    // ambiguous state a script must not guess at.
    const [oldRow] = await sql<{ id: string; encrypted_password: string }[]>`
      SELECT id, encrypted_password FROM auth.users WHERE email = ${OLD_ADMIN_EMAIL}
    `;
    const [newRow] = await sql<{ id: string }[]>`
      SELECT id FROM auth.users WHERE email = ${NEW_EMAIL}
    `;

    if (oldRow && newRow) {
      throw new Error(
        `Both ${OLD_ADMIN_EMAIL} and ${NEW_EMAIL} exist in auth.users. ` +
          `Resolve by hand — refusing to guess which is the real admin.`
      );
    }
    if (!oldRow && !newRow) {
      throw new Error(`No auth user for ${OLD_ADMIN_EMAIL} or ${NEW_EMAIL}. Nothing changed.`);
    }
    if (!oldRow && newRow) {
      console.log(`• auth.users already renamed to ${NEW_EMAIL} — password will still be reset.`);
    }

    const adminId = (oldRow ?? newRow).id;

    // ── The app_users row must exist and be the admin ───────────────────────
    // Resolve by supabase_auth_id, never by the email prefix: the admin's username is
    // "mithun", which never matched the email to begin with.
    const [adminApp] = await sql<{ username: string; role: string }[]>`
      SELECT username, role FROM app_users WHERE supabase_auth_id = ${adminId}
    `;
    if (!adminApp) {
      throw new Error(
        `auth user ${adminId} has no app_users row. Refusing to invent one — ` +
          `run set-user-roles.ts first.`
      );
    }
    if (adminApp.role !== "admin") {
      throw new Error(`app_users row for ${adminId} has role='${adminApp.role}', not 'admin'.`);
    }

    // username is UNIQUE NOT NULL — a different row already holding it would fail the
    // UPDATE mid-transaction. Check first so the error names the real problem.
    const [clash] = await sql<{ supabase_auth_id: string }[]>`
      SELECT supabase_auth_id FROM app_users
       WHERE username = ${NEW_USERNAME} AND supabase_auth_id <> ${adminId}
    `;
    if (clash) {
      throw new Error(`app_users.username '${NEW_USERNAME}' is already taken by ${clash.supabase_auth_id}.`);
    }

    // ── Step 0: print the rollback BEFORE writing anything ──────────────────
    if (oldRow) {
      console.log("");
      console.log("  ┌─ ROLLBACK — save this before continuing ─────────────────────────");
      console.log("  │ Restores the current login exactly. The hash is bcrypt, not the");
      console.log("  │ plaintext password, so this is safe to keep.");
      console.log("  │");
      console.log("  │   UPDATE auth.users");
      console.log(`  │      SET email = '${OLD_ADMIN_EMAIL}',`);
      console.log(`  │          encrypted_password = '${oldRow.encrypted_password}'`);
      console.log(`  │    WHERE id = '${adminId}';`);
      console.log("  │");
      console.log(`  │   UPDATE app_users SET username = '${adminApp.username}'`);
      console.log(`  │    WHERE supabase_auth_id = '${adminId}';`);
      console.log("  └──────────────────────────────────────────────────────────────────");
      console.log("");
    }

    const password = process.env.ADMIN_PASSWORD?.trim() || (await prompt(`New password for ${NEW_USERNAME}: `));
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");

    if (!skipConfirm) {
      console.log(`About to rename ${adminApp.username}/${OLD_ADMIN_EMAIL} -> ${NEW_USERNAME}/${NEW_EMAIL}`);
      console.log("and reset the password, against PRODUCTION. This revokes the admin's sessions.");
      const typed = await prompt(`Type "${CONFIRM_PHRASE}" to proceed: `);
      if (typed !== CONFIRM_PHRASE) throw new Error("Not confirmed. Nothing changed.");
    }

    // ── Apply, atomically ───────────────────────────────────────────────────
    // Both identities and the session revocation land together or not at all: a rename
    // without the app_users update would leave the UI naming a user that cannot log in.
    await sql.begin(async (tx) => {
      // confirmed_at is GENERATED ALWAYS — listing it is an error.
      // The four token columns are deliberately absent; see the header.
      await tx`
        UPDATE auth.users
           SET email              = ${NEW_EMAIL},
               encrypted_password = extensions.crypt(${password}, extensions.gen_salt('bf')),
               updated_at         = now()
         WHERE id = ${adminId}
      `;

      await tx`
        UPDATE app_users
           SET username = ${NEW_USERNAME}, updated_at = now()
         WHERE supabase_auth_id = ${adminId}
      `;

      // Revoke the admin's sessions so the old password cannot ride an existing cookie.
      // refresh_tokens first: it references sessions.
      await tx`DELETE FROM auth.refresh_tokens WHERE user_id = ${adminId}::text`;
      await tx`DELETE FROM auth.sessions WHERE user_id = ${adminId}`;
    });

    console.log(`✓ auth.users: email -> ${NEW_EMAIL}, password reset`);
    console.log(`✓ app_users: username ${adminApp.username} -> ${NEW_USERNAME} (role=admin)`);
    console.log("✓ admin sessions revoked");

    console.table(await sql`SELECT username, role FROM app_users ORDER BY role, username`);

    // An accepted UPDATE proves the row stored. It does NOT prove GoTrue accepts the
    // hash. Say so, loudly.
    console.log("");
    console.log(`  ⚠ Not verified yet: sign in at /login as "${NEW_USERNAME}" to confirm.`);
    console.log("    If it says \"Invalid username or password\", suspect the token columns");
    console.log("    (see header), not the password.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
