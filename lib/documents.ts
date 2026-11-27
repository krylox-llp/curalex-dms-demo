import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DocumentWithVersions, Folder, Version } from "@/lib/documents-shared";

export * from "@/lib/documents-shared";

export async function getFolders(): Promise<Folder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("folders").select("id, parent_id, name").order("name");
  if (error) throw new Error(error.message);
  return data;
}

/** Documents in a folder (null = top level) with their uploaded versions, newest first. */
export async function getDocuments(folderId: string | null): Promise<DocumentWithVersions[]> {
  const supabase = await createClient();
  let query = supabase
    .from("documents")
    .select("id, name, document_versions(id, version, size_bytes, created_at, storage_path, status)")
    .order("name")
    .order("version", { referencedTable: "document_versions", ascending: false });
  query = folderId ? query.eq("folder_id", folderId) : query.is("folder_id", null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return data
    .map((d) => ({
      id: d.id as string,
      name: d.name as string,
      versions: (d.document_versions as (Version & { status: string })[]).filter((v) => v.status === "ready"),
    }))
    .filter((d) => d.versions.length > 0); // hide files whose upload never finished
}
