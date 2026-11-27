"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { shareFiles } from "@/app/manufacturer/actions";
import { FileIcon } from "@/components/manufacturer/icons";
import { setShareTarget, useSelection } from "@/components/manufacturer/selection";
import { DURATIONS } from "@/lib/documents-shared";

export type ShareFile = { versionId: string; version: number; name: string; folder: string };

const toValue = (days: number | null) => (days == null ? "none" : String(days));
const fromValue = (v: string) => (v === "none" ? null : Number(v));

export function ShareForm({
  files: initialFiles,
  exporters,
  initialExporterId,
}: {
  files: ShareFile[];
  exporters: { org_id: string; name: string; status: string }[];
  /** Preselected recipient when sharing started from an exporter's page. */
  initialExporterId?: string;
}) {
  const router = useRouter();
  const { clear } = useSelection();
  const [files, setFiles] = useState(initialFiles);
  const [days, setDays] = useState<Record<string, number | null>>(
    () => Object.fromEntries(initialFiles.map((f) => [f.versionId, 30])),
  );
  const [mode, setMode] = useState<"existing" | "new">(exporters.length ? "existing" : "new");
  const [exporterId, setExporterId] = useState(
    exporters.some((e) => e.org_id === initialExporterId) ? initialExporterId! : (exporters[0]?.org_id ?? ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    setError(null);
    const recipient =
      mode === "existing"
        ? ({ kind: "existing", exporterId } as const)
        : ({ kind: "new", company: String(fd.get("company") ?? ""), email: String(fd.get("email") ?? "") } as const);
    if (recipient.kind === "existing" && !recipient.exporterId) return setError("Choose an exporter.");

    startTransition(async () => {
      const res = await shareFiles({
        items: files.map((f) => ({ versionId: f.versionId, days: days[f.versionId] ?? null })),
        recipient,
      });
      if (!res.ok) return setError(res.message);
      clear();
      setShareTarget(null);
      router.push(`/manufacturer/shared/${res.exporterId}?shared=${files.length}`);
    });
  }

  return (
    <form action={submit} className="space-y-6">
      {/* Step 1: files and durations */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-contrast-10 px-5 py-4">
          <h2 className="text-lg font-semibold text-header">
            1. Access duration <span className="font-normal text-secondary">· {files.length} file{files.length === 1 ? "" : "s"}</span>
          </h2>
          <label className="flex items-center gap-2 text-sm font-medium text-secondary">
            Apply to all
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                const d = fromValue(e.target.value);
                setDays(Object.fromEntries(files.map((f) => [f.versionId, d])));
                e.target.value = "";
              }}
              className="text-field text-field-sm"
            >
              <option value="">Choose…</option>
              {DURATIONS.map((d) => (
                <option key={d.label} value={toValue(d.days)}>{d.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="data-grid border-0">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Version</th>
              <th>Access for</th>
              <th><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.versionId}>
                <td >
                  <span className="flex items-center gap-2.5">
                    <FileIcon className="size-4 shrink-0 text-tertiary" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-header">{f.name}</span>
                      <span className="block truncate text-xs text-secondary">{f.folder}</span>
                    </span>
                  </span>
                </td>
                <td className="text-secondary">v{f.version}</td>
                <td >
                  <select
                    aria-label={`Access duration for ${f.name}`}
                    value={toValue(days[f.versionId] ?? null)}
                    onChange={(e) => setDays((prev) => ({ ...prev, [f.versionId]: fromValue(e.target.value) }))}
                    className="text-field text-field-sm"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d.label} value={toValue(d.days)}>{d.label}</option>
                    ))}
                  </select>
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    disabled={files.length === 1}
                    onClick={() => setFiles((prev) => prev.filter((p) => p.versionId !== f.versionId))}
                    className="btn-tertiary btn-sm text-secondary"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {/* Step 2: recipient */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-header">2. Share with</h2>
        <div className="mt-4 inline-flex gap-1 rounded-lumo-m bg-contrast-5 p-1" role="radiogroup" aria-label="Recipient">
          {(
            [
              ["existing", "Existing exporter", exporters.length === 0],
              ["new", "Invite a new exporter", false],
            ] as const
          ).map(([value, label, disabled]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              disabled={disabled}
              onClick={() => setMode(value)}
              className={`h-8 rounded-lumo-s px-3 text-sm font-medium transition disabled:opacity-40 ${
                mode === value ? "bg-base text-primary-text shadow-lumo-xs" : "text-secondary hover:text-body"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "existing" ? (
          <label className="field-label mt-4 max-w-md">
            Exporter
            <select
              value={exporterId}
              onChange={(e) => setExporterId(e.target.value)}
              className="text-field"
            >
              {exporters.map((e) => (
                <option key={e.org_id} value={e.org_id}>
                  {e.name}
                  {e.status === "invited" ? " (invited, not joined yet)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
            <label className="field-label">
              Exporter company
              <input name="company" required placeholder="Globex Exports" className="text-field" />
            </label>
            <label className="field-label">
              POC email
              <input name="email" type="email" required placeholder="docs@globexexports.com" className="text-field" />
            </label>
            <p className="field-helper sm:col-span-2">
              They&apos;ll be added to your exporters. Send them the exporter sign-in link; the files will be waiting when they sign in with this email.
            </p>
          </div>
        )}
      </section>

      {error && <p role="alert" className="notice notice-error">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.back()} className="btn-tertiary">Cancel</button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Sharing…" : `Share ${files.length} file${files.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </form>
  );
}
