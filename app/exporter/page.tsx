import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton, PageHeader } from "@/components/app-shell";
import { NewFppButton } from "@/components/exporter/fpp-controls";
import { ExporterNav } from "@/components/exporter/nav";
import { requireAccount } from "@/lib/account";
import { getFpps, getManufacturerOptions, getSharedDocuments, isExpiringSoon } from "@/lib/exporter/data";

export const metadata: Metadata = { title: "FPPs · CuraLex - DMS" };

export default function FppsPage() {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <Fpps />
    </Suspense>
  );
}

async function Fpps() {
  const account = await requireAccount("exporter");
  const { rows } = await loadFppRows();

  return (
    <AppShell account={account} area="company" nav={<ExporterNav />}>
      <PageHeader
        title="FPPs"
        description="Each finished pharmaceutical product with the manufacturers behind it and their documents in one place."
        actions={<NewFppButton />}
      />
      <div className="data-grid">
        <table>
          <thead>
            <tr>
              <th>FPP</th>
              <th>Manufacturers</th>
              <th>Documents</th>
              <th>Needs attention</th>
              <th className="w-12"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-14 text-center text-secondary">
                  No FPPs yet. Create one to group documents from its manufacturers.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="row-link">
                <td className="max-w-0 w-[34%]">
                  <Link href={`/exporter/fpps/${r.id}`} className="block min-w-0">
                    <span className="block truncate font-medium text-header" title={r.name}>{r.name}</span>
                    {r.details && <span className="block truncate text-[0.8125rem] text-secondary">{r.details}</span>}
                  </Link>
                </td>
                <td className="max-w-0 w-[30%]">
                  <span className="block truncate text-body" title={r.manufacturers.join(", ")}>
                    {r.manufacturers.length ? r.manufacturers.join(", ") : <span className="text-tertiary">None yet</span>}
                  </span>
                </td>
                <td className="text-body">{r.documents}</td>
                <td>
                  <span className="flex flex-wrap gap-1.5">
                    {r.expired > 0 && <span className="badge badge-error">{r.expired} expired</span>}
                    {r.expiring > 0 && <span className="badge badge-warning">{r.expiring} expiring soon</span>}
                    {r.unavailable > 0 && <span className="badge badge-contrast">{r.unavailable} no longer shared</span>}
                    {r.expired + r.expiring + r.unavailable === 0 && <span className="text-tertiary">—</span>}
                  </span>
                </td>
                <td className="text-right">
                  <Link href={`/exporter/fpps/${r.id}`} aria-label={`Open ${r.name}`} className="btn-tertiary btn-icon btn-sm text-secondary">
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

async function loadFppRows() {
  const [{ fpps, manufacturers, documents }, docs, options] = await Promise.all([
    getFpps(),
    getSharedDocuments(),
    getManufacturerOptions(),
  ]);
  const now = Date.now();
  const docById = new Map(docs.map((d) => [d.share_id, d]));
  const nameById = new Map(options.map((o) => [o.org_id, o.name]));
  const rows = fpps.map((f) => {
    const shareIds = documents.filter((d) => d.fpp_id === f.id).map((d) => d.share_id);
    const live = shareIds.map((id) => docById.get(id)).filter((d) => d !== undefined);
    return {
      id: f.id,
      name: f.name,
      details: f.details,
      manufacturers: manufacturers
        .filter((m) => m.fpp_id === f.id)
        .map((m) => nameById.get(m.manufacturer_org_id) ?? "Unknown"),
      documents: live.length,
      expired: live.filter((d) => d.expired).length,
      expiring: live.filter((d) => isExpiringSoon(d, now)).length,
      unavailable: shareIds.length - live.length,
    };
  });
  return { rows };
}
