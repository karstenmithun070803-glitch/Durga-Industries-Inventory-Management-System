import { Sidebar } from "@/components/sidebar";
import { FYProvider } from "@/lib/financial-year";
import { FYBanner } from "@/components/fy-banner";
import { AuthSessionGuard } from "@/components/auth-session-guard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <FYProvider>
      <AuthSessionGuard />
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <FYBanner />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </FYProvider>
  );
}
