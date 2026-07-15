import type { MetadataRoute } from "next";

// Installable-only PWA (no service worker / offline caching — stale stock would be a
// correctness hazard). See PLAN. Label ("DVN IMS") MUST match `appleWebApp.title` in
// layout.tsx, since iOS takes the home-screen name from the Apple meta, not this file.
//
// theme_color / background_color are derived from the app's --primary (222 47% 11% ≈
// #0f172a) and white --background. Confirm against final branding.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DVN Inventory Management System",
    short_name: "DVN IMS",
    description: "Inventory management for Durga Industries — stock, transactions, invoices, and reports.",
    lang: "en",
    categories: ["business", "productivity"],
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    // `orientation` deliberately omitted — this is a desktop-and-tablet app (wide tables,
    // invoices, reports); locking portrait would harm landscape use.
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Separate entry — never combine "any maskable" on one icon, or Android may crop the
      // non-safe-zone version.
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
