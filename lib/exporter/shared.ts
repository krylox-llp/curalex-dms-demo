// Types and helpers for the exporter workspace; safe for client components.

export type SharedDoc = {
  share_id: string;
  manufacturer_id: string;
  manufacturer_name: string;
  file_name: string;
  folder_path: string;
  version: number;
  size_bytes: number | null;
  mime_type: string | null;
  shared_at: string;
  expires_at: string | null;
  expired: boolean;
  /** Set by the manufacturer on the document. */
  doc_type: string | null;
  product: string | null;
  document_expiry: string | null; // YYYY-MM-DD
  /** Latest version of the document at the manufacturer (may be newer than the shared one). */
  latest_version: number | null;
};

export type FppRole = "finished_product" | "api" | "excipient" | "packaging" | "other";

export const FPP_ROLES: { value: FppRole; label: string }[] = [
  { value: "finished_product", label: "Finished product manufacturer" },
  { value: "api", label: "API manufacturer" },
  { value: "excipient", label: "Excipient supplier" },
  { value: "packaging", label: "Packaging supplier" },
  { value: "other", label: "Other" },
];

export const roleLabel = (role: FppRole | null) => FPP_ROLES.find((r) => r.value === role)?.label ?? null;

export type FppManufacturer = { id: string; role: FppRole | null };

export const DAY = 86_400_000;
export const isExpiringSoon = (d: SharedDoc, now: number) =>
  !d.expired && d.expires_at !== null && new Date(d.expires_at).getTime() - now <= 7 * DAY;
