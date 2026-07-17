/**
 * One-off, idempotent. Promotes the existing account to admin and wires up the
 * data-entry employee login.
 *
 *   cd durga-ims
 *   NODE_PATH="$(pwd)/node_modules" EMPLOYEE_PASSWORD='...' npx tsx scripts/set-user-roles.ts
 *
 * If EMPLOYEE_PASSWORD is unset the script prompts for it. The password is never
 * hardcoded, logged, or committed.
 *
 * Must run BEFORE the deploy: the migration defaults app_users.role to 'employee',
 * so deploying first would 404 the admin out of /admin.
 *
 * Creating a Supabase auth user needs SUPABASE_SERVICE_ROLE_KEY. Without it, this
 * script still promotes the admin and will adopt an employee auth user created by
 * hand in the Supabase dashboard — re-run it afterwards.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { createInterface } from "node:readline/promises";

// Renamed from dvncoach@ by change-admin-login.ts. Resolved by email below, so this
// constant must track auth.users or the admin promotion silently finds nothing.
const ADMIN_EMAIL = "dvnvijay@durgaindustries.internal";
const EMPLOYEE_USERNAME = "maruthudvn";
const EMPLOYEE_EMAIL = `${EMPLOYEE_USERNAME}@durgaindustries.internal`;
const EMPLOYEE_DISPLAY_NAME = "Maruthu Dvn";

function hasServiceKey(): boolean {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return !!k && !k.startsWith("PASTE_") && k.length > 40;
}

async function promptPassword(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Password for ${EMPLOYEE_USERNAME}: `);
  rl.close();
  return answer.trim();
}

/** Supported path. Preferred whenever a real service_role key is present. */
async function createEmployeeAuthUser(password: string): Promise<string> {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await admin.auth.admin.createUser({
    email: EMPLOYEE_EMAIL,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

/**
 * Fallback when no service_role key is available: write the auth user directly.
 *
 * This is outside Supabase's supported API — it is what the dashboard does underneath.
 * Verified against this project before use:
 *   - pgcrypto is installed in the `extensions` schema, and crypt(pw, gen_salt('bf'))
 *     produces the same $2a$ 60-char bcrypt hash format GoTrue already stores.
 *   - auth.identities is empty, yet the existing user signs in, so no identity row is
 *     required for email/password auth here. Do not add one for this user alone.
 *   - DIRECT_URL connects as the `postgres` superuser.
 *
 * The row deliberately mirrors the existing account exactly: zeroed instance_id,
 * aud/role = 'authenticated', raw_app_meta_data naming the email provider.
 *
 * `confirmed_at` is GENERATED ALWAYS AS LEAST(email_confirmed_at, phone_confirmed_at) —
 * listing it is an error. Set email_confirmed_at and let Postgres derive it.
 *
 * `extensions.` qualification is deliberate: crypt() happens to resolve unqualified
 * today, but only because of the current search_path.
 *
 * ⚠ The four token columns MUST be '' and not NULL. GoTrue scans them into non-nullable
 * strings, so a NULL makes every sign-in fail — and because login() collapses any auth
 * error into `?error=invalid`, it surfaces as "Invalid username or password" rather than
 * anything that points at the real cause. This cost a debugging cycle; do not "tidy" them
 * away. Verified: the working account stores '' in all four.
 */
async function createEmployeeAuthUserViaSql(
  sql: postgres.Sql,
  password: string
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      is_super_admin, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      ${EMPLOYEE_EMAIL},
      extensions.crypt(${password}, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      '', '', '', '',
      false, now(), now()
    )
    RETURNING id
  `;
  return row.id;
}

async function main() {
  const { DIRECT_URL } = process.env;
  if (!DIRECT_URL) throw new Error("DIRECT_URL missing from .env.local");

  const sql = postgres(DIRECT_URL, { prepare: false });

  try {
    // ── 1. Admin ────────────────────────────────────────────────────────────
    // Resolve by email against auth.users, not a hardcoded UUID: a hardcoded id goes
    // stale if auth is ever recreated, and the admin would silently fail closed to
    // 'employee'. This needs no service-role key.
    const [adminAuth] = await sql<{ id: string }[]>`
      SELECT id FROM auth.users WHERE email = ${ADMIN_EMAIL}
    `;
    if (!adminAuth) throw new Error(`No Supabase auth user for ${ADMIN_EMAIL}. Nothing changed.`);

    const [adminRow] = await sql`SELECT id FROM app_users WHERE supabase_auth_id = ${adminAuth.id}`;
    if (adminRow) {
      await sql`UPDATE app_users SET role = 'admin' WHERE supabase_auth_id = ${adminAuth.id}`;
      console.log(`✓ admin: existing app_users row promoted (${ADMIN_EMAIL})`);
    } else {
      // auth user exists but has no bridge row — create one rather than leave them roleless.
      await sql`
        INSERT INTO app_users (username, supabase_auth_id, display_name, role)
        VALUES (${ADMIN_EMAIL.split("@")[0]}, ${adminAuth.id}, 'Admin', 'admin')
        ON CONFLICT (supabase_auth_id) DO UPDATE SET role = 'admin'
      `;
      console.log(`✓ admin: app_users row created (${ADMIN_EMAIL})`);
    }

    // ── 2. Employee auth user ───────────────────────────────────────────────
    // The two records (auth user, app_users row) can each exist independently, so
    // handle them as separate branches rather than assuming they agree.
    const [existingEmployeeAuth] = await sql<{ id: string }[]>`
      SELECT id FROM auth.users WHERE email = ${EMPLOYEE_EMAIL}
    `;

    let employeeAuthId: string;
    if (existingEmployeeAuth) {
      employeeAuthId = existingEmployeeAuth.id;
      console.log("• employee: auth user already exists, password left unchanged");
    } else {
      const password = process.env.EMPLOYEE_PASSWORD?.trim() || (await promptPassword());
      if (password.length < 6) throw new Error("Password must be at least 6 characters.");

      try {
        if (hasServiceKey()) {
          employeeAuthId = await createEmployeeAuthUser(password);
          console.log(`✓ employee: auth user created via admin API (${EMPLOYEE_EMAIL})`);
        } else {
          employeeAuthId = await createEmployeeAuthUserViaSql(sql, password);
          console.log(`✓ employee: auth user created via direct SQL (${EMPLOYEE_EMAIL})`);
          console.log("  (no SUPABASE_SERVICE_ROLE_KEY — paste one and this uses the admin API instead)");
        }
      } catch (e) {
        console.error("");
        console.error("✗ Could not create the employee auth user.");
        console.error("  The admin promotion above is done and committed.");
        console.error("");
        console.error("  Create the user by hand, then re-run this script (it will adopt it):");
        console.error("    Supabase Dashboard -> Authentication -> Users -> Add user");
        console.error(`      email:    ${EMPLOYEE_EMAIL}`);
        console.error("      password: (your choice)");
        console.error("      [x] Auto Confirm User");
        console.error("");
        throw e;
      }

      // Inserting the row only proves it was stored. It does NOT prove GoTrue will
      // accept the password. Say so, loudly.
      console.log("  ⚠ Not verified yet: sign in at /login as the employee to confirm.");
    }

    // ── 3. Employee bridge row ──────────────────────────────────────────────
    await sql`
      INSERT INTO app_users (username, supabase_auth_id, display_name, role)
      VALUES (${EMPLOYEE_USERNAME}, ${employeeAuthId}, ${EMPLOYEE_DISPLAY_NAME}, 'employee')
      ON CONFLICT (supabase_auth_id)
      DO UPDATE SET username     = EXCLUDED.username,
                    display_name = EXCLUDED.display_name,
                    role         = 'employee'
    `;
    console.log("✓ employee: app_users row upserted (role=employee)");

    const rows = await sql`SELECT username, role FROM app_users ORDER BY role, username`;
    console.table(rows);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
