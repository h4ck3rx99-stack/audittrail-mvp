import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/app/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AuditTrail", template: "%s · AuditTrail" },
  description:
    "Continuous SOC 2 audit readiness: controls, evidence, reviews, gaps and a tamper-evident audit trail.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the nonce makes every page dynamic, which the per-request CSP nonce requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
