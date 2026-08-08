import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import "./globals.css";
import { getDefaultOrganizationBrand } from "@/lib/data/organization";

// NOTE: next/font/google requires reaching fonts.googleapis.com at build
// time, which this sandbox's network allowlist blocks — and more durably,
// no approved Camp Coleman typography has been supplied yet (see
// docs/brand-audit.md). Using a system-font stack via a plain CSS variable
// avoids both problems; swapping in a real brand font later (self-hosted
// via next/font/local, once Coleman supplies one, avoiding any runtime
// dependency on Google's font CDN) is a one-line change in globals.css.

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
    <html lang="en">
      <body style={brandStyle as CSSProperties} className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
