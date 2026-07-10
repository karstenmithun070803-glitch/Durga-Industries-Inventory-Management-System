import * as React from "react";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { appUsers } from "@/lib/db/schema";

/**
 * React.cache() dedupes to one query per request, but it only exists in the React
 * server runtime. This module is imported (transitively, via materials.actions) by
 * plain-node vitest suites, where `cache` is undefined and calling it throws at import
 * time. Per-request dedupe is an optimisation, not a correctness requirement, so fall
 * back to the identity function.
 */
const perRequest: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof React.cache === "function" ? React.cache : (fn) => fn;

export type Role = "admin" | "employee";

export interface CurrentUser {
  authId: string;
  username: string;
  role: Role;
}

/**
 * Resolves the signed-in user and their role.
 *
 * Returns null when nobody is signed in. That is deliberately distinct from a
 * signed-in user with no app_users row, which fails closed to "employee" — a
 * caller that treats "employee" as proof of a real session would otherwise be
 * wrong for anonymous requests.
 *
 * The join is on supabase_auth_id, NEVER on the email prefix. app_users.username
 * does not track the auth email: the sole existing account is username "mithun"
 * with email "dvncoach@durgaindustries.internal". Deriving the username from the
 * email (as stock.actions.ts does for audit stamping) would silently resolve no
 * row here, and the admin would be demoted to employee.
 *
 * Deduped to one query per request where the React server runtime provides cache().
 */
export const getCurrentUser = perRequest(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ username: appUsers.username, role: appUsers.role })
    .from(appUsers)
    .where(eq(appUsers.supabase_auth_id, user.id));

  return {
    authId: user.id,
    username: row?.username ?? user.email?.split("@")[0] ?? "unknown",
    role: row?.role === "admin" ? "admin" : "employee",
  };
});

export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "admin";
}

/**
 * The authoritative admin check. Every admin-only server action must call this
 * first — hiding a nav item and returning 404 from a layout are cosmetic.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    throw new Error("Unauthorized: admin access required.");
  }
  return user;
}
