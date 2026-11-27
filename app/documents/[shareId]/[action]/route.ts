import { NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/lib/documents-shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Exporter opens a shared document: /documents/<shareId>/view or /download.
 * record_document_access() checks the share is live and logs the access; only then is a
 * 60-second signed URL issued. Exporters never get direct Storage access.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/documents/[shareId]/[action]">) {
  const { shareId, action } = await ctx.params;
  if (!isUuid(shareId) || (action !== "view" && action !== "download")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_document_access", { p_share: shareId, p_action: action });
  if (error) {
    return new NextResponse(
      "This document is no longer available to you. The manufacturer may have revoked access, or it has expired.",
      { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const file = data as { storage_path: string; file_name: string };
  const { data: signed, error: signError } = await createAdminClient()
    .storage.from("documents")
    .createSignedUrl(file.storage_path, 60, action === "download" ? { download: file.file_name } : undefined);
  if (signError || !signed) {
    return new NextResponse("Could not open the file. Please try again.", { status: 502 });
  }

  const res = NextResponse.redirect(signed.signedUrl, 303);
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}
