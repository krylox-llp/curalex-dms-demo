import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AuditEntry = {
  id: number;
  at: string;
  actor_email: string | null;
  action: string;
  table_name: string;
  operation: string;
  record_id: string | null;
  subject_document_id: string | null;
  subject_name: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
  reason: string | null;
  prev_hash: string | null;
  row_hash: string;
};

export const ACTION_LABEL: Record<string, string> = {
  "folder.created": "Folder created",
  "folder.renamed": "Folder renamed",
  "folder.deleted": "Folder deleted",
  "folder.updated": "Folder updated",
  "document.created": "File created",
  "document.renamed": "File renamed",
  "document.deleted": "File deleted",
  "document.updated": "File updated",
  "version.uploaded": "Version uploaded",
  "version.deleted": "Version deleted",
  "version.moved": "Version moved",
  "version.updated": "Version updated",
  "share.created": "Shared",
  "share.duration_changed": "Access duration changed",
  "share.revoked": "Access revoked",
  "share.updated": "Share updated",
  "document.viewed": "Viewed",
  "document.downloaded": "Downloaded",
  "exporter.connected": "Exporter connected",
  "exporter.removed": "Exporter removed",
  "invitation.created": "Invitation sent",
  "invitation.accepted": "Invitation accepted",
  "invitation.deleted": "Invitation deleted",
  "member.added": "User joined",
  "member.removed": "User removed",
  "company.created": "Company created",
  "company.updated": "Company updated",
  "admin.added": "Admin added",
  "admin.removed": "Admin removed",
  "product.created": "Product created",
  "product.updated": "Product updated",
  "product.deleted": "Product deleted",
  "product.manufacturer_added": "Manufacturer added to product",
  "product.manufacturer_removed": "Manufacturer removed from product",
  "product.manufacturer_role_changed": "Manufacturer role changed",
  "product.document_added": "Document added to product",
  "product.document_removed": "Document removed from product",
};

export const CATEGORIES: Record<string, { label: string; actions: string[] }> = {
  documents: {
    label: "Documents",
    actions: Object.keys(ACTION_LABEL).filter(
      (a) => a.startsWith("folder.") || a.startsWith("version.") || ["document.created", "document.renamed", "document.deleted", "document.updated"].includes(a),
    ),
  },
  sharing: { label: "Sharing", actions: Object.keys(ACTION_LABEL).filter((a) => a.startsWith("share.")) },
  access: { label: "Views & downloads", actions: ["document.viewed", "document.downloaded"] },
  companies: {
    label: "Companies & users",
    actions: Object.keys(ACTION_LABEL).filter((a) => /^(company|invitation|member|exporter|admin)\./.test(a)),
  },
  products: { label: "Products", actions: Object.keys(ACTION_LABEL).filter((a) => a.startsWith("product.")) },
};

export type AuditFilters = { category?: string; q?: string; document?: string; before?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string).trim() : undefined);
  const before = Number(str("before"));
  return {
    category: str("category") && CATEGORIES[str("category")!] ? str("category") : undefined,
    q: str("q") || undefined,
    document: str("document") && UUID.test(str("document")!) ? str("document") : undefined,
    before: Number.isInteger(before) && before > 0 ? before : undefined,
  };
}

export const AUDIT_NOT_SET_UP =
  "The audit trail isn't set up on this database yet. Run supabase/migrations/20261127080000_audit_trail.sql " +
  "(then, if needed: notify pgrst, 'reload schema';).";

/** Audit entries visible to the caller (RLS), newest first. */
export async function getAuditEntries(
  f: AuditFilters,
  limit = 100,
): Promise<{ entries: AuditEntry[]; more: boolean; setupError?: string }> {
  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select(
      "id, at, actor_email, action, table_name, operation, record_id, subject_document_id, subject_name, old_data, new_data, changed_fields, reason, prev_hash, row_hash",
    )
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (f.before) query = query.lt("id", f.before);
  if (f.document) query = query.eq("subject_document_id", f.document);
  if (f.category) query = query.in("action", CATEGORIES[f.category].actions);
  if (f.q) {
    const q = f.q.replace(/[,()*%\\]/g, " ").trim();
    if (q) query = query.or(`subject_name.ilike.%${q}%,actor_email.ilike.%${q}%,reason.ilike.%${q}%`);
  }
  const { data, error } = await query;
  // PGRST205: table missing from the API schema (migration not run on this project).
  if (error?.code === "PGRST205") return { entries: [], more: false, setupError: AUDIT_NOT_SET_UP };
  if (error) throw new Error(error.message);
  const rows = data as AuditEntry[];
  return { entries: rows.slice(0, limit), more: rows.length > limit };
}

const FIELD_LABEL: Record<string, string> = {
  expires_at: "Access until",
  revoked_at: "Revoked",
  deleted_at: "Deleted",
  name: "Name",
  details: "Details",
  status: "Status",
  role: "Role",
  accepted_at: "Accepted",
  size_bytes: "Size",
};
const HIDDEN_FIELDS = new Set(["storage_path", "storage_name", "accepted_by", "mime_type", "uploaded_by", "created_by"]);
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function fmtValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return field === "expires_at" ? "No expiry" : "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return dateFmt.format(new Date(v));
  if (field === "size_bytes" && typeof v === "number")
    return v < 1024 ? `${v} B` : v < 1024 * 1024 ? `${Math.round(v / 1024)} KB` : `${(v / 1048576).toFixed(1)} MB`;
  return String(v);
}

/** Short human summary of what changed. */
export function describeChange(e: AuditEntry): string {
  if (e.action === "share.created") return `Access until ${fmtValue("expires_at", e.new_data?.expires_at)}`;
  if (e.action === "version.uploaded") return `Size ${fmtValue("size_bytes", e.new_data?.size_bytes)}`;
  if (e.action === "product.manufacturer_added" && e.new_data?.role) return `Role: ${String(e.new_data.role).replace("_", " ")}`;
  if (e.operation !== "UPDATE" || !e.changed_fields) return "";
  if (e.action === "share.revoked" || e.action.endsWith(".deleted") || e.action === "version.uploaded") return "";
  return e.changed_fields
    .filter((f) => !HIDDEN_FIELDS.has(f) && FIELD_LABEL[f])
    .map((f) => `${FIELD_LABEL[f]}: ${fmtValue(f, e.old_data?.[f])} → ${fmtValue(f, e.new_data?.[f])}`)
    .join("; ");
}

export const formatUtc = (iso: string) => new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC";

export function tone(action: string) {
  if (/(deleted|revoked|removed)$/.test(action)) return "badge-error";
  if (action === "document.viewed" || action === "document.downloaded") return "badge-contrast";
  return "";
}
