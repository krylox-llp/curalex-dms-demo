"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Result = { ok: true; id?: string; message?: string } | { ok: false; message: string };

const ERRORS: Record<string, string> = {
  invalid_name: "Enter a name for the FPP.",
  fpp_exists: "You already have an FPP with that name.",
  not_found: "That item no longer exists or isn't available to you.",
  not_allowed: "You don't have permission to do that.",
  not_your_manufacturer: "That manufacturer hasn't added you yet.",
};
const message = (raw: string) =>
  ERRORS[Object.keys(ERRORS).find((k) => raw.includes(k)) ?? ""] ?? "Something went wrong. Please try again.";

async function call(fn: string, args: Record<string, unknown>): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, message: message(error.message) };
  refresh();
  return { ok: true, id: typeof data === "string" ? data : undefined };
}

export async function createFpp(name: string, details: string) {
  return call("create_fpp", { p_name: name, p_details: details });
}
export async function updateFpp(id: string, name: string, details: string) {
  return call("update_fpp", { p_fpp: id, p_name: name, p_details: details });
}
export async function deleteFpp(id: string) {
  return call("delete_fpp", { p_fpp: id });
}
export async function addFppManufacturer(fppId: string, manufacturerId: string, role: string) {
  return call("add_fpp_manufacturer", { p_fpp: fppId, p_manufacturer: manufacturerId, p_role: role });
}
export async function removeFppManufacturer(fppId: string, manufacturerId: string) {
  return call("remove_fpp_manufacturer", { p_fpp: fppId, p_manufacturer: manufacturerId });
}
export async function addFppDocuments(fppId: string, shareIds: string[]) {
  return call("add_fpp_documents", { p_fpp: fppId, p_share_ids: shareIds });
}
export async function removeFppDocument(fppId: string, shareId: string) {
  return call("remove_fpp_document", { p_fpp: fppId, p_share: shareId });
}
