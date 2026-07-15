import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { FYProvider } from "@/lib/financial-year";
import { FYBanner } from "@/components/fy-banner";
import { AuthSessionGuard } from "@/components/auth-session-guard";
import { KeepAliveHeartbeat } from "@/components/keep-alive-heartbeat";
import { isAdmin } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Hides the Admin nav group. Cosmetic only — the real boundary is requireAdmin()
  // inside the server actions, plus the notFound() guard in the /admin layout.
  const admin = await isAdmin();

  return (
    <FYProvider>
      <AuthSessionGuard />
      <KeepAliveHeartbeat />
      <div className="flex h-dvh overflow-hidden bg-gray-50">
        <Sidebar isAdmin={admin} />
        <div className="flex flex-col flex-1 overflow-hidden max-lg:min-w-0">
          <MobileNav isAdmin={admin} />
          <FYBanner />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </FYProvider>
  );
}
