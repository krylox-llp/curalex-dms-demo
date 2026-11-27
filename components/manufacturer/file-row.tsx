"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { DeleteDialog } from "@/components/manufacturer/delete-dialog";
import { DownloadIcon, FileIcon } from "@/components/manufacturer/icons";
import { RowMenu } from "@/components/manufacturer/row-menu";
import { useSelection } from "@/components/manufacturer/selection";
import { UploadButton } from "@/components/manufacturer/upload";
import type { DeleteTarget } from "@/app/manufacturer/actions";
import { formatBytes, type DocumentWithVersions, type Version } from "@/lib/documents-shared";
import { createClient } from "@/lib/supabase/client";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

async function downloadVersion(name: string, version: Version) {
  const { data, error } = await createClient()
    .storage.from("documents")
    .createSignedUrl(version.storage_path, 60, { download: name });
  if (error || !data) throw new Error("Download failed");
  window.location.assign(data.signedUrl);
}

export function FileRow({ doc, folderId }: { doc: DocumentWithVersions; folderId: string | null }) {
  const router = useRouter();
  const { selection, select, unselect } = useSelection();
  const chosen = selection[doc.id];
  const [localVersionId, setLocalVersionId] = useState(doc.versions[0].id);
  const [showHistory, setShowHistory] = useState(false);
  const [deleting, setDeleting] = useState<{ target: DeleteTarget; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // When selected, the shared selection decides the version; otherwise the row's own picker does.
  const versionId =
    chosen && doc.versions.some((v) => v.id === chosen.versionId)
      ? chosen.versionId
      : doc.versions.some((v) => v.id === localVersionId)
        ? localVersionId
        : doc.versions[0].id;
  const version = doc.versions.find((v) => v.id === versionId) ?? doc.versions[0];

  const download = (v: Version) => {
    setError(null);
    downloadVersion(doc.name, v).catch((e: Error) => setError(e.message));
  };

  return (
    <Fragment>
      <tr aria-selected={Boolean(chosen)}>
        <td className="w-10">
          <input
            type="checkbox"
            aria-label={`Select ${doc.name}`}
            checked={Boolean(chosen)}
            onChange={(e) => (e.target.checked ? select(doc.id, version.id) : unselect(doc.id))}
            className="checkbox"
          />
        </td>
        <td className="max-w-0 w-[45%]">
          <span className="flex items-center gap-2.5 font-medium text-header">
            <FileIcon className="size-4 shrink-0 text-tertiary" />
            <span className="truncate" title={doc.name}>{doc.name}</span>
          </span>
        </td>
        <td>
          {doc.versions.length > 1 ? (
            <select
              aria-label={`Version of ${doc.name}`}
              value={version.id}
              onChange={(e) => {
                setLocalVersionId(e.target.value);
                if (chosen) select(doc.id, e.target.value);
              }}
              className="text-field text-field-sm"
            >
              {doc.versions.map((v, i) => (
                <option key={v.id} value={v.id}>
                  v{v.version}
                  {i === 0 ? " (latest)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <span className="pl-1.5 text-secondary">v{version.version}</span>
          )}
        </td>
        <td className="whitespace-nowrap text-secondary">{formatBytes(version.size_bytes)}</td>
        <td className="whitespace-nowrap text-secondary">{dateFmt.format(new Date(version.created_at))}</td>
        <td className="w-px whitespace-nowrap text-right">
          <span className="inline-flex items-center">
            <UploadButton folderId={folderId} asName={doc.name} />
            <button
              type="button"
              onClick={() => download(version)}
              title={`Download v${version.version}`}
              aria-label={`Download ${doc.name} v${version.version}`}
              className="btn-tertiary btn-icon btn-sm"
            >
              <DownloadIcon className="size-4" />
            </button>
            <RowMenu
              label={`Actions for ${doc.name}`}
              items={[
                {
                  label: showHistory ? "Hide version history" : `Version history (${doc.versions.length})`,
                  onSelect: () => setShowHistory((s) => !s),
                },
                { label: "Audit history", onSelect: () => router.push(`/manufacturer/audit?document=${doc.id}`) },
                {
                  label: "Delete file",
                  separatorBefore: true,
                  danger: true,
                  onSelect: () => setDeleting({ target: { kind: "documents", ids: [doc.id] }, label: doc.name }),
                },
              ]}
            />
          </span>
          {error && <p className="text-xs text-error-text">{error}</p>}
        </td>
      </tr>

      {showHistory && (
        <tr>
          <td className="bg-contrast-5" />
          <td colSpan={5} className="bg-contrast-5 pb-4 pt-1">
            <div className="data-grid data-grid-compact">
              <table>
                <caption className="border-b border-contrast-10 px-2 py-2 text-left text-sm font-semibold text-header">
                  Version history
                </caption>
                <tbody>
                  {doc.versions.map((v, i) => (
                    <tr key={v.id}>
                      <td className="font-medium">
                        v{v.version}
                        {i === 0 && <span className="badge badge-sm ml-2">Latest</span>}
                      </td>
                      <td className="text-secondary">{formatBytes(v.size_bytes)}</td>
                      <td className="text-secondary">{dateFmt.format(new Date(v.created_at))}</td>
                      <td className="text-right">
                        <button type="button" onClick={() => download(v)} className="btn-tertiary btn-sm">
                          Download
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleting({
                              target: { kind: "version", id: v.id },
                              label: doc.versions.length === 1 ? `“${doc.name}” (its only version)` : `version ${v.version} of “${doc.name}”`,
                            })
                          }
                          className="btn-error btn-tertiary btn-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}

      {deleting && (
        <DeleteDialog
          target={deleting.target}
          label={deleting.label}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            if (deleting.target.kind === "documents") unselect(doc.id);
            else if (chosen?.versionId === (deleting.target as { id: string }).id) unselect(doc.id);
          }}
        />
      )}
    </Fragment>
  );
}
