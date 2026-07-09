import type { Metadata } from "next";
import { Inter, IBM_Plex_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { WebVitals } from "./web-vitals";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Sidebar nav only (tabs + sub-tabs) — see `font-nav` on <nav> in components/sidebar.tsx.
// IBM Plex Sans is a STATIC family on Google Fonts, so `weight` is required; omitting it
// fails the build. Only the weights the sidebar actually uses are loaded.
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-nav",
});

export const metadata: Metadata = {
  title: "Durga Industries IMS",
  description: "Inventory Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${ibmPlexSans.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster richColors position="top-right" />
        <WebVitals />
      </body>
    </html>
  );
}
