import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DocDetails, DocShare, DocumentWithVersions, Folder, Version } from "@/lib/documents-shared";

export * from "@/lib/documents-shared";

export async function getFolders(): Promise<Folder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("folders").select("id, parent_id, name").order("name");
  if (error) throw new Error(error.message);
  return data;
}

const DETAIL_COLUMNS = "doc_type, product, market, issued_by, reference_no, issue_date, expiry_date";

/**
 * Documents with details, uploaded versions (newest first) and live shares.
 * `folderId`: a folder, `null` for the top level, or `"all"` for every folder.
 */
export async function getDocuments(folderId: string | null | "all"): Promise<DocumentWithVersions[]> {
  const supabase = await createClient();
  let query = supabase
    .from("documents")
    .select(`id, name, folder_id, ${DETAIL_COLUMNS}, document_versions(id, version, size_bytes, created_at, storage_path, status)`)
    .order("name")
    .order("version", { referencedTable: "document_versions", ascending: false });
  if (folderId !== "all") query = folderId ? query.eq("folder_id", folderId) : query.is("folder_id", null);
  const [docs, shares] = await Promise.all([query, getLiveShares()]);
  if (docs.error) {
    // 42703: undefined column — the document-details migration hasn't been applied to this database.
    if (docs.error.code === "42703") {
      throw new Error(
        "CuraLex database is out of date: run supabase/migrations/20261128000000_document_details.sql on this " +
          "Supabase project (SQL editor or `supabase db push`), then reload.",
      );
    }
    throw new Error(docs.error.message);
  }

  return (docs.data as unknown as (DocDetails & {
    id: string; name: string; folder_id: string | null;
    document_versions: (Version & { status: string })[];
  })[])
    .map((d) => ({
      id: d.id,
      name: d.name,
      folderId: d.folder_id,
      details: {
        doc_type: d.doc_type, product: d.product, market: d.market, issued_by: d.issued_by,
        reference_no: d.reference_no, issue_date: d.issue_date, expiry_date: d.expiry_date,
      },
      versions: d.document_versions.filter((v) => v.status === "ready"),
      shares: shares.get(d.id) ?? [],
    }))
    .filter((d) => d.versions.length > 0); // hide files whose upload never finished
}

/** Live (not revoked, not expired) shares given by the caller's company, grouped by document. */
export async function getLiveShares(): Promise<Map<string, DocShare[]>> {
  const supabase = await createClient();
  const [shares, exporters] = await Promise.all([
    supabase
      .from("document_shares")
      .select("id, exporter_org_id, expires_at, version:document_versions!inner(document_id, version)")
      .is("revoked_at", null),
    supabase.rpc("my_exporters"),
  ]);
  if (shares.error) throw new Error(shares.error.message);
  const names = new Map(((exporters.data ?? []) as { org_id: string; name: string }[]).map((e) => [e.org_id, e.name]));
  const now = Date.now();
  const byDoc = new Map<string, DocShare[]>();
  for (const s of shares.data as unknown as {
    id: string; exporter_org_id: string; expires_at: string | null; version: { document_id: string; version: number };
  }[]) {
    if (s.expires_at && Date.parse(s.expires_at) <= now) continue;
    const list = byDoc.get(s.version.document_id) ?? [];
    list.push({
      shareId: s.id,
      exporterId: s.exporter_org_id,
      exporterName: names.get(s.exporter_org_id) ?? "Exporter",
      version: s.version.version,
      expiresAt: s.expires_at,
    });
    byDoc.set(s.version.document_id, list);
  }
  return byDoc;
}
