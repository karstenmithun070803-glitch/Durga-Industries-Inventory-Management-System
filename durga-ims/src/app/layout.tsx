import type { Metadata } from "next";
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
    <html lang="en" className={`${inter.variable} ${poppins.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster richColors position="top-right" />
        <WebVitals />
      </body>
    </html>
  );
}
