"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

const ERRORS: Record<string, string> = {
  invalid_name: "Use a name without slashes (max 100 characters).",
  folder_exists: "A folder with that name already exists here.",
  not_found: "That item no longer exists or isn't yours.",
  not_allowed: "You don't have permission to do that.",
  not_your_exporter: "That exporter isn't in your exporter list.",
  nothing_selected: "Select at least one file to share.",
  invalid_duration: "Choose a valid access duration.",
  invalid_input: "Enter the exporter's company name and a valid email address.",
  not_an_exporter: "That email belongs to a manufacturer, not an exporter.",
  admin_email: "That email belongs to a CuraLex admin and can't be invited.",
};

function message(raw: string) {
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : "Something went wrong. Please try again.";
}

export async function createFolder(parentId: string | null, name: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_folder", { p_parent: parentId, p_name: name });
  if (error) return { ok: false, message: message(error.message) };
  refresh();
  return { ok: true };
}

export type ShareInput = {
  items: { versionId: string; days: number | null }[];
  recipient: { kind: "existing"; exporterId: string } | { kind: "new"; company: string; email: string };
};

/** Shares versions with an exporter, inviting the exporter first when it's a new one. */
export async function shareFiles(input: ShareInput): Promise<ActionResult & { exporterId?: string }> {
  const supabase = await createClient();

  let exporterId: string;
  if (input.recipient.kind === "existing") {
    exporterId = input.recipient.exporterId;
  } else {
    const { company, email } = input.recipient;
    const { data, error } = await supabase.rpc("invite_exporter", { p_company: company, p_email: email });
    if (error && !error.message.includes("already_linked")) return { ok: false, message: message(error.message) };
    if (data) {
      exporterId = (data as { org_id: string }).org_id;
    } else {
      // Already in this manufacturer's list: find it by POC email.
      const { data: list } = await supabase.rpc("my_exporters");
      const match = (list as { org_id: string; contact_email: string | null }[] | null)?.find(
        (e) => e.contact_email?.toLowerCase() === email.trim().toLowerCase(),
      );
      if (!match) return { ok: false, message: "That exporter is already in your list. Pick it from the list instead." };
      exporterId = match.org_id;
    }
  }

  const { data, error } = await supabase.rpc("share_versions", {
    p_exporter: exporterId,
    p_items: input.items.map((i) => ({ version_id: i.versionId, days: i.days })),
  });
  if (error) return { ok: false, message: message(error.message) };

  refresh();
  return { ok: true, exporterId, message: `${data} file${data === 1 ? "" : "s"} shared.` };
}

export async function setShareDuration(shareId: string, days: number | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_share_duration", { p_share: shareId, p_days: days });
  if (error) return { ok: false, message: message(error.message) };
  refresh();
  return { ok: true };
}

export async function revokeShares(shareIds: string[]): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_shares", { p_share_ids: shareIds });
  if (error) return { ok: false, message: message(error.message) };
  refresh();
  return { ok: true, message: `Access revoked for ${data} file${data === 1 ? "" : "s"}.` };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export type DeleteTarget =
  | { kind: "documents"; ids: string[] }
  | { kind: "folder"; id: string }
  | { kind: "version"; id: string };

export type DeleteImpact = { folders: number; files: number; versions: number; live_shares: number; exporters: number };

export async function getDeleteImpact(target: DeleteTarget): Promise<DeleteImpact | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_impact", {
    p_document_ids: target.kind === "documents" ? target.ids : null,
    p_folder: target.kind === "folder" ? target.id : null,
    p_version: target.kind === "version" ? target.id : null,
  });
  return error ? null : (data as DeleteImpact);
}

/** Deletes in the database (revoking shares), then removes the files from Storage. */
export async function deleteItems(target: DeleteTarget): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } =
    target.kind === "documents"
      ? await supabase.rpc("delete_documents", { p_document_ids: target.ids })
      : target.kind === "folder"
        ? await supabase.rpc("delete_folder", { p_folder: target.id })
        : await supabase.rpc("delete_version", { p_version: target.id });
  if (error) return { ok: false, message: message(error.message) };

  const paths = (data as string[] | null) ?? [];
  let storageFailed = false;
  for (let i = 0; i < paths.length; i += 500) {
    const { error: rmError } = await supabase.storage.from("documents").remove(paths.slice(i, i + 500));
    if (rmError) storageFailed = true;
  }

  refresh();
  return {
    ok: true,
    message: storageFailed
      ? "Deleted. Some stored files couldn't be removed; they are no longer accessible to anyone."
      : "Deleted.",
  };
}

/** Revokes everything shared with the exporter and disconnects them. */
export async function removeExporter(exporterId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_exporter", { p_exporter: exporterId });
  if (error) return { ok: false, message: message(error.message) };
  refresh();
  return { ok: true, message: `Exporter removed. Access revoked for ${data} file${data === 1 ? "" : "s"}.` };
}
