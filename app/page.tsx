import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LandingPage } from "@/components/landing/landing-page";
import { getAccount, homeFor } from "@/lib/account";

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://dms.krylox.ai";
const DESCRIPTION =
  "Share CoAs, CoPPs, GMP certificates and dossiers with your exporters under control: versioned documents, time-limited access, every view and download logged, and expiry warnings.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "CuraLex - DMS · Document control for pharma manufacturers and exporters",
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "CuraLex - DMS",
    title: "Share regulatory documents with your exporters, without losing control",
    description: DESCRIPTION,
    images: [{ url: "/landing/manufacturer-overview.png", width: 2880, height: 1800, alt: "CuraLex - DMS manufacturer overview" }],
  },
  twitter: { card: "summary_large_image" },
};

/**
 * "/": the public landing page for visitors; signed-in users go straight to their workspace.
 * The landing page is the static fallback, so visitors get it immediately.
 */
export default function Home() {
  return (
    <Suspense fallback={<LandingPage />}>
      <HomeGate />
    </Suspense>
  );
}

async function HomeGate() {
  const account = await getAccount();
  if (!account) return <LandingPage />;
  redirect(homeFor(account) ?? "/login?error=not_invited");
}
