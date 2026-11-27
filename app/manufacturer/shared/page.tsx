import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton, PageHeader, StatusBadge, dateFormat } from "@/components/app-shell";
import { InviteExporterButton } from "@/components/manufacturer/invite-exporter-dialog";
import { ManufacturerNav } from "@/components/manufacturer/nav";
import { ExporterMenu } from "@/components/manufacturer/remove-exporter";
import { can, requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Shared with · CuraLex - DMS" };

const DAY = 86_400_000;

type ExporterSummary = {
  id: string;
  name: string;
  email: string | null;
  status: string;
  files: number;
  expiringSoon: number;
  expired: number;
  lastShared: string | null;
};

export default function SharedWithPage() {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <SharedWith />
    </Suspense>
  );
}

async function SharedWith() {
  const account = await requireAccount("manufacturer");
  const exporters = await loadExporters(account.org.id);

  return (
    <AppShell account={account} area="company" nav={<ManufacturerNav />}>
      <PageHeader
        title="Shared with"
        description="Exporters you work with and the documents they can access. Only exporters you invite can receive documents."
        actions={can(account, "exporters.invite") ? <InviteExporterButton /> : undefined}
      />

      <div className="data-grid">
        <table>
          <thead>
            <tr>
              <th>Exporter</th>
              <th>Status</th>
              <th>Shared files</th>
              <th>Needs attention</th>
              <th>Last shared</th>
              <th className="w-px"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {exporters.length === 0 && (
              <tr>
                <td colSpan={6} className="py-14 text-center text-secondary">
                  No exporters yet. Invite the exporters you work with to start sharing documents.
                </td>
              </tr>
            )}
            {exporters.map((e) => (
              <tr key={e.id} className="row-link">
                <td className="max-w-0 w-[38%]">
                  <Link href={`/manufacturer/shared/${e.id}`} className="block min-w-0 focus-visible:outline-none">
                    <span className="block truncate font-medium text-header" title={e.name}>{e.name}</span>
                    <span className="block truncate text-[0.8125rem] text-secondary">{e.email ?? "—"}</span>
                  </Link>
                </td>
                <td><StatusBadge status={e.status} /></td>
                <td>{e.files > 0 ? <span className="text-body">{e.files}</span> : <span className="text-tertiary">Nothing shared</span>}</td>
                <td>
                  <span className="flex flex-wrap gap-1.5">
                    {e.expired > 0 && <span className="badge badge-error">{e.expired} expired</span>}
                    {e.expiringSoon > 0 && <span className="badge badge-warning">{e.expiringSoon} expiring soon</span>}
                    {e.expired === 0 && e.expiringSoon === 0 && <span className="text-tertiary">—</span>}
                  </span>
                </td>
                <td className="whitespace-nowrap text-secondary">
                  {e.lastShared ? dateFormat.format(new Date(e.lastShared)) : "—"}
                </td>
                <td className="whitespace-nowrap text-right">
                  {can(account, "exporters.remove") && <ExporterMenu exporter={{ id: e.id, name: e.name }} liveFiles={e.files - e.expired} />}
                  <Link
                    href={`/manufacturer/shared/${e.id}`}
                    aria-label={`Open ${e.name}`}
                    className="btn-tertiary btn-icon btn-sm text-secondary"
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
                      <path d="M7.5 4.5L13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

/** Exporters linked to this manufacturer with counts of what they can access. */
async function loadExporters(orgId: string): Promise<ExporterSummary[]> {
  const supabase = await createClient();
  const [exportersRes, sharesRes] = await Promise.all([
    supabase.rpc("my_exporters"),
    supabase
      .from("document_shares")
      .select("exporter_org_id, expires_at, created_at")
      .eq("manufacturer_org_id", orgId)
      .is("revoked_at", null),
  ]);
  if (exportersRes.error) throw new Error(exportersRes.error.message);
  if (sharesRes.error) throw new Error(sharesRes.error.message);

  const now = Date.now();
  const list = exportersRes.data as { org_id: string; name: string; contact_email: string | null; status: string }[];
  return list
    .map((e) => {
      const shares = sharesRes.data.filter((s) => s.exporter_org_id === e.org_id);
      const expiry = (s: { expires_at: string | null }) => (s.expires_at ? new Date(s.expires_at).getTime() : Infinity);
      return {
        id: e.org_id,
        name: e.name,
        email: e.contact_email,
        status: e.status,
        files: shares.length,
        expiringSoon: shares.filter((s) => expiry(s) > now && expiry(s) - now <= 7 * DAY).length,
        expired: shares.filter((s) => expiry(s) <= now).length,
        lastShared: shares.reduce<string | null>((max, s) => (!max || s.created_at > max ? s.created_at : max), null),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
