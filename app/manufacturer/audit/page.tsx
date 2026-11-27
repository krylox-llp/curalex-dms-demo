import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton, PageHeader } from "@/components/app-shell";
import { AuditView } from "@/components/audit-view";
import { ManufacturerNav } from "@/components/manufacturer/nav";
import { requireAccount } from "@/lib/account";
import { parseFilters } from "@/lib/audit";

export const metadata: Metadata = { title: "Audit trail · CuraLex - DMS" };

export default function AuditPage({ searchParams }: PageProps<"/manufacturer/audit">) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

async function Audit({ searchParams }: Pick<PageProps<"/manufacturer/audit">, "searchParams">) {
  const account = await requireAccount("manufacturer");
  const filters = parseFilters(await searchParams);
  return (
    <AppShell account={account} area="company" nav={<ManufacturerNav />}>
      <PageHeader
        title="Audit trail"
        description="A tamper-evident record of who did what and when. Entries can't be edited or deleted."
      />
      <AuditView basePath="/manufacturer/audit" filters={filters} />
    </AppShell>
  );
}
