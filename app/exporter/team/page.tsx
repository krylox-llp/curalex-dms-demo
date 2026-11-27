import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton } from "@/components/app-shell";
import { TeamPage } from "@/components/team-page";
import { ExporterNav } from "@/components/exporter/nav";
import { requireAccount, requirePermission } from "@/lib/account";

export const metadata: Metadata = { title: "Team · CuraLex - DMS" };

export default function Page() {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <Team />
    </Suspense>
  );
}

async function Team() {
  const account = await requireAccount("exporter");
  requirePermission(account, "users.manage", "/exporter");
  return (
    <AppShell account={account} area="company" nav={<ExporterNav />}>
      <TeamPage type="exporter" />
    </AppShell>
  );
}
