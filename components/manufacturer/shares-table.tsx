"use client";

import { useState, useTransition } from "react";
import { revokeShares, setShareDuration } from "@/app/manufacturer/actions";
import { AccessUntil } from "@/components/access-badge";
import { Dialog } from "@/components/dialog";
import { ReasonField } from "@/components/reason-field";
import { FileIcon } from "@/components/manufacturer/icons";
import { useCan } from "@/components/permissions";
import { RowMenu } from "@/components/manufacturer/row-menu";
import { DURATIONS } from "@/lib/documents-shared";

export type ShareRow = {
  id: string;
  fileName: string;
  folder: string;
  version: number;
  sharedAt: string;
  expiresAt: string | null;
  /** From the access log: how often the exporter opened this file. */
  activity: { views: number; downloads: number; last: string | null };
};

const timeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Activity({ a }: { a: ShareRow["activity"] }) {
  if (!a.last) return <span className="text-tertiary">Not opened yet</span>;
  const parts = [
    a.downloads && `${a.downloads} download${a.downloads === 1 ? "" : "s"}`,
    a.views && `${a.views} view${a.views === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return (
    <span className="block whitespace-nowrap">
      <span className="block text-body">{parts.join(" · ")}</span>
      <span className="block text-[0.8125rem] text-secondary">Last {timeFmt.format(new Date(a.last))}</span>
    </span>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });


/** Documents shared with one exporter: change duration or revoke one, selected or all. */
export function SharesTable({ rows, now, showActivity = true }: { rows: ShareRow[]; now: number; showActivity?: boolean }) {
  const canShare = useCan("sharing.share");
  const canRevoke = useCan("sharing.revoke");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Shares awaiting a revoke confirmation (one row, the ticked rows, or all).
  const [revoking, setRevoking] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedIds = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allChecked = rows.length > 0 && selectedIds.length === rows.length;

  function run(action: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    startTransition(async () => {
      const res = await action();
      setNotice(res.message ? { ok: res.ok, text: res.message } : res.ok ? null : { ok: false, text: "Something went wrong." });
      if (res.ok) after?.();
    });
  }

  const askRevoke = (ids: string[]) => {
    setReason("");
    setRevoking(ids);
  };
  const confirmRevoke = () => {
    const ids = revoking ?? [];
    run(() => revokeShares(ids, reason), () => {
      setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      setRevoking(null);
    });
  };

  return (
    <div>
      {/* Toolbar: filter on the left; actions on the right (bulk actions only while rows are ticked). */}
      <div className="mb-3 flex min-h-[var(--lumo-size-m)] flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-secondary">
          {rows.length} shared file{rows.length === 1 ? "" : "s"}
        </span>

        {!canRevoke ? null : selectedIds.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-secondary">{selectedIds.length} selected</span>
            <button type="button" className="btn-tertiary btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
            <button type="button" className="btn-error btn-sm" disabled={pending} onClick={() => askRevoke(selectedIds)}>
              Revoke access
            </button>
          </div>
        ) : (
          rows.length > 0 && (
            <div className="flex items-center gap-1">
              <RowMenu
                label="More actions"
                items={[{ label: `Revoke all (${rows.length})`, danger: true, onSelect: () => askRevoke(rows.map((r) => r.id)) }]}
              />
            </div>
          )
        )}
      </div>

      {revoking && (
        <Dialog
          title="Revoke access?"
          onClose={() => setRevoking(null)}
          footer={
            <>
              <button type="button" className="btn-tertiary" onClick={() => setRevoking(null)} disabled={pending} data-autofocus>
                Cancel
              </button>
              <button type="button" className="btn-error-primary" onClick={confirmRevoke} disabled={pending || !reason.trim()}>
                {pending ? "Revoking…" : "Revoke access"}
              </button>
            </>
          }
        >
          <p className="text-body">
            {revoking.length === 1
              ? `The exporter will lose access to “${rows.find((r) => r.id === revoking[0])?.fileName ?? "this file"}” immediately.`
              : `The exporter will lose access to ${revoking.length} files immediately.`}
          </p>
          <ReasonField value={reason} onChange={setReason} placeholder="e.g. Superseded by a new version" />
        </Dialog>
      )}
      {notice && (
        <p role="status" className={`notice mb-3 ${notice.ok ? "notice-success" : "notice-error"}`}>{notice.text}</p>
      )}

      <div className="data-grid">
        <table>
          <thead>
            <tr>
              <th className="w-10">
                {canRevoke && <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  disabled={rows.length === 0}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  className="checkbox"
                />}
              </th>
              <th>File</th>
              <th>Version</th>
              <th>Shared</th>
              <th>Access until</th>
              {showActivity && <th>Activity</th>}
              <th className="w-12"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-14 text-center text-secondary">Nothing shared with this exporter yet.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} aria-selected={selected.has(r.id)}>
                <td>
                  {canRevoke && <input
                    type="checkbox"
                    aria-label={`Select ${r.fileName}`}
                    checked={selected.has(r.id)}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                        return next;
                      })
                    }
                    className="checkbox"
                  />}
                </td>
                <td className="max-w-0 w-[36%]">
                  <span className="flex items-center gap-2.5">
                    <FileIcon className="size-4 shrink-0 text-tertiary" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-header" title={r.fileName}>{r.fileName}</span>
                      <span className="block truncate text-[0.8125rem] text-secondary" title={r.folder}>{r.folder}</span>
                    </span>
                  </span>
                </td>
                <td className="text-secondary">v{r.version}</td>
                <td className="whitespace-nowrap text-secondary">{dateFmt.format(new Date(r.sharedAt))}</td>
                <td><AccessUntil expiresAt={r.expiresAt} now={now} /></td>
                {showActivity && <td><Activity a={r.activity} /></td>}
                <td className="text-right">
                  {(canShare || canRevoke) && (
                    <RowMenu
                      label={`Actions for ${r.fileName}`}
                      items={[
                        ...(canShare
                          ? [
                              { heading: "Access from today" },
                              ...DURATIONS.map((d) => ({ label: d.label, onSelect: () => run(() => setShareDuration(r.id, d.days)) })),
                            ]
                          : []),
                        ...(canRevoke
                          ? [{ label: "Revoke access", danger: true, separatorBefore: canShare, onSelect: () => askRevoke([r.id]) }]
                          : []),
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
