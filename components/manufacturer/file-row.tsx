"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import Link from "next/link";
import { DeleteDialog } from "@/components/manufacturer/delete-dialog";
import { DetailsDialog } from "@/components/manufacturer/details-dialog";
import { ExporterAvatars } from "@/components/manufacturer/exporter-avatars";
import { useCan } from "@/components/permissions";
import { DownloadIcon, FileIcon } from "@/components/manufacturer/icons";
import { RowMenu } from "@/components/manufacturer/row-menu";
import { useSelection } from "@/components/manufacturer/selection";
import { UploadButton } from "@/components/manufacturer/upload";
import type { DeleteTarget } from "@/app/manufacturer/actions";
import { docType, expiryBadge, formatBytes, formatDate, type DocumentWithVersions, type Version } from "@/lib/documents-shared";
import { createClient } from "@/lib/supabase/client";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

async function downloadVersion(name: string, version: Version) {
  const { data, error } = await createClient()
    .storage.from("documents")
    .createSignedUrl(version.storage_path, 60, { download: name });
  if (error || !data) throw new Error("Download failed");
  window.location.assign(data.signedUrl);
}

export function FileRow({
  doc,
  folderId,
  today,
  detailsHref,
  folderLabel,
  products,
  current,
  compact = false,
}: {
  doc: DocumentWithVersions;
  folderId: string | null;
  /** YYYY-MM-DD, for expiry badges. */
  today: string;
  /** Opens this document in the details panel. */
  detailsHref: string;
  /** Folder path, shown when listing documents from several folders. */
  folderLabel?: string;
  products: string[];
  /** This document is open in the details panel. */
  current?: boolean;
  /** The details panel is open: hide columns the panel already shows. */
  compact?: boolean;
}) {
  const router = useRouter();
  const canEdit = useCan("documents.edit");
  const canDelete = useCan("documents.delete");
  const canSelect = useCan("sharing.share") || canDelete;
  const { selection, select, unselect } = useSelection();
  const chosen = selection[doc.id];
  const [localVersionId, setLocalVersionId] = useState(doc.versions[0].id);
  const [showHistory, setShowHistory] = useState(false);
  const [deleting, setDeleting] = useState<{ target: DeleteTarget; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const type = docType(doc.details.doc_type);
  const expiry = expiryBadge(doc.details.expiry_date, today);

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
      <tr aria-selected={Boolean(chosen)} className={current ? "[&>td]:bg-primary-10/60" : undefined}>
        <td className="w-10">
          {canSelect && (
            <input
              type="checkbox"
              aria-label={`Select ${doc.name}`}
              checked={Boolean(chosen)}
              onChange={(e) => (e.target.checked ? select(doc.id, version.id) : unselect(doc.id))}
              className="checkbox"
            />
          )}
        </td>
        <td className={`max-w-0 ${compact ? "w-[45%] min-w-48" : "w-[32%] min-w-56"}`}>
          <Link href={detailsHref} scroll={false} className="group flex items-center gap-2.5 font-medium text-header" aria-current={current ? "true" : undefined}>
            <FileIcon className="size-4 shrink-0 text-tertiary" />
            <span className="min-w-0">
              <span className="block truncate group-hover:text-primary-text group-hover:underline" title={doc.name}>{doc.name}</span>
              {folderLabel && <span className="block truncate text-xs font-normal text-secondary">{folderLabel}</span>}
            </span>
          </Link>
        </td>
        <td>{type ? <span className="doc-type" title={type.label}>{type.short}</span> : <span className="text-tertiary">—</span>}</td>
        {!compact && (
          <td className="max-w-0 w-[18%]">
            <span className="block truncate text-secondary" title={doc.details.product ?? undefined}>{doc.details.product ?? "—"}</span>
          </td>
        )}
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
        <td className="whitespace-nowrap">
          {doc.details.expiry_date ? (
            <span className="inline-flex items-center gap-2">
              <span className={expiry?.tone === "error" ? "text-error-text" : "text-body"}>{formatDate(doc.details.expiry_date)}</span>
              {expiry && <span className={`badge badge-sm badge-${expiry.tone}`}>{expiry.label}</span>}
            </span>
          ) : (
            <span className="text-tertiary">—</span>
          )}
        </td>
        {!compact && <td><ExporterAvatars shares={doc.shares} /></td>}
        <td className="w-px whitespace-nowrap text-right">
          <span className="inline-flex items-center">
            {canEdit && <UploadButton folderId={folderId} asName={doc.name} />}
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
                { label: "Details", onSelect: () => router.push(detailsHref, { scroll: false }) },
                ...(canEdit ? [{ label: "Edit details", onSelect: () => setEditing(true) }] : []),
                {
                  label: showHistory ? "Hide version history" : `Version history (${doc.versions.length})`,
                  onSelect: () => setShowHistory((s) => !s),
                },
                { label: "Audit history", onSelect: () => router.push(`/manufacturer/audit?document=${doc.id}`) },
                ...(canDelete
                  ? [{
                      label: "Delete file",
                      separatorBefore: true,
                      danger: true,
                      onSelect: () => setDeleting({ target: { kind: "documents", ids: [doc.id] }, label: doc.name }),
                    }]
                  : []),
              ]}
            />
          </span>
          {error && <p className="text-xs text-error-text">{error}</p>}
        </td>
      </tr>

      {showHistory && (
        <tr>
          <td className="bg-contrast-5" />
          <td colSpan={compact ? 5 : 7} className="bg-contrast-5 pb-4 pt-1">
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
                        {canDelete && <button
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
                        </button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}

      {editing && (
        <DetailsDialog documentId={doc.id} name={doc.name} details={doc.details} products={products} onClose={() => setEditing(false)} />
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
