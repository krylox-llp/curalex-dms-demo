"use client";

import { useState, useTransition } from "react";
import { revokeShares, setShareDuration } from "@/app/manufacturer/actions";
import { AccessUntil } from "@/components/access-badge";
import { FileIcon } from "@/components/manufacturer/icons";
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
export function SharesTable({ rows, now }: { rows: ShareRow[]; now: number }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAll, setConfirmAll] = useState(false);
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

  const revoke = (ids: string[]) =>
    run(() => revokeShares(ids), () => {
      setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      setConfirmAll(false);
    });

  return (
    <div>
      {/* Toolbar: filter on the left; actions on the right (bulk actions only while rows are ticked). */}
      <div className="mb-3 flex min-h-[var(--lumo-size-m)] flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-secondary">
          {rows.length} shared file{rows.length === 1 ? "" : "s"}
        </span>

        {selectedIds.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-secondary">{selectedIds.length} selected</span>
            <button type="button" className="btn-tertiary btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
            <button type="button" className="btn-error btn-sm" disabled={pending} onClick={() => revoke(selectedIds)}>
              Revoke access
            </button>
          </div>
        ) : (
          rows.length > 0 && (
            <div className="flex items-center gap-1">
              <RowMenu
                label="More actions"
                items={[{ label: `Revoke all (${rows.length})`, danger: true, onSelect: () => setConfirmAll(true) }]}
              />
            </div>
          )
        )}
      </div>

      {confirmAll && (
        <div className="notice notice-error mb-3 items-center justify-between">
          <span>
            Revoke access to all {rows.length} file{rows.length === 1 ? "" : "s"} listed? Exporters lose access immediately.
          </span>
          <span className="flex shrink-0 gap-2">
            <button type="button" className="btn-tertiary btn-sm" onClick={() => setConfirmAll(false)}>Cancel</button>
            <button type="button" className="btn-error-primary btn-sm" disabled={pending} onClick={() => revoke(rows.map((r) => r.id))}>
              Revoke all
            </button>
          </span>
        </div>
      )}
      {notice && (
        <p role="status" className={`notice mb-3 ${notice.ok ? "notice-success" : "notice-error"}`}>{notice.text}</p>
      )}

      <div className="data-grid">
        <table>
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  disabled={rows.length === 0}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  className="checkbox"
                />
              </th>
              <th>File</th>
              <th>Version</th>
              <th>Shared</th>
              <th>Access until</th>
              <th>Activity</th>
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
                  <input
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
                  />
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
                <td><Activity a={r.activity} /></td>
                <td className="text-right">
                  <RowMenu
                    label={`Actions for ${r.fileName}`}
                    items={[
                      { heading: "Access from today" },
                      ...DURATIONS.map((d) => ({
                        label: d.label,
                        onSelect: () => run(() => setShareDuration(r.id, d.days)),
                      })),
                      { label: "Revoke access", danger: true, separatorBefore: true, onSelect: () => revoke([r.id]) },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
