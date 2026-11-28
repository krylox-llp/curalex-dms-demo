"use client";

import Link from "next/link";
import { useState } from "react";
import { DeleteDialog } from "@/components/manufacturer/delete-dialog";
import { useSelection, useShareTarget } from "@/components/manufacturer/selection";
import { useCan } from "@/components/permissions";

export function SelectionBar() {
  const { count, versionIds, selection, clear } = useSelection();
  const target = useShareTarget();
  const [deleting, setDeleting] = useState(false);
  const canShare = useCan("sharing.share");
  const canDelete = useCan("documents.delete");
  if (count === 0 || (!canShare && !canDelete)) return null;
  return (
    <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-lumo-l bg-contrast py-2 pl-5 pr-2 text-[1rem] text-white shadow-lumo-xl">
        <span>
          <strong>{count}</strong> file{count === 1 ? "" : "s"} selected
          <span className="text-white/60"> · across folders</span>
        </span>
        <button type="button" onClick={clear} className="btn-tertiary text-white/80">
          Clear
        </button>
        {canDelete && (
          <button type="button" onClick={() => setDeleting(true)} className="btn-tertiary text-[hsl(3,100%,80%)]">
            Delete
          </button>
        )}
        {canShare && <Link
          href={`/manufacturer/share?v=${versionIds.join(",")}${target ? `&to=${target.id}` : ""}`}
          className="btn-primary max-w-72"
        >
          <span className="truncate">{target ? `Share with ${target.name}` : "Share"}</span> →
        </Link>}
      </div>
      {deleting && (
        <DeleteDialog
          target={{ kind: "documents", ids: Object.keys(selection) }}
          label={`${count} selected file${count === 1 ? "" : "s"}`}
          bulk
          onClose={() => setDeleting(false)}
          onDeleted={clear}
        />
      )}
    </div>
  );
}
