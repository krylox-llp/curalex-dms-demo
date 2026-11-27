import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin-nav";
import { AppShell, AppShellSkeleton, PageHeader } from "@/components/app-shell";
import { AuditView } from "@/components/audit-view";
import { requireAccount } from "@/lib/account";
import { parseFilters } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit trail · CuraLex - DMS" };

export default function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <AdminAudit searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminAudit({ searchParams }: Pick<PageProps<"/admin/audit">, "searchParams">) {
  const account = await requireAccount("admin");
  const filters = parseFilters(await searchParams);
  const supabase = await createClient();
  const { data: chain } = await supabase.rpc("verify_audit_chain");
  const result = chain as { ok: boolean; checked: number; broken_at?: number } | null;

  return (
    <AppShell account={account} area="admin" nav={<AdminNav />}>
      <PageHeader title="Audit trail" description="All activity across CuraLex - DMS. Entries are append-only and hash-chained." />
      {result && (
        <p role="status" className={`notice mb-4 ${result.ok ? "notice-success" : "notice-error"}`}>
          {result.ok
            ? `Integrity check passed: ${result.checked} entries verified, hash chain intact.`
            : `Integrity check FAILED at entry #${result.broken_at} (checked ${result.checked}). The audit trail may have been altered outside the application.`}
        </p>
      )}
      <AuditView basePath="/admin/audit" filters={filters} />
    </AppShell>
  );
}
