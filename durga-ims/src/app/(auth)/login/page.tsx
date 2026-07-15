import { login } from "@/lib/actions/auth.actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Invalid username or password.",
  required: "Username and password are required.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const { error, reason } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "An error occurred.") : null;
  const sessionExpired = reason === "session_expired";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            DURGA INDUSTRIES
          </h1>
          <p className="text-sm text-slate-600 mt-1">Inventory Management System</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          <h2 className="text-base font-semibold text-slate-800 mb-6">Sign in</h2>

          {sessionExpired && (
            <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              Your session has expired. Please sign in again to continue.
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <form action={login} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs text-slate-600 uppercase tracking-wide">
                Username
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="e.g. mithun"
                autoComplete="username"
                autoFocus
                required
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs text-slate-600 uppercase tracking-wide">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-10"
              />
            </div>

            <Button type="submit" className="w-full h-10 mt-2">
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
