import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton } from "@/components/app-shell";
import { TeamPage } from "@/components/team-page";
import { ManufacturerNav } from "@/components/manufacturer/nav";
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
  const account = await requireAccount("manufacturer");
  requirePermission(account, "users.manage", "/manufacturer");
  return (
    <AppShell account={account} area="company" nav={<ManufacturerNav />}>
      <TeamPage type="manufacturer" />
    </AppShell>
  );
}
