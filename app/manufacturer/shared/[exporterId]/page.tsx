import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton, PageHeader, StatusBadge } from "@/components/app-shell";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ManufacturerNav } from "@/components/manufacturer/nav";
import { ExporterMenu } from "@/components/manufacturer/remove-exporter";
import { SharesTable, type ShareRow } from "@/components/manufacturer/shares-table";
import { requireAccount } from "@/lib/account";
import { folderPathLabel, getFolders, isUuid } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Shared with · CuraLex - DMS" };

export default function ExporterSharesPage(props: PageProps<"/manufacturer/shared/[exporterId]">) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <ExporterShares {...props} />
    </Suspense>
  );
}

async function ExporterShares({ params, searchParams }: PageProps<"/manufacturer/shared/[exporterId]">) {
  const account = await requireAccount("manufacturer");
  const { exporterId } = await params;
  const { shared } = await searchParams;
  if (!isUuid(exporterId)) notFound();

  const data = await loadExporterShares(account.org.id, exporterId);
  if (!data) notFound();
  const { exporter, rows, now } = data;
  const justShared = typeof shared === "string" ? Number(shared) : 0;

  return (
    <AppShell account={account} area="company" nav={<ManufacturerNav />}>
      <PageHeader
        title={exporter.name}
        description={
          <span className="flex items-center gap-2">
            {exporter.contact_email}
            <StatusBadge status={exporter.status} />
          </span>
        }
        breadcrumb={<Breadcrumbs items={[{ label: "Shared with", href: "/manufacturer/shared" }, { label: exporter.name }]} />}
        actions={
          <>
            <Link href={`/manufacturer?to=${exporter.org_id}`} className="btn-primary">Share files</Link>
            <ExporterMenu
              exporter={{ id: exporter.org_id, name: exporter.name }}
              liveFiles={rows.filter((r) => !r.expiresAt || new Date(r.expiresAt).getTime() > now).length}
              redirectTo="/manufacturer/shared"
            />
          </>
        }
      />

      {exporter.status !== "active" && (
        <p className="notice mb-4">
          {exporter.name} hasn&apos;t signed in yet. Files you share will be waiting when they sign in with{" "}
          {exporter.contact_email ?? "the invited email"}.
        </p>
      )}
      {justShared > 0 && (
        <p role="status" className="notice notice-success mb-4">
          {justShared} file{justShared === 1 ? "" : "s"} shared with {exporter.name}.
        </p>
      )}

      <SharesTable rows={rows} now={now} />
    </AppShell>
  );
}

/** One exporter (must be linked to this manufacturer) and the live shares it has. */
async function loadExporterShares(orgId: string, exporterId: string) {
  const supabase = await createClient();
  const [exportersRes, sharesRes, folders, eventsRes] = await Promise.all([
    supabase.rpc("my_exporters"),
    supabase
      .from("document_shares")
      .select("id, expires_at, created_at, version:document_versions!inner(version, document:documents!inner(name, folder_id))")
      .eq("manufacturer_org_id", orgId)
      .eq("exporter_org_id", exporterId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    getFolders(),
    supabase
      .from("access_events")
      .select("share_id, action, created_at")
      .eq("manufacturer_org_id", orgId)
      .eq("exporter_org_id", exporterId),
  ]);
  if (eventsRes.error) throw new Error(eventsRes.error.message);
  const activity = new Map<string, { views: number; downloads: number; last: string | null }>();
  for (const e of eventsRes.data) {
    const a = activity.get(e.share_id) ?? { views: 0, downloads: 0, last: null };
    if (e.action === "view") a.views++;
    else a.downloads++;
    if (!a.last || e.created_at > a.last) a.last = e.created_at;
    activity.set(e.share_id, a);
  }
  if (exportersRes.error) throw new Error(exportersRes.error.message);
  if (sharesRes.error) throw new Error(sharesRes.error.message);

  const exporter = (
    exportersRes.data as { org_id: string; name: string; contact_email: string | null; status: string }[]
  ).find((e) => e.org_id === exporterId);
  if (!exporter) return null;

  const rows: ShareRow[] = sharesRes.data.map((s) => {
    const version = s.version as unknown as { version: number; document: { name: string; folder_id: string | null } };
    return {
      id: s.id,
      fileName: version.document.name,
      folder: folderPathLabel(folders, version.document.folder_id),
      version: version.version,
      sharedAt: s.created_at,
      expiresAt: s.expires_at,
      activity: activity.get(s.id) ?? { views: 0, downloads: 0, last: null },
    };
  });

  return { exporter, rows, now: Date.now() };
}
