import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton, PageHeader } from "@/components/app-shell";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { FileRow } from "@/components/manufacturer/file-row";
import { FolderRow } from "@/components/manufacturer/folder-row";
import { ManufacturerNav } from "@/components/manufacturer/nav";
import { NewFolderButton } from "@/components/manufacturer/new-folder";
import { SelectionBar } from "@/components/manufacturer/selection-bar";
import { ShareTargetBanner } from "@/components/manufacturer/share-target";
import { createClient } from "@/lib/supabase/server";
import { UploadButton } from "@/components/manufacturer/upload";
import { can, requireAccount } from "@/lib/account";
import { folderTrail, getDocuments, getFolders, isUuid } from "@/lib/documents";

export const metadata: Metadata = { title: "Documents · CuraLex - DMS" };

export default function DocumentsPage({ searchParams }: PageProps<"/manufacturer">) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <Documents searchParams={searchParams} />
    </Suspense>
  );
}

async function Documents({ searchParams }: Pick<PageProps<"/manufacturer">, "searchParams">) {
  const account = await requireAccount("manufacturer");
  const { folder, to } = await searchParams;
  const folderId = isUuid(folder) ? folder : null;
  const shareTo = isUuid(to) ? await findExporter(to) : null;

  const folders = await getFolders();
  if (folderId && !folders.some((f) => f.id === folderId)) notFound();
  const documents = await getDocuments(folderId);
  const subfolders = folders.filter((f) => f.parent_id === folderId);
  const trail = folderTrail(folders, folderId);

  return (
    <AppShell account={account} area="company" nav={<ManufacturerNav />}>
      <PageHeader
        title={trail.at(-1)?.name ?? "Documents"}
        description={
          folderId ? undefined : "Your controlled documents. Tick files in any folder to share or delete them."
        }
        breadcrumb={
          trail.length > 0 && (
            <Breadcrumbs
              items={[
                { label: "Documents", href: "/manufacturer" },
                ...trail.map((f, i) => ({
                  label: f.name,
                  href: i < trail.length - 1 ? `/manufacturer?folder=${f.id}` : undefined,
                })),
              ]}
            />
          )
        }
        actions={
          <>
            {can(account, "documents.edit") && (
              <>
                <NewFolderButton parentId={folderId} />
                <UploadButton folderId={folderId} />
              </>
            )}
          </>
        }
      />

      <ShareTargetBanner fromUrl={shareTo} />
      <div className="data-grid">
        <table>
          <thead>
            <tr>
              <th className="w-10"><span className="sr-only">Select</span></th>
              <th>Name</th>
              <th>Version</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {subfolders.map((f) => (
              <FolderRow key={f.id} folder={f} />
            ))}
            {documents.map((d) => (
              <FileRow key={d.id} doc={d} folderId={folderId} />
            ))}
            {subfolders.length === 0 && documents.length === 0 && (
              <tr>
                <td colSpan={6} className="py-14 text-center text-secondary">
                  This folder is empty. Create a folder or upload files.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-tertiary">
        To update a document, use its upload icon or upload a file with the same name. Earlier versions stay in the version history.
      </p>
      <SelectionBar />
    </AppShell>
  );
}

/** An exporter linked to this manufacturer, for "share with" links from an exporter's page. */
async function findExporter(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_exporters");
  const match = (data as { org_id: string; name: string }[] | null)?.find((e) => e.org_id === id);
  return match ? { id: match.org_id, name: match.name } : null;
}
