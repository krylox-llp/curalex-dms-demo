import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton } from "@/components/app-shell";
import { Attention, Kpi, Panel, type AttentionItem } from "@/components/overview";
import { can, requireAccount } from "@/lib/account";
import { daysUntil, docType, formatDate, requestTime, todayInIndia } from "@/lib/documents-shared";
import { getFpps, getSharedDocuments, type SharedDoc } from "@/lib/exporter/data";

export const metadata: Metadata = { title: "Overview · CuraLex - DMS" };

const DAY = 86_400_000;

export default function ExporterOverviewPage() {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const account = await requireAccount("exporter");
  const [shared, { fpps, manufacturers, documents }] = await Promise.all([getSharedDocuments(), getFpps()]);
  const now = requestTime();
  const today = todayInIndia();

  const live = shared.filter((d) => !d.expired);
  const byShare = new Map(shared.map((d) => [d.share_id, d]));
  const makers = new Set(live.map((d) => d.manufacturer_id));
  const newThisWeek = live.filter((d) => now - Date.parse(d.shared_at) <= 7 * DAY).length;
  const accessEnding = live.filter((d) => d.expires_at && Date.parse(d.expires_at) - now <= 30 * DAY);
  const certDays = (d: SharedDoc) => (d.document_expiry ? daysUntil(d.document_expiry, today) : null);
  const certExpiring = live.filter((d) => {
    const days = certDays(d);
    return days !== null && days <= 30;
  });
  const superseded = live.filter((d) => d.latest_version !== null && d.latest_version > d.version);

  // Per product: which attached documents are still available, and what needs attention.
  const products = fpps.map((p) => {
    const attached = documents.filter((x) => x.fpp_id === p.id).map((x) => byShare.get(x.share_id) ?? null);
    const available = attached.filter((d): d is SharedDoc => d !== null && !d.expired);
    const ended = attached.length - available.length;
    const issues: { label: string; tone: "error" | "warning" | "contrast" }[] = [];
    if (ended) issues.push({ label: `${ended} no longer available`, tone: "error" });
    const expiredCerts = available.filter((d) => (certDays(d) ?? 1) < 0).length;
    if (expiredCerts) issues.push({ label: `${expiredCerts} expired`, tone: "error" });
    const soonCerts = available.filter((d) => { const x = certDays(d); return x !== null && x >= 0 && x <= 30; }).length;
    if (soonCerts) issues.push({ label: `${soonCerts} expiring ≤ 30 days`, tone: "warning" });
    const ending = available.filter((d) => d.expires_at && Date.parse(d.expires_at) - now <= 30 * DAY).length;
    if (ending) issues.push({ label: `${ending} access ending`, tone: "warning" });
    const old = available.filter((d) => d.latest_version !== null && d.latest_version > d.version).length;
    if (old) issues.push({ label: `${old} newer version exists`, tone: "contrast" });
    const status =
      attached.length === 0
        ? { label: "No documents", cls: "badge-contrast" }
        : issues.some((i) => i.tone === "error")
          ? { label: "Action needed", cls: "badge-error" }
          : issues.length
            ? { label: "Check soon", cls: "badge-warning" }
            : { label: "Up to date", cls: "badge-success" };
    return {
      ...p,
      makerCount: manufacturers.filter((m) => m.fpp_id === p.id).length,
      attached: attached.length,
      available: available.length,
      issues,
      status,
    };
  });
  const incomplete = products.filter((p) => p.status.label !== "Up to date").length;

  const attention: AttentionItem[] = [
    ...certExpiring
      .sort((a, b) => (certDays(a) ?? 0) - (certDays(b) ?? 0))
      .map((d): AttentionItem => {
        const days = certDays(d)!;
        return {
          key: `cert-${d.share_id}`,
          tone: "error",
          kind: "expiry",
          title: d.file_name,
          badge: days < 0 ? "Expired" : days === 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}`,
          detail: [formatDate(d.document_expiry), d.manufacturer_name, d.product].filter(Boolean).join(" · "),
          action: { label: "Open", href: `/exporter/shared/${d.manufacturer_id}` },
        };
      }),
    ...accessEnding
      .sort((a, b) => Date.parse(a.expires_at!) - Date.parse(b.expires_at!))
      .map((d): AttentionItem => {
        const days = Math.max(0, Math.ceil((Date.parse(d.expires_at!) - now) / DAY));
        return {
          key: `end-${d.share_id}`,
          tone: "warning",
          kind: "clock",
          title: d.file_name,
          badge: days === 0 ? "Access ends today" : `Access ends in ${days} day${days === 1 ? "" : "s"}`,
          detail: `${d.manufacturer_name} · v${d.version} · until ${formatDate(d.expires_at)}`,
          action: { label: "Open", href: `/exporter/shared/${d.manufacturer_id}` },
        };
      }),
    ...superseded.map((d): AttentionItem => ({
      key: `old-${d.share_id}`,
      tone: "contrast",
      kind: "version",
      title: d.file_name,
      badge: `Superseded by v${d.latest_version}`,
      detail: `You have v${d.version} · ${d.manufacturer_name}`,
      action: { label: "Open", href: `/exporter/shared/${d.manufacturer_id}` },
    })),
  ];

  const recent = [...live].sort((a, b) => Date.parse(b.shared_at) - Date.parse(a.shared_at)).slice(0, 6);

  return (
    <AppShell account={account} area="company">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-[1.75rem] font-semibold leading-tight text-header">Overview</h1>
          <p className="mt-1 text-[0.9375rem] text-secondary">Documents from your manufacturers, by product.</p>
        </div>
        {can(account, "products.edit") && (
          <Link href="/exporter/products" className="btn-primary">Manage products</Link>
        )}
      </div>

      <section aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Products" value={fpps.length} note={fpps.length ? `${incomplete} need${incomplete === 1 ? "s" : ""} attention` : "Group documents by product"} href="/exporter/products" />
        <Kpi label="Documents received" value={live.length} note={`from ${makers.size} manufacturer${makers.size === 1 ? "" : "s"} · ${newThisWeek} new this week`} href="/exporter/shared" />
        <Kpi
          label="Certificates expiring ≤ 30 days"
          value={certExpiring.length}
          note={certExpiring.length ? "Ask manufacturers for renewals" : "Based on the manufacturers' expiry dates"}
          tone={certExpiring.length ? "warning" : undefined}
        />
        <Kpi label="Access ending ≤ 30 days" value={accessEnding.length} note={superseded.length ? `${superseded.length} superseded by newer versions` : "Shares with an end date"} tone={accessEnding.length ? "warning" : undefined} />
      </section>

      <Panel className="mt-5" title="Product readiness" aside={<span className="text-[0.8125rem] text-secondary">Attached documents and their status</span>}>
        {products.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-secondary">
            No products yet. <Link href="/exporter/products" className="font-medium text-primary-text hover:underline">Create a product</Link> to group documents from its manufacturers.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.9375rem] tabular-nums">
              <thead>
                <tr className="border-b border-contrast-10 text-sm">
                  <th className="px-5 py-2.5 font-medium">Product</th>
                  <th className="px-5 py-2.5 font-medium">Manufacturers</th>
                  <th className="px-5 py-2.5 font-medium">Documents</th>
                  <th className="px-5 py-2.5 font-medium">Needs attention</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-contrast-10 first:border-t-0">
                    <td className="px-5 py-3">
                      <Link href={`/exporter/fpps/${p.id}`} className="font-semibold text-header hover:text-primary-text hover:underline">{p.name}</Link>
                      {p.details && <span className="block text-xs text-secondary">{p.details}</span>}
                    </td>
                    <td className="px-5 py-3">{p.makerCount}</td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2.5">
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-contrast-10" aria-hidden="true">
                          <span
                            className={`block h-full rounded-full ${p.available === p.attached ? "bg-success" : "bg-warning"}`}
                            style={{ width: `${p.attached ? Math.round((p.available / p.attached) * 100) : 0}%` }}
                          />
                        </span>
                        <span className="text-[0.8125rem] text-secondary">{p.available} of {p.attached} available</span>
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {p.issues.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {p.issues.map((i) => (
                            <span key={i.label} className={`badge badge-sm badge-${i.tone}`}>{i.label}</span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-secondary">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3"><span className={`badge badge-sm ${p.status.cls}`}>{p.status.label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Needs attention" aside={<span className="badge badge-contrast badge-sm">{attention.length} item{attention.length === 1 ? "" : "s"}</span>}>
          <Attention items={attention.slice(0, 6)} empty="Expiring certificates, access ending soon and superseded versions will show up here." />
        </Panel>
        <Panel title="Recently received" aside={<Link href="/exporter/shared" className="text-sm font-medium text-primary-text hover:underline">Shared with me</Link>}>
          {recent.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-secondary">No documents shared with you yet.</p>
          ) : (
            <ul>
              {recent.map((d) => {
                const type = docType(d.doc_type);
                const isNew = now - Date.parse(d.shared_at) <= 7 * DAY;
                return (
                  <li key={d.share_id} className="flex items-center gap-3 border-t border-contrast-10 px-5 py-3 first:border-t-0">
                    <span className="w-14 shrink-0">{isNew && <span className="badge badge-sm">New</span>}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-header">{d.file_name}</span>
                        <span className="shrink-0 text-xs text-secondary">v{d.version}</span>
                        {type && <span className="doc-type shrink-0">{type.short}</span>}
                      </span>
                      <span className="block truncate text-[0.8125rem] text-secondary">
                        {d.manufacturer_name} · {d.expires_at ? `until ${formatDate(d.expires_at)}` : "no end date"}
                      </span>
                    </span>
                    <Link href={`/exporter/shared/${d.manufacturer_id}`} className="btn-tertiary btn-sm shrink-0">Open</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
