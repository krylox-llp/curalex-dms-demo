import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FppManufacturer, FppRole, SharedDoc } from "@/lib/exporter/shared";

export * from "@/lib/exporter/shared";

/** Every document currently shared with the caller's exporter (expired ones flagged). */
export async function getSharedDocuments(): Promise<SharedDoc[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_shared_documents");
  if (error) throw new Error(error.message);
  return data as SharedDoc[];
}

export async function getManufacturerOptions(): Promise<{ org_id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_manufacturer_options");
  if (error) throw new Error(error.message);
  return data as { org_id: string; name: string }[];
}

export type Fpp = { id: string; name: string; details: string | null; created_at: string };

export async function getFpps() {
  const supabase = await createClient();
  const [fpps, mfrs, docs] = await Promise.all([
    supabase.from("fpps").select("id, name, details, created_at").order("name"),
    supabase.from("fpp_manufacturers").select("fpp_id, manufacturer_org_id"),
    supabase.from("fpp_documents").select("fpp_id, share_id"),
  ]);
  for (const r of [fpps, mfrs, docs]) if (r.error) throw new Error(r.error.message);
  return {
    fpps: fpps.data as Fpp[],
    manufacturers: mfrs.data as { fpp_id: string; manufacturer_org_id: string }[],
    documents: docs.data as { fpp_id: string; share_id: string }[],
  };
}

export async function getFpp(id: string) {
  const supabase = await createClient();
  const [fpp, mfrs, docs] = await Promise.all([
    supabase.from("fpps").select("id, name, details, created_at").eq("id", id).maybeSingle(),
    supabase.from("fpp_manufacturers").select("manufacturer_org_id, role, added_at").eq("fpp_id", id).order("added_at"),
    supabase.from("fpp_documents").select("share_id, share:document_shares!inner(manufacturer_org_id)").eq("fpp_id", id),
  ]);
  for (const r of [fpp, mfrs, docs]) if (r.error) throw new Error(r.error.message);
  if (!fpp.data) return null;
  return {
    fpp: fpp.data as Fpp,
    manufacturers: (mfrs.data as { manufacturer_org_id: string; role: FppRole | null }[]).map(
      (m): FppManufacturer => ({ id: m.manufacturer_org_id, role: m.role }),
    ),
    shareIds: new Set((docs.data as { share_id: string }[]).map((d) => d.share_id)),
    /** Which manufacturer each attached share came from (also for revoked shares). */
    shareMaker: new Map(
      (docs.data as unknown as { share_id: string; share: { manufacturer_org_id: string } }[]).map((d) => [
        d.share_id,
        d.share.manufacturer_org_id,
      ]),
    ),
  };
}
