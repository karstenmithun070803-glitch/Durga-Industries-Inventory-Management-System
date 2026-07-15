import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { WebVitals } from "./web-vitals";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Sidebar tab + sub-tab LABELS only — see `font-nav` on the label spans in
// components/sidebar.tsx. Deliberately a different classification from Inter (geometric,
// single-story `a`) so it reads as a real change rather than another neutral sans.
// `weight` is always passed explicitly: next/font *requires* it for static families like
// Poppins (omitting it fails the build) and accepts it for variable ones.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-nav",
});

// Absolute base for manifest/icon URLs. Env-aware so preview deploys don't emit
// prod-pointing URLs: prefer an explicit site URL, else the current Vercel deployment URL,
// else localhost for `next dev`/`next start`.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Durga Industries IMS",
  description: "Inventory Management System",
  applicationName: "DVN IMS",
  manifest: "/manifest.webmanifest",
  // iOS reads the home-screen label from here (apple-mobile-web-app-title), NOT the manifest.
  // `title` MUST match manifest `short_name` ("DVN IMS") or Android and iOS disagree.
  // `statusBarStyle: "default"` (not "black-translucent") so content isn't pushed under the
  // notch given viewportFit: "cover".
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DVN IMS",
  },
};

// Enables device-width scaling and safe-area insets (notch / Dynamic Island / home bar)
// on phones via `viewportFit=cover`. No effect on desktop. `themeColor` tints the mobile
// status bar / installed-app title bar and matches the manifest theme_color.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster richColors position="top-right" />
        <WebVitals />
      </body>
    </html>
  );
}
