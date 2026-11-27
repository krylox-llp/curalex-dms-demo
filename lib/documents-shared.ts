// Types and pure helpers for documents; safe to import from client components.

export type Folder = { id: string; parent_id: string | null; name: string };

export type Version = {
  id: string;
  version: number;
  size_bytes: number | null;
  created_at: string;
  storage_path: string;
};

export type DocType =
  | "coa" | "copp" | "gmp" | "licence" | "dmf" | "stability" | "be_study"
  | "specification" | "sop" | "validation" | "iso" | "other";

/** Document types: short code shown as a badge, full name in forms and the details panel. */
export const DOC_TYPES: { value: DocType; short: string; label: string }[] = [
  { value: "coa", short: "CoA", label: "Certificate of Analysis" },
  { value: "copp", short: "CoPP", label: "Certificate of Pharmaceutical Product" },
  { value: "gmp", short: "GMP", label: "GMP certificate" },
  { value: "licence", short: "Licence", label: "Manufacturing licence" },
  { value: "dmf", short: "DMF", label: "Drug Master File" },
  { value: "stability", short: "Stability", label: "Stability data" },
  { value: "be_study", short: "BE study", label: "Bioequivalence study" },
  { value: "specification", short: "Spec", label: "Specification / test method" },
  { value: "sop", short: "SOP", label: "Standard operating procedure" },
  { value: "validation", short: "Validation", label: "Validation report" },
  { value: "iso", short: "ISO", label: "ISO certificate" },
  { value: "other", short: "Other", label: "Other" },
];
export const docType = (v: string | null | undefined) => DOC_TYPES.find((t) => t.value === v) ?? null;

export type DocDetails = {
  doc_type: DocType | null;
  product: string | null;
  market: string | null;
  issued_by: string | null;
  reference_no: string | null;
  issue_date: string | null; // YYYY-MM-DD
  expiry_date: string | null; // YYYY-MM-DD
};

export const EMPTY_DETAILS: DocDetails = {
  doc_type: null, product: null, market: null, issued_by: null, reference_no: null, issue_date: null, expiry_date: null,
};

/** A live share of one of the document's versions. */
export type DocShare = { shareId: string; exporterId: string; exporterName: string; version: number; expiresAt: string | null };

export type DocumentWithVersions = {
  id: string;
  name: string;
  folderId: string | null;
  details: DocDetails;
  versions: Version[];
  shares: DocShare[];
};

/** Days from `today` (YYYY-MM-DD) to `date` (YYYY-MM-DD); negative when past. */
export function daysUntil(date: string, today: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Expiry badge: red when expired or within 30 days, amber within 90 days, otherwise none. */
export function expiryBadge(date: string | null, today: string): { label: string; tone: "error" | "warning" | "contrast" } | null {
  if (!date) return null;
  const d = daysUntil(date, today);
  if (d < 0) return { label: "Expired", tone: "error" };
  if (d === 0) return { label: "Expires today", tone: "error" };
  if (d <= 30) return { label: `${d} day${d === 1 ? "" : "s"}`, tone: "error" };
  if (d <= 90) return { label: `${d} days`, tone: "warning" };
  return null;
}

export const dateOnly = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const formatDate = (date: string | null) => (date ? dateOnly.format(new Date(`${date.slice(0, 10)}T00:00:00Z`)) : "—");

/** Today's date in India, as YYYY-MM-DD (expiry dates are calendar dates). */
export const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export const DURATIONS: { label: string; days: number | null }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "6 months", days: 180 },
  { label: "1 year", days: 365 },
  { label: "No expiry", days: null },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Folder ancestry from the top level down to `id` (inclusive). */
export function folderTrail(folders: Folder[], id: string | null): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const trail: Folder[] = [];
  for (let f = id ? byId.get(id) : undefined; f; f = f.parent_id ? byId.get(f.parent_id) : undefined) {
    trail.unshift(f);
  }
  return trail;
}

export const folderPathLabel = (folders: Folder[], id: string | null) =>
  ["Documents", ...folderTrail(folders, id).map((f) => f.name)].join(" / ");

export function formatBytes(n: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** The current time, read once per request by server components (pages are rendered per request). */
export const requestTime = () => Date.now();
