"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeExporter } from "@/app/manufacturer/actions";
import { Dialog } from "@/components/dialog";
import { RowMenu } from "@/components/manufacturer/row-menu";
import { ReasonField } from "@/components/reason-field";

/** ⋯ menu with "Remove exporter" and its confirmation. */
export function ExporterMenu({
  exporter,
  liveFiles,
  redirectTo,
}: {
  exporter: { id: string; name: string };
  /** Files the exporter can still open; shown in the confirmation. */
  liveFiles: number;
  /** Where to go after removing (e.g. back to the list from the exporter's page). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      const res = await removeExporter(exporter.id, reason);
      if (!res.ok) return setError(res.message);
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
    });

  return (
    <>
      <RowMenu
        label={`Actions for ${exporter.name}`}
        items={[{ label: "Remove exporter", danger: true, onSelect: () => setOpen(true) }]}
      />
      {open && (
        <Dialog
          title="Remove exporter?"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" className="btn-tertiary" onClick={() => setOpen(false)} disabled={pending} data-autofocus>
                Cancel
              </button>
              <button type="button" className="btn-error-primary" onClick={confirm} disabled={pending || !reason.trim()}>
                {pending ? "Removing…" : "Remove exporter"}
              </button>
            </>
          }
        >
          <div className="space-y-3 text-body">
            <p>
              <strong className="font-semibold">{exporter.name}</strong> will be disconnected from your company. They
              won&apos;t see your company or documents, and you can&apos;t share with them until you invite them again.
            </p>
            {liveFiles > 0 && (
              <p className="notice notice-warning">
                Access to {liveFiles} shared file{liveFiles === 1 ? "" : "s"} will be revoked immediately.
              </p>
            )}
            <p className="text-secondary">Share history and the access log are kept for audit.</p>
            <ReasonField value={reason} onChange={setReason} placeholder="e.g. Contract ended" />
            {error && <p role="alert" className="notice notice-error">{error}</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}
