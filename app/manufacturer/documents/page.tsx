import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton, PageHeader } from "@/components/app-shell";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { FileRow } from "@/components/manufacturer/file-row";
import { DocumentFilters } from "@/components/manufacturer/document-filters";
import { DocumentPanel, type PanelActivity } from "@/components/manufacturer/document-panel";
import { FolderRow } from "@/components/manufacturer/folder-row";
import { NewFolderButton } from "@/components/manufacturer/new-folder";
import { SelectionBar } from "@/components/manufacturer/selection-bar";
import { ShareTargetBanner } from "@/components/manufacturer/share-target";
import { createClient } from "@/lib/supabase/server";
import { UploadButton } from "@/components/manufacturer/upload";
import { can, requireAccount } from "@/lib/account";
import {
  daysUntil,
  folderPathLabel,
  folderTrail,
  getDocuments,
  getFolders,
  isUuid,
  todayInIndia,
  type DocumentWithVersions,
} from "@/lib/documents";

export const metadata: Metadata = { title: "Documents · CuraLex - DMS" };

export default function DocumentsPage({ searchParams }: PageProps<"/manufacturer/documents">) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <Documents searchParams={searchParams} />
    </Suspense>
  );
}

async function Documents({ searchParams }: Pick<PageProps<"/manufacturer/documents">, "searchParams">) {
  const account = await requireAccount("manufacturer");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const folderId = isUuid(sp.folder) ? sp.folder : null;
  const shareTo = isUuid(sp.to) ? await findExporter(sp.to) : null;
  const filters = { q: str("q").toLowerCase(), type: str("type"), product: str("product"), expiry: str("expiry") };
  const filtering = Boolean(filters.q || filters.type || filters.product || filters.expiry);

  const [folders, all] = await Promise.all([getFolders(), getDocuments("all")]);
  if (folderId && !folders.some((f) => f.id === folderId)) notFound();
  const today = todayInIndia();
  const products = [...new Set(all.map((d) => d.details.product).filter((p): p is string => Boolean(p)))].sort((x, y) => x.localeCompare(y));

  const documents = filtering ? all.filter((d) => matches(d, filters, today)) : all.filter((d) => d.folderId === folderId);
  const subfolders = filtering ? [] : folders.filter((f) => f.parent_id === folderId);
  const trail = filtering ? [] : folderTrail(folders, folderId);

  const selected = isUuid(sp.doc) ? all.find((d) => d.id === sp.doc) ?? null : null;
  const activity = selected && can(account, "activity.view") ? await getDocumentActivity(selected) : null;

  const query = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) next.set(k, v);
    for (const [k, v] of Object.entries(patch)) if (v) next.set(k, v); else next.delete(k);
    const qs = next.toString();
    return `/manufacturer/documents${qs ? `?${qs}` : ""}`;
  };
  const folderLabel = (id: string | null) => folderPathLabel(folders, id);

  return (
    <AppShell account={account} area="company">
      <PageHeader
        title={filtering ? "Documents" : trail.at(-1) ? `${trail.at(-1)!.name}/` : "Documents"}
        description={
          filtering
            ? "Filtered across all folders."
            : folderId
              ? undefined
              : "Your controlled documents. Tick files in any folder to share or delete them; click a name for its details."
        }
        breadcrumb={
          trail.length > 0 && (
            <Breadcrumbs
              items={[
                { label: "Documents", href: "/manufacturer/documents" },
                ...trail.map((f, i) => ({
                  label: `${f.name}/`,
                  href: i < trail.length - 1 ? `/manufacturer/documents?folder=${f.id}` : undefined,
                })),
              ]}
            />
          )
        }
        actions={
          can(account, "documents.edit") && !filtering && (
            <>
              <NewFolderButton parentId={folderId} />
              <UploadButton folderId={folderId} />
            </>
          )
        }
      />

      <ShareTargetBanner fromUrl={shareTo} />
      <DocumentFilters products={products} resultCount={filtering ? documents.length : null} />

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <div className="data-grid">
            <table>
              <thead>
                <tr>
                  <th className="w-10"><span className="sr-only">Select</span></th>
                  <th>Name</th>
                  <th>Type</th>
                  {!selected && <th>Product</th>}
                  <th>Version</th>
                  <th>Expiry</th>
                  {!selected && <th>Shared with</th>}
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {subfolders.map((f) => (
                  <FolderRow key={f.id} folder={f} compact={Boolean(selected)} />
                ))}
                {documents.map((d) => (
                  <FileRow
                    key={d.id}
                    doc={d}
                    folderId={d.folderId}
                    today={today}
                    products={products}
                    folderLabel={filtering ? folderLabel(d.folderId) : undefined}
                    detailsHref={query({ doc: d.id })}
                    current={selected?.id === d.id}
                    compact={Boolean(selected)}
                  />
                ))}
                {subfolders.length === 0 && documents.length === 0 && (
                  <tr>
                    <td colSpan={selected ? 6 : 8} className="py-14 text-center text-secondary">
                      {filtering ? "No documents match these filters." : "This folder is empty. Create a folder or upload files."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-tertiary">
            To update a document, use its upload icon or upload a file with the same name. Earlier versions stay in the version history.
          </p>
        </div>
        {selected && (
          <div className="w-full shrink-0 xl:w-[22rem]">
            <DocumentPanel
              key={selected.id}
              doc={selected}
              folderLabel={folderLabel(selected.folderId)}
              today={today}
              closeHref={query({ doc: null })}
              products={products}
              activity={activity}
            />
          </div>
        )}
      </div>
      <SelectionBar />
    </AppShell>
  );
}

type Filters = { q: string; type: string; product: string; expiry: string };

function matches(d: DocumentWithVersions, f: Filters, today: string) {
  const det = d.details;
  if (f.q && ![d.name, det.product, det.reference_no, det.market, det.issued_by].some((v) => v?.toLowerCase().includes(f.q))) return false;
  if (f.type && det.doc_type !== f.type) return false;
  if (f.product && det.product !== f.product) return false;
  if (f.expiry) {
    if (f.expiry === "none") return !det.expiry_date;
    if (!det.expiry_date) return false;
    const days = daysUntil(det.expiry_date, today);
    if (f.expiry === "expired") return days < 0;
    const limit = Number(f.expiry);
    return Number.isFinite(limit) && days >= 0 && days <= limit;
  }
  return true;
}

/** Exporter views and downloads of any version of a document, newest first. */
async function getDocumentActivity(doc: DocumentWithVersions): Promise<PanelActivity[]> {
  const supabase = await createClient();
  const versionNo = new Map(doc.versions.map((v) => [v.id, v.version]));
  const [events, exporters] = await Promise.all([
    supabase
      .from("access_events")
      .select("id, action, user_email, exporter_org_id, version_id, created_at")
      .in("version_id", [...versionNo.keys()])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.rpc("my_exporters"),
  ]);
  if (events.error) throw new Error(events.error.message);
  const names = new Map(((exporters.data ?? []) as { org_id: string; name: string }[]).map((e) => [e.org_id, e.name]));
  return (events.data as { id: number; action: "view" | "download"; user_email: string | null; exporter_org_id: string; version_id: string; created_at: string }[]).map((e) => ({
    id: e.id,
    action: e.action,
    userEmail: e.user_email,
    exporterName: names.get(e.exporter_org_id) ?? "Former exporter",
    version: versionNo.get(e.version_id) ?? 0,
    at: e.created_at,
  }));
}

/** An exporter linked to this manufacturer, for "share with" links from an exporter's page. */
async function findExporter(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_exporters");
  const match = (data as { org_id: string; name: string }[] | null)?.find((e) => e.org_id === id);
  return match ? { id: match.org_id, name: match.name } : null;
}
