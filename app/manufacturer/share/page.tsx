import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton, PageHeader } from "@/components/app-shell";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ShareForm, type ShareFile } from "@/components/manufacturer/share-form";
import { requireAccount, requirePermission } from "@/lib/account";
import { folderPathLabel, getFolders, isUuid } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Share files · CuraLex - DMS" };

export default function SharePage({ searchParams }: PageProps<"/manufacturer/share">) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <Share searchParams={searchParams} />
    </Suspense>
  );
}

async function Share({ searchParams }: Pick<PageProps<"/manufacturer/share">, "searchParams">) {
  const account = await requireAccount("manufacturer");
  requirePermission(account, "sharing.share", "/manufacturer");
  const { v, to } = await searchParams;
  const ids = (typeof v === "string" ? v.split(",") : []).filter(isUuid).slice(0, 200);

  const supabase = await createClient();
  const [folders, versionsRes, exportersRes] = await Promise.all([
    getFolders(),
    ids.length
      ? supabase
          .from("document_versions")
          .select("id, version, document:documents!inner(name, folder_id)")
          .in("id", ids)
          .eq("status", "ready")
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("my_exporters"),
  ]);
  if (versionsRes.error) throw new Error(versionsRes.error.message);
  if (exportersRes.error) throw new Error(exportersRes.error.message);

  const files: ShareFile[] = (versionsRes.data ?? [])
    .map((r) => {
      const doc = r.document as unknown as { name: string; folder_id: string | null };
      return { versionId: r.id, version: r.version, name: doc.name, folder: folderPathLabel(folders, doc.folder_id) };
    })
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
  const exporters = (exportersRes.data ?? []) as { org_id: string; name: string; status: string }[];

  return (
    <AppShell account={account} area="company">
      <PageHeader
        title="Share files"
        description="Set how long the exporter can access each file, then choose who to share with."
        breadcrumb={<Breadcrumbs items={[{ label: "Documents", href: "/manufacturer/documents" }, { label: "Share files" }]} />}
      />
      {files.length === 0 ? (
        <div className="card px-6 py-14 text-center text-secondary">
          No files selected.{" "}
          <Link href="/manufacturer/documents" className="font-medium text-primary-text hover:underline">Select files in Documents</Link>.
        </div>
      ) : (
        <ShareForm files={files} exporters={exporters} initialExporterId={isUuid(to) ? to : undefined} />
      )}
    </AppShell>
  );
}
