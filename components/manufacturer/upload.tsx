"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadIcon } from "@/components/manufacturer/icons";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 50 * 1024 * 1024;

type Status = { name: string; state: "uploading" | "done" | "error"; note?: string };

const RPC_ERRORS: Record<string, string> = {
  invalid_name: "File name can't contain slashes.",
  not_found: "Folder no longer exists.",
  not_allowed: "You don't have permission to upload.",
  file_missing: "Upload didn't finish. Try again.",
};

async function uploadOne(file: File, folderId: string | null, asName?: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("reserve_upload", { p_folder: folderId, p_file_name: asName ?? file.name });
  if (error) throw new Error(RPC_ERRORS[error.message] ?? error.message);
  const reserved = data as { version_id: string; version: number; storage_path: string };

  const { error: upError } = await supabase.storage
    .from("documents")
    .upload(reserved.storage_path, file, { contentType: file.type || "application/octet-stream" });
  if (upError) throw new Error(upError.message);

  const { error: doneError } = await supabase.rpc("complete_upload", {
    p_version: reserved.version_id,
    p_size: file.size,
    p_mime: file.type || "application/octet-stream",
  });
  if (doneError) throw new Error(RPC_ERRORS[doneError.message] ?? doneError.message);
  return reserved.version;
}

/**
 * Uploads files into a folder. A file whose name already exists becomes its next version.
 * With `asName`, uploads a single file as a new version of that document.
 */
export function UploadButton({
  folderId,
  asName,
  label,
}: {
  folderId: string | null;
  asName?: string;
  /** With `asName`: show a labelled secondary button instead of the icon button. */
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const busy = statuses.some((s) => s.state === "uploading");

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    setStatuses(list.map((f) => ({ name: f.name, state: "uploading" })));
    for (const [i, file] of list.entries()) {
      const update = (s: Partial<Status>) =>
        setStatuses((prev) => prev.map((p, j) => (j === i ? { ...p, ...s } : p)));
      if (file.size > MAX_BYTES) {
        update({ state: "error", note: "Larger than 50 MB" });
        continue;
      }
      try {
        const version = await uploadOne(file, folderId, asName);
        update({ state: "done", note: version > 1 ? `uploaded as version ${version}` : "uploaded" });
      } catch (e) {
        update({ state: "error", note: e instanceof Error ? e.message : "Upload failed" });
      }
    }
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className={asName ? `relative ${label ? "flex flex-1" : "inline-block"}` : "relative"}>
      <input
        ref={input}
        type="file"
        multiple={!asName}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => handle(e.target.files)}
      />
      {asName && label ? (
        <button type="button" disabled={busy} onClick={() => input.current?.click()} aria-label={`${label} of ${asName}`} className="btn-secondary flex-1 justify-center">
          <UploadIcon className="size-4" /> {busy ? "Uploading…" : label}
        </button>
      ) : asName ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          title="Upload a new version"
          aria-label={`Upload a new version of ${asName}`}
          className="btn-tertiary btn-icon btn-sm"
        >
          {busy ? <span className="size-4 animate-spin rounded-full border-2 border-contrast-20 border-t-primary" /> : <UploadIcon className="size-4" />}
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn-primary">
          <UploadIcon className="size-4" /> {busy ? "Uploading…" : "Upload files"}
        </button>
      )}

      {statuses.length > 0 && !(asName && statuses.every((s) => s.state === "done")) && (
        <div
          role="status"
          className="overlay absolute right-0 z-10 mt-2 w-80 p-3 text-left text-sm"
        >
          <ul className="space-y-1.5">
            {statuses.map((s, i) => (
              <li key={i} className="flex items-start justify-between gap-3">
                <span className="truncate text-body">{s.name}</span>
                <span
                  className={`shrink-0 text-xs ${
                    s.state === "error" ? "text-error-text" : s.state === "done" ? "text-success-text" : "text-secondary"
                  }`}
                >
                  {s.state === "uploading" ? "Uploading…" : s.note}
                </span>
              </li>
            ))}
          </ul>
          {!busy && (
            <button type="button" onClick={() => setStatuses([])} className="btn-tertiary btn-sm mt-2 -ml-1">
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
