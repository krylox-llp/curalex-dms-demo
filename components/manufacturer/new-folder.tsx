"use client";

import { useState, useTransition } from "react";
import { createFolder } from "@/app/manufacturer/actions";
import { FolderIcon } from "@/components/manufacturer/icons";

export function NewFolderButton({ parentId }: { parentId: string | null }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary">
        <FolderIcon className="size-4" /> New folder
      </button>
    );
  }

  return (
    <form
      className="flex items-start gap-2"
      action={(fd) =>
        startTransition(async () => {
          const res = await createFolder(parentId, String(fd.get("name") ?? ""));
          if (res.ok) {
            setOpen(false);
            setError(null);
          } else setError(res.message);
        })
      }
    >
      <div>
        <input
          name="name"
          autoFocus
          required
          maxLength={100}
          placeholder="Folder name"
          aria-label="Folder name"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="text-field w-52"
        />
        {error && <p className="mt-1 text-xs text-error-text">{error}</p>}
      </div>
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Creating…" : "Create"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
        Cancel
      </button>
    </form>
  );
}
