import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/auth";

/**
 * Gate for every /admin route.
 *
 * notFound() rather than redirect() so the route's existence is not revealed to a
 * non-admin. This cannot live in middleware.ts — middleware runs on the edge and
 * cannot use drizzle/postgres.js. It is also NOT the real security boundary: every
 * admin server action calls requireAdmin() independently.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) notFound();
  return <>{children}</>;
}
