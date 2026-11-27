"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteItems, getDeleteImpact, type DeleteImpact, type DeleteTarget } from "@/app/manufacturer/actions";
import { Dialog } from "@/components/dialog";
import { ReasonField } from "@/components/reason-field";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function describe(target: DeleteTarget, label: string, impact: DeleteImpact, bulk: boolean) {
  if (target.kind === "folder") {
    const sub = impact.folders - 1;
    return (
      `This deletes the folder “${label}”` +
      (sub > 0 || impact.files > 0
        ? ` and everything in it: ${[sub > 0 && plural(sub, "sub folder"), plural(impact.files, "file")].filter(Boolean).join(" and ")}.`
        : ".")
    );
  }
  if (target.kind === "version") return `This deletes ${label}. Other versions of the file are kept.`;
  const versions = impact.versions === 1 ? "its only version" : `all ${impact.versions} versions`;
  return bulk
    ? `This deletes the ${plural(impact.files, "selected file")} and all their versions (${plural(impact.versions, "version")} in total).`
    : `This deletes “${label}” and ${versions}.`;
}

/** Confirmation dialog that shows what a delete affects before doing it. */
export function DeleteDialog({
  target,
  label,
  onClose,
  onDeleted,
  bulk = false,
}: {
  target: DeleteTarget;
  label: string;
  onClose: () => void;
  onDeleted?: () => void;
  /** Deleting a selection of files rather than one named file. */
  bulk?: boolean;
}) {
  const [impact, setImpact] = useState<DeleteImpact | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    getDeleteImpact(target).then((res) => alive && setImpact(res));
    return () => {
      alive = false;
    };
  }, [target]);

  const noun =
    target.kind === "folder" ? "folder" : target.kind === "version" ? "version" : target.ids.length > 1 ? "files" : "file";

  function confirm() {
    startTransition(async () => {
      const res = await deleteItems(target, reason);
      if (!res.ok) return setError(res.message);
      onDeleted?.();
      onClose();
    });
  }

  return (
    <Dialog
      title={`Delete ${noun}?`}
      onClose={onClose}
      footer={
        <>
          {/* Safe action gets initial focus in a destructive confirmation. */}
          <button type="button" onClick={onClose} disabled={pending} className="btn-tertiary" data-autofocus>
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={pending || !impact || !reason.trim()} className="btn-error-primary">
            {pending ? "Deleting…" : "Delete"}
          </button>
        </>
      }
    >
      {impact === undefined ? (
        <p className="text-secondary">Checking what this affects…</p>
      ) : impact === null ? (
        <p className="text-error-text">Couldn&apos;t check this item. It may already be deleted.</p>
      ) : (
        <div className="space-y-3 text-body">
          <p>{describe(target, label, impact, bulk)}</p>
          {impact.live_shares > 0 && (
            <p className="notice notice-warning">
              {plural(impact.exporters, "exporter")} currently {impact.exporters === 1 ? "has" : "have"} access to{" "}
              {plural(impact.live_shares, "shared file")} here. Their access will be revoked.
            </p>
          )}
          <p className="text-secondary">The files are removed from storage. This can&apos;t be undone.</p>
        </div>
      )}
      {impact && <ReasonField value={reason} onChange={setReason} placeholder="e.g. Uploaded in error" />}
      {error && <p role="alert" className="notice notice-error mt-3">{error}</p>}
    </Dialog>
  );
}
