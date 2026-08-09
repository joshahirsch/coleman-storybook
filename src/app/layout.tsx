import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { getDefaultOrganizationBrand } from "@/lib/data/organization";

// Self-hosted Camp Coleman brand typefaces (Montserrat for headings, Open
// Sans for body — matching the live campcoleman.org site, see
// docs/brand-audit.md). Loaded via next/font/local from committed .woff2
// files in ./fonts so there's no runtime/build-time dependency on Google's
// font CDN (next/font/google would otherwise fetch fonts.googleapis.com at
// build time, which isn't reachable from every build environment). Both
// are OFL-licensed; license text is alongside the font files.
const montserrat = localFont({
  src: [
    { path: "./fonts/montserrat-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/montserrat-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/montserrat-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-montserrat",
  display: "swap",
});

const openSans = localFont({
  src: [
    { path: "./fonts/open-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/open-sans-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-open-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Coleman Storybook",
  description: "Share your Camp Coleman story.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const brand = await getDefaultOrganizationBrand().catch(() => null);

  const brandStyle: Record<string, string> = {};
  if (brand?.primaryColor) brandStyle["--brand-primary"] = brand.primaryColor;
  if (brand?.secondaryColor) brandStyle["--brand-secondary"] = brand.secondaryColor;
  if (brand?.accentColor) brandStyle["--brand-accent"] = brand.accentColor;

  return (
    <html lang="en" className={`${montserrat.variable} ${openSans.variable}`}>
      <body style={brandStyle as CSSProperties} className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
