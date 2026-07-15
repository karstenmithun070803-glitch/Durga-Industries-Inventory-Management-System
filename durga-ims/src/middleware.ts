import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Public PWA assets must never be auth-gated: browsers fetch the manifest/icons without
// credentials, and a redirect to /login would make the app non-installable. This is a
// belt-and-braces guard alongside the matcher exemption below — if a future refactor drops
// the matcher entry, this early-return still keeps these paths public.
const PUBLIC_PWA_ASSETS = [
  "/manifest.webmanifest",
  "/icon.png",
  "/apple-icon.png",
];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (PUBLIC_PWA_ASSETS.includes(pathname) || pathname.startsWith("/icons/")) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — required for Server Components to pick up auth state
  const { data: { user } } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // If a Supabase auth cookie existed, the session expired rather than never existing
    const hadSession = request.cookies.getAll().some(
      (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
    );
    if (hadSession) url.searchParams.set("reason", "session_expired");
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Skip Next.js internals, static files, image routes, and internal admin API
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|api/admin|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
