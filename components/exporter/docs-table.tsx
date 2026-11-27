"use client";

import { useTransition } from "react";
import { removeFppDocument } from "@/app/exporter/actions";
import { AccessUntil } from "@/components/access-badge";
import { DownloadIcon, FileIcon } from "@/components/manufacturer/icons";
import { RowMenu } from "@/components/manufacturer/row-menu";
import { useCan } from "@/components/permissions";
import { docType, expiryBadge, formatDate } from "@/lib/documents-shared";
import type { SharedDoc } from "@/lib/exporter/shared";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * Documents shared with the exporter. View opens in a new tab and Download saves the file;
 * both go through /documents/<share>/… so every access is checked and logged.
 */
export function DocsTable({
  docs,
  now,
  fppId,
  emptyText,
  showManufacturer = false,
}: {
  docs: SharedDoc[];
  now: number;
  /** When shown inside a product, rows get "Remove from product". */
  fppId?: string;
  emptyText: string;
  showManufacturer?: boolean;
}) {
  const [pending, start] = useTransition();
  const canDownload = useCan("documents.download");
  const canEdit = useCan("products.edit");
  const cols = showManufacturer ? 8 : 7;
  const today = new Date(now).toISOString().slice(0, 10);
  return (
    <div className="data-grid">
      <table>
        <thead>
          <tr>
            <th>Document</th>
            {showManufacturer && <th>Manufacturer</th>}
            <th>Type</th>
            <th>Version</th>
            <th>Expiry</th>
            <th>Shared</th>
            <th>Access until</th>
            <th className="w-px"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {docs.length === 0 && (
            <tr>
              <td colSpan={cols} className="py-10 text-center text-secondary">{emptyText}</td>
            </tr>
          )}
          {docs.map((d) => (
            <tr key={d.share_id}>
              <td className="max-w-0 w-[34%]">
                <span className="flex items-center gap-2.5">
                  <FileIcon className="size-4 shrink-0 text-tertiary" />
                  <span className="min-w-0">
                    <span className={`block truncate font-medium ${d.expired ? "text-secondary" : "text-header"}`} title={d.file_name}>
                      {d.file_name}
                    </span>
                    <span className="block truncate text-[0.8125rem] text-secondary">{d.folder_path || "Documents"}</span>
                  </span>
                </span>
              </td>
              {showManufacturer && (
                <td className="max-w-0 w-[20%]"><span className="block truncate" title={d.manufacturer_name}>{d.manufacturer_name}</span></td>
              )}
              <td>{docType(d.doc_type) ? <span className="doc-type" title={docType(d.doc_type)!.label}>{docType(d.doc_type)!.short}</span> : <span className="text-tertiary">—</span>}</td>
              <td className="whitespace-nowrap text-secondary">
                v{d.version}
                {d.latest_version !== null && d.latest_version > d.version && (
                  <span className="badge badge-sm badge-warning ml-2" title={`The manufacturer has version ${d.latest_version}`}>Superseded by v{d.latest_version}</span>
                )}
              </td>
              <td className="whitespace-nowrap">
                {d.document_expiry ? (
                  <span className="inline-flex items-center gap-2">
                    {formatDate(d.document_expiry)}
                    {(() => {
                      const b = expiryBadge(d.document_expiry, today);
                      return b && <span className={`badge badge-sm badge-${b.tone}`}>{b.label}</span>;
                    })()}
                  </span>
                ) : (
                  <span className="text-tertiary">—</span>
                )}
              </td>
              <td className="whitespace-nowrap text-secondary">{dateFmt.format(new Date(d.shared_at))}</td>
              <td><AccessUntil expiresAt={d.expires_at} now={now} /></td>
              <td className="whitespace-nowrap text-right">
                <span className="inline-flex items-center">
                  {d.expired ? (
                    <span className="px-2 text-sm text-tertiary">No access</span>
                  ) : (
                    <>
                      <a href={`/documents/${d.share_id}/view`} target="_blank" rel="noopener" className="btn-tertiary btn-sm">
                        View
                      </a>
                      {canDownload && <a
                        href={`/documents/${d.share_id}/download`}
                        title="Download"
                        aria-label={`Download ${d.file_name}`}
                        className="btn-tertiary btn-icon btn-sm"
                      >
                        <DownloadIcon className="size-4" />
                      </a>}
                    </>
                  )}
                  {fppId && canEdit && (
                    <RowMenu
                      label={`Actions for ${d.file_name}`}
                      items={[
                        {
                          label: "Remove from product",
                          danger: true,
                          onSelect: () => start(async () => void (await removeFppDocument(fppId, d.share_id))),
                        },
                      ]}
                    />
                  )}
                </span>
                {pending && <span className="sr-only">Updating…</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
