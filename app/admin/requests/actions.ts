"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Platform admins track follow-up on landing-page access requests. */
export async function setRequestStatus(id: string, status: "new" | "contacted" | "invited" | "declined") {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_access_request_status", { p_request: id, p_status: status });
  if (error) return { ok: false as const, message: error.message.includes("not_allowed") ? "You don't have permission to do that." : "Could not update the request." };
  refresh();
  return { ok: true as const };
}
