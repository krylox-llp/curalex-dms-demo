"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { DetailsDialog } from "@/components/manufacturer/details-dialog";
import { initialsOf, toneFor } from "@/components/manufacturer/exporter-avatars";
import { UploadButton } from "@/components/manufacturer/upload";
import { useCan } from "@/components/permissions";
import { createClient } from "@/lib/supabase/client";
import {
  docType,
  expiryBadge,
  formatBytes,
  formatDate,
  type DocumentWithVersions,
  type Version,
} from "@/lib/documents-shared";

export type PanelActivity = {
  id: number;
  action: "view" | "download";
  userEmail: string | null;
  exporterName: string;
  version: number;
  at: string;
};

const dateTime = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

const TABS = ["Details", "Versions", "Access", "Activity"] as const;
type Tab = (typeof TABS)[number];

/** Right-hand panel with everything about one document: details, versions, who has access, activity. */
export function DocumentPanel({
  doc,
  folderLabel,
  today,
  closeHref,
  products,
  activity,
}: {
  doc: DocumentWithVersions;
  folderLabel: string;
  today: string;
  closeHref: string;
  products: string[];
  /** Exporter views and downloads; null when the user may not see activity. */
  activity: PanelActivity[] | null;
}) {
  const id = useId();
  const [tab, setTab] = useState<Tab>("Details");
  const [editing, setEditing] = useState(false);
  const canEdit = useCan("documents.edit");
  const canShare = useCan("sharing.share");
  const latest = doc.versions[0];
  const type = docType(doc.details.doc_type);
  const expiry = expiryBadge(doc.details.expiry_date, today);
  const d = doc.details;
  const tabs = TABS.filter((t) => t !== "Activity" || activity !== null);
  const counts: Partial<Record<Tab, number>> = { Versions: doc.versions.length, Access: doc.shares.length };

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = tabs.indexOf(tab);
    const next = e.key === "ArrowRight" ? tabs[(i + 1) % tabs.length] : e.key === "ArrowLeft" ? tabs[(i - 1 + tabs.length) % tabs.length] : null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  };

  return (
    <aside aria-label={`Details of ${doc.name}`} className="card flex flex-col self-start xl:sticky xl:top-22">
      <div className="flex flex-col gap-3 p-5 pb-0">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-10 shrink-0 place-items-center rounded-lumo-s border border-error-50/40 bg-error-10 text-[0.625rem] font-bold text-error-text" aria-hidden="true">
            {fileKind(doc.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-[1.0625rem] font-semibold leading-snug text-header">{doc.name}</h2>
            <p className="mt-0.5 text-[0.8125rem] text-secondary">
              {folderLabel} · v{latest.version} · {formatBytes(latest.size_bytes)}
            </p>
          </div>
          <Link href={closeHref} scroll={false} aria-label="Close details" className="btn-tertiary btn-icon btn-sm text-secondary">
            <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </Link>
        </div>
        {(type || expiry) && (
          <div className="flex flex-wrap gap-1.5">
            {type && <span className="doc-type">{type.short}</span>}
            {expiry && <span className={`badge badge-sm badge-${expiry.tone}`}>{expiry.label === "Expired" ? "Expired" : `Expires in ${expiry.label}`}</span>}
          </div>
        )}
        {(canShare || canEdit) && (
          <div className="flex gap-2">
            {canShare && (
              <Link href={`/manufacturer/share?v=${latest.id}`} className="btn-primary flex-1 justify-center">Share</Link>
            )}
            {canEdit && <UploadButton folderId={doc.folderId} asName={doc.name} label="New version" />}
          </div>
        )}
        <div role="tablist" aria-label="Document information" className="tabs -mx-5 mt-1 px-3" onKeyDown={onTabKey}>
          {tabs.map((t) => (
            <button
              key={t}
              id={`${id}-tab-${t}`}
              type="button"
              role="tab"
              aria-selected={tab === t}
              aria-controls={`${id}-panel`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              className="tab"
            >
              {t}
              {counts[t] !== undefined && <span className="ml-1 text-secondary">({counts[t]})</span>}
            </button>
          ))}
        </div>
      </div>

      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} className="p-5">
        {tab === "Details" && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-sm">
              <Field label="Document type" value={type?.label} wide />
              <Field label="Product" value={d.product} />
              <Field label="Target market" value={d.market} />
              <Field label="Issued by" value={d.issued_by} />
              <Field label="Reference no." value={d.reference_no} />
              <Field label="Issue date" value={d.issue_date && formatDate(d.issue_date)} />
              <Field label="Expiry date" value={d.expiry_date && formatDate(d.expiry_date)} tone={expiry?.tone === "error" ? "error" : undefined} />
              <Field label="Latest upload" value={dateTime.format(new Date(latest.created_at))} wide />
            </dl>
            {canEdit ? (
              <button type="button" className="btn-secondary btn-sm mt-5" onClick={() => setEditing(true)}>Edit details</button>
            ) : (
              !d.doc_type && !d.expiry_date && <p className="mt-4 text-sm text-secondary">No details recorded yet.</p>
            )}
          </>
        )}

        {tab === "Versions" && (
          <ol className="flex flex-col divide-y divide-contrast-10">
            {doc.versions.map((v, i) => (
              <li key={v.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                <span className="w-9 font-semibold tabular-nums text-header">v{v.version}</span>
                <span className="min-w-0 flex-1 text-[0.8125rem] text-secondary">
                  {dateTime.format(new Date(v.created_at))} · {formatBytes(v.size_bytes)}
                  {i === 0 && <span className="badge badge-sm ml-2">Latest</span>}
                </span>
                <DownloadLink name={doc.name} version={v} />
              </li>
            ))}
          </ol>
        )}

        {tab === "Access" &&
          (doc.shares.length === 0 ? (
            <p className="text-sm text-secondary">Not shared with any exporter.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {doc.shares.map((s) => (
                <li key={s.shareId} className="flex items-center gap-3 rounded-lumo-m bg-contrast-5 px-3 py-2.5">
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold ${toneFor(s.exporterId)}`} aria-hidden="true">
                    {initialsOf(s.exporterName)}
                  </span>
                  <span className="min-w-0 flex-1 text-[0.8125rem]">
                    <Link href={`/manufacturer/shared/${s.exporterId}`} className="block truncate font-medium text-header hover:text-primary-text hover:underline">
                      {s.exporterName}
                    </Link>
                    <span className="text-secondary">
                      v{s.version} · {s.expiresAt ? `until ${dateTime.format(new Date(s.expiresAt)).split(",")[0]}` : "no expiry"}
                      {s.version !== latest.version && <span className="badge badge-sm badge-warning ml-2">Older version</span>}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ))}

        {tab === "Activity" && activity && (
          <>
            {activity.length === 0 ? (
              <p className="text-sm text-secondary">No exporter has viewed or downloaded this document yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {activity.map((a) => (
                  <li key={a.id} className="text-[0.8125rem] leading-snug">
                    <span className="font-medium text-header">{a.userEmail ?? "An exporter user"}</span>{" "}
                    <span className="text-secondary">({a.exporterName})</span> {a.action === "download" ? "downloaded" : "viewed"} v{a.version}
                    <span className="block text-xs text-secondary">{dateTime.format(new Date(a.at))}</span>
                  </li>
                ))}
              </ol>
            )}
            <Link href={`/manufacturer/audit?document=${doc.id}`} className="mt-4 inline-block text-sm font-medium text-primary-text hover:underline">
              Full audit history
            </Link>
          </>
        )}
      </div>

      {editing && (
        <DetailsDialog documentId={doc.id} name={doc.name} details={doc.details} products={products} onClose={() => setEditing(false)} />
      )}
    </aside>
  );
}

function Field({ label, value, wide, tone }: { label: string; value: string | null | undefined; wide?: boolean; tone?: "error" }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-xs text-secondary">{label}</dt>
      <dd className={`mt-0.5 break-words ${value ? (tone === "error" ? "font-medium text-error-text" : "text-header") : "text-tertiary"}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

function DownloadLink({ name, version }: { name: string; version: Version }) {
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      className={`btn-tertiary btn-sm ${error ? "text-error-text" : ""}`}
      onClick={async () => {
        const { data, error: e } = await createClient()
          .storage.from("documents")
          .createSignedUrl(version.storage_path, 60, { download: name });
        if (e || !data) setError(true);
        else window.location.assign(data.signedUrl);
      }}
    >
      {error ? "Failed" : "Download"}
    </button>
  );
}

const fileKind = (name: string) => (name.split(".").pop() ?? "").slice(0, 4).toUpperCase() || "FILE";
