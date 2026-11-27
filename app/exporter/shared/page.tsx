import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton, PageHeader, dateFormat } from "@/components/app-shell";
import { ExporterNav } from "@/components/exporter/nav";
import { requireAccount } from "@/lib/account";
import { getManufacturerOptions, getSharedDocuments, isExpiringSoon } from "@/lib/exporter/data";

export const metadata: Metadata = { title: "Shared with me · CuraLex - DMS" };

export default function SharedWithMePage() {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <SharedWithMe />
    </Suspense>
  );
}

async function SharedWithMe() {
  const account = await requireAccount("exporter");
  const rows = await loadManufacturers();

  return (
    <AppShell account={account} area="company" nav={<ExporterNav />}>
      <PageHeader
        title="Shared with me"
        description="Manufacturers who have added you and the documents they share. Access is set by each manufacturer."
      />
      <div className="data-grid">
        <table>
          <thead>
            <tr>
              <th>Manufacturer</th>
              <th>Shared files</th>
              <th>Needs attention</th>
              <th>Last shared</th>
              <th className="w-12"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-14 text-center text-secondary">
                  No manufacturers yet. They appear here once a manufacturer invites you.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="row-link">
                <td className="max-w-0 w-[40%]">
                  <Link href={`/exporter/shared/${r.id}`} className="block truncate font-medium text-header" title={r.name}>
                    {r.name}
                  </Link>
                </td>
                <td className="text-body">{r.files}</td>
                <td>
                  <span className="flex flex-wrap gap-1.5">
                    {r.expired > 0 && <span className="badge badge-error">{r.expired} expired</span>}
                    {r.expiring > 0 && <span className="badge badge-warning">{r.expiring} expiring soon</span>}
                    {r.expired + r.expiring === 0 && <span className="text-tertiary">—</span>}
                  </span>
                </td>
                <td className="whitespace-nowrap text-secondary">{r.lastShared ? dateFormat.format(new Date(r.lastShared)) : "—"}</td>
                <td className="text-right">
                  <Link href={`/exporter/shared/${r.id}`} aria-label={`Open ${r.name}`} className="btn-tertiary btn-icon btn-sm text-secondary">
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

async function loadManufacturers() {
  const [docs, options] = await Promise.all([getSharedDocuments(), getManufacturerOptions()]);
  const now = Date.now();
  return options.map((m) => {
    const mine = docs.filter((d) => d.manufacturer_id === m.org_id);
    return {
      id: m.org_id,
      name: m.name,
      files: mine.length,
      expired: mine.filter((d) => d.expired).length,
      expiring: mine.filter((d) => isExpiringSoon(d, now)).length,
      lastShared: mine.reduce<string | null>((max, d) => (!max || d.shared_at > max ? d.shared_at : max), null),
    };
  });
}
