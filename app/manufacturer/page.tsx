import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton } from "@/components/app-shell";
import { initialsOf, toneFor } from "@/components/manufacturer/exporter-avatars";
import { InviteExporterButton } from "@/components/manufacturer/invite-exporter-dialog";
import { UploadButton } from "@/components/manufacturer/upload";
import { ActivityFeed, Attention, Kpi, Panel, type ActivityItem, type AttentionItem } from "@/components/overview";
import { can, requireAccount } from "@/lib/account";
import { daysUntil, formatDate, getDocuments, requestTime, todayInIndia, type DocumentWithVersions } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview · CuraLex - DMS" };

const DAY = 86_400_000;
const dateTime = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

export default function ManufacturerOverviewPage() {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <Overview />
    </Suspense>
  );
}

type Event = { id: number; action: "view" | "download"; user_email: string | null; exporter_org_id: string; version_id: string; created_at: string };

async function Overview() {
  const account = await requireAccount("manufacturer");
  const supabase = await createClient();
  const canActivity = can(account, "activity.view");
  const now = requestTime();
  const today = todayInIndia();

  const [docs, exportersRes, eventsRes] = await Promise.all([
    getDocuments("all"),
    supabase.rpc("my_exporters"),
    canActivity
      ? supabase
          .from("access_events")
          .select("id, action, user_email, exporter_org_id, version_id, created_at")
          .gte("created_at", new Date(now - 90 * DAY).toISOString())
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as Event[], error: null }),
  ]);
  if (exportersRes.error) throw new Error(exportersRes.error.message);
  if (eventsRes.error) throw new Error(eventsRes.error.message);
  const exporters = exportersRes.data as { org_id: string; name: string; status: string }[];
  const events = (eventsRes.data ?? []) as Event[];
  const exporterName = new Map(exporters.map((e) => [e.org_id, e.name]));
  const versionInfo = new Map(docs.flatMap((d) => d.versions.map((v) => [v.id, { doc: d, version: v.version }] as const)));

  // Key figures
  const newVersions = docs.reduce((n, d) => n + d.versions.filter((v) => now - Date.parse(v.created_at) <= 30 * DAY).length, 0);
  const shares = docs.flatMap((d) => d.shares.map((s) => ({ ...s, doc: d })));
  const sharingExporters = new Set(shares.map((s) => s.exporterId));
  const withExpiry = docs.filter((d) => d.details.expiry_date).map((d) => ({ d, days: daysUntil(d.details.expiry_date!, today) }));
  const expiringSoon = withExpiry.filter((x) => x.days >= 0 && x.days <= 30);
  const expired = withExpiry.filter((x) => x.days < 0);
  const week = events.filter((e) => now - Date.parse(e.created_at) <= 7 * DAY);
  const weekViews = week.filter((e) => e.action === "view").length;
  const weekDownloads = week.length - weekViews;
  const busiest = mostFrequent(week.map((e) => e.exporter_org_id));

  // Needs attention
  const docHref = (d: DocumentWithVersions) => `/manufacturer/documents?${d.folderId ? `folder=${d.folderId}&` : ""}doc=${d.id}`;
  const attention: AttentionItem[] = [];
  for (const { d, days } of [...expired, ...expiringSoon].sort((a, b) => a.days - b.days)) {
    const exportersHolding = new Set(d.shares.map((s) => s.exporterId)).size;
    attention.push({
      key: `exp-${d.id}`,
      tone: "error",
      kind: "expiry",
      title: d.name,
      badge: days < 0 ? "Expired" : days === 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}`,
      detail: [
        formatDate(d.details.expiry_date),
        d.details.product,
        exportersHolding ? `shared with ${exportersHolding} exporter${exportersHolding === 1 ? "" : "s"}` : "not shared",
      ].filter(Boolean).join(" · "),
      action: { label: can(account, "documents.edit") ? "Upload renewal" : "Open", href: docHref(d) },
    });
  }
  for (const s of shares.filter((s) => s.expiresAt && Date.parse(s.expiresAt) - now <= 7 * DAY).sort((a, b) => Date.parse(a.expiresAt!) - Date.parse(b.expiresAt!))) {
    const days = Math.max(0, Math.ceil((Date.parse(s.expiresAt!) - now) / DAY));
    attention.push({
      key: `share-${s.shareId}`,
      tone: "warning",
      kind: "clock",
      title: s.doc.name,
      badge: days === 0 ? "Access ends today" : `Access ends in ${days} day${days === 1 ? "" : "s"}`,
      detail: `${s.exporterName} · v${s.version} · until ${formatDate(s.expiresAt)}`,
      action: { label: can(account, "sharing.share") ? "Extend" : "Open", href: `/manufacturer/shared/${s.exporterId}` },
    });
  }
  for (const s of shares.filter((s) => s.version < s.doc.versions[0].version)) {
    attention.push({
      key: `old-${s.shareId}`,
      tone: "contrast",
      kind: "version",
      title: s.doc.name,
      badge: "Older version shared",
      detail: `${s.exporterName} has v${s.version} · latest is v${s.doc.versions[0].version}`,
      action: can(account, "sharing.share")
        ? { label: `Share v${s.doc.versions[0].version}`, href: `/manufacturer/share?v=${s.doc.versions[0].id}&to=${s.exporterId}` }
        : { label: "Open", href: docHref(s.doc) },
    });
  }
  const untyped = docs.filter((d) => !d.details.doc_type).length;
  if (untyped > 0 && can(account, "documents.edit")) {
    attention.push({
      key: "untyped",
      tone: "info",
      kind: "info",
      title: `${untyped} document${untyped === 1 ? "" : "s"} without details`,
      badge: "Details missing",
      detail: "Add type, product and expiry date so warnings and filters work",
      action: { label: "Review", href: "/manufacturer/documents" },
    });
  }

  // Exporters table
  const lastActivity = new Map<string, string>();
  for (const e of events) if (!lastActivity.has(e.exporter_org_id)) lastActivity.set(e.exporter_org_id, e.created_at);
  const exporterRows = exporters.map((e) => {
    const theirs = shares.filter((s) => s.exporterId === e.org_id);
    const next = theirs.map((s) => s.expiresAt).filter((x): x is string => Boolean(x)).sort()[0] ?? null;
    return { ...e, documents: new Set(theirs.map((s) => s.doc.id)).size, next, last: lastActivity.get(e.org_id) ?? null };
  });

  const firstName = account.name?.split(" ")[0];

  return (
    <AppShell account={account} area="company">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-[1.75rem] font-semibold leading-tight text-header">{firstName ? `${greeting()}, ${firstName}` : "Overview"}</h1>
          <p className="mt-1 text-[0.9375rem] text-secondary">{account.org.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {can(account, "exporters.invite") && <InviteExporterButton />}
          {can(account, "documents.edit") && <UploadButton folderId={null} />}
        </div>
      </div>

      <section aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Controlled documents" value={docs.length} note={`${newVersions} new version${newVersions === 1 ? "" : "s"} in the last 30 days`} href="/manufacturer/documents" />
        <Kpi label="Active shares" value={shares.length} note={`with ${sharingExporters.size} exporter${sharingExporters.size === 1 ? "" : "s"}`} href="/manufacturer/shared" />
        <Kpi
          label="Expiring within 30 days"
          value={expiringSoon.length}
          note={expired.length ? `${expired.length} already expired` : withExpiry.length ? "Based on recorded expiry dates" : "No expiry dates recorded yet"}
          tone={expiringSoon.length || expired.length ? "warning" : undefined}
          href="/manufacturer/documents?expiry=30"
        />
        {canActivity ? (
          <Kpi
            label="Exporter activity · 7 days"
            value={weekViews + weekDownloads}
            note={
              week.length
                ? `${weekViews} view${weekViews === 1 ? "" : "s"}, ${weekDownloads} download${weekDownloads === 1 ? "" : "s"} · most by ${exporterName.get(busiest!) ?? "—"}`
                : "No views or downloads this week"
            }
          />
        ) : (
          <Kpi label="Exporters" value={exporters.length} note={`${exporters.filter((e) => e.status !== "active").length} invited, not signed in yet`} href="/manufacturer/shared" />
        )}
      </section>

      <div className={`mt-5 grid grid-cols-1 gap-5 ${canActivity ? "xl:grid-cols-2" : ""}`}>
        <Panel title="Needs attention" aside={<span className="badge badge-contrast badge-sm">{attention.length} item{attention.length === 1 ? "" : "s"}</span>}>
          <Attention items={attention.slice(0, 6)} empty="Expiring documents, shares ending soon and exporters holding older versions will show up here." />
          {attention.length > 6 && <p className="border-t border-contrast-10 px-5 py-3 text-sm text-secondary">and {attention.length - 6} more</p>}
        </Panel>

        {canActivity && (
          <Panel title="Recent exporter activity" aside={can(account, "audit.view") && <Link href="/manufacturer/audit?category=access" className="text-sm font-medium text-primary-text hover:underline">Audit trail</Link>}>
            {events.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-secondary">No exporter has viewed or downloaded a document yet.</p>
            ) : (
              <>
              <ActivityFeed
                today={today}
                items={events.slice(0, 6).map((e): ActivityItem => {
                  const info = versionInfo.get(e.version_id);
                  return {
                    id: e.id,
                    action: e.action,
                    actor: e.user_email ?? "An exporter user",
                    company: exporterName.get(e.exporter_org_id) ?? "Former exporter",
                    companyId: e.exporter_org_id,
                    target: info ? `${info.doc.name} v${info.version}` : "a deleted document",
                    href: info ? docHref(info.doc) : undefined,
                    at: e.created_at,
                  };
                })}
                avatar={(item) => (
                  <span className={`grid size-9 place-items-center rounded-full text-xs font-semibold ${toneFor(item.companyId)}`} aria-hidden="true">
                    {initialsOf(item.company)}
                  </span>
                )}
              />
              {events.length > 6 && can(account, "audit.view") && (
                <Link href="/manufacturer/audit?category=access" className="block border-t border-contrast-10 px-5 py-3 text-sm font-medium text-primary-text hover:bg-contrast-5">
                  See all views and downloads
                </Link>
              )}
              </>
            )}
          </Panel>
        )}
      </div>

      <Panel className="mt-5" title="Exporters" aside={<Link href="/manufacturer/shared" className="text-sm font-medium text-primary-text hover:underline">View all</Link>}>
        {exporterRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-secondary">No exporters yet. Invite one to start sharing documents.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.9375rem] tabular-nums">
              <thead>
                <tr className="border-b border-contrast-10 text-sm font-medium text-body">
                  <th className="px-5 py-2.5 font-medium">Exporter</th>
                  <th className="px-5 py-2.5 font-medium">Documents shared</th>
                  {canActivity && <th className="px-5 py-2.5 font-medium">Last activity</th>}
                  <th className="px-5 py-2.5 font-medium">Next access end</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {exporterRows.map((e) => {
                  const ends = e.next ? Math.ceil((Date.parse(e.next) - now) / DAY) : null;
                  return (
                    <tr key={e.org_id} className="border-t border-contrast-10 first:border-t-0">
                      <td className="px-5 py-3">
                        <Link href={`/manufacturer/shared/${e.org_id}`} className="font-medium text-header hover:text-primary-text hover:underline">{e.name}</Link>
                      </td>
                      <td className="px-5 py-3">{e.documents}</td>
                      {canActivity && <td className="px-5 py-3 text-secondary">{e.last ? dateTime.format(new Date(e.last)) : "No activity yet"}</td>}
                      <td className="whitespace-nowrap px-5 py-3">
                        {e.next ? (
                          <>
                            {formatDate(e.next)}
                            {ends !== null && ends <= 7 && <span className="badge badge-sm badge-warning ml-2">{ends} day{ends === 1 ? "" : "s"}</span>}
                          </>
                        ) : (
                          <span className="text-secondary">{e.documents ? "No end date" : "—"}</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {e.status === "active" ? <span className="badge badge-success badge-sm">Active</span> : <span className="badge badge-contrast badge-sm">Invited</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AppShell>
  );
}

function mostFrequent(ids: string[]) {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
