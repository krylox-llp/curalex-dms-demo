"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { deleteItems, getDeleteImpact, type DeleteImpact, type DeleteTarget } from "@/app/manufacturer/actions";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function describe(target: DeleteTarget, label: string, impact: DeleteImpact, bulk: boolean) {
  const parts: string[] = [];
  if (target.kind === "folder") {
    const sub = impact.folders - 1;
    parts.push(
      `This deletes the folder “${label}”` +
        (sub > 0 || impact.files > 0
          ? ` and everything in it: ${[sub > 0 && plural(sub, "sub folder"), plural(impact.files, "file")].filter(Boolean).join(" and ")}.`
          : "."),
    );
  } else if (target.kind === "version") {
    parts.push(`This deletes ${label}. Other versions of the file are kept.`);
  } else {
    const versions = impact.versions === 1 ? "its only version" : `all ${impact.versions} versions`;
    parts.push(
      bulk
        ? `This deletes the ${plural(impact.files, "selected file")} and all their versions (${plural(impact.versions, "version")} in total).`
        : `This deletes “${label}” and ${versions}.`,
    );
  }
  return parts.join(" ");
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
  /** Deleting a selection of files rather than one named file. */
  bulk?: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [impact, setImpact] = useState<DeleteImpact | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    ref.current?.showModal();
    let alive = true;
    getDeleteImpact(target).then((res) => alive && setImpact(res));
    return () => {
      alive = false;
    };
  }, [target]);

  function confirm() {
    startTransition(async () => {
      const res = await deleteItems(target);
      if (!res.ok) return setError(res.message);
      onDeleted?.();
      onClose();
    });
  }

  // Portal to <body> so the dialog works wherever it's used (e.g. inside table rows).
  return createPortal(
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && !pending && onClose()}
      className="dialog m-auto w-full max-w-md p-0"
    >
      <header className="dialog-header">
        <h2 className="dialog-title">
          Delete {target.kind === "folder" ? "folder" : target.kind === "version" ? "version" : "file" + (target.kind === "documents" && target.ids.length > 1 ? "s" : "")}?
        </h2>
      </header>
      <div className="dialog-content">
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
        {error && <p role="alert" className="notice notice-error mt-3">{error}</p>}
      </div>
      <footer className="dialog-footer">
        <button type="button" onClick={onClose} disabled={pending} className="btn-tertiary">Cancel</button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending || !impact}
          className="btn-error-primary"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}
