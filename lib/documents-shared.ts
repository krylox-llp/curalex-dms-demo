// Types and pure helpers for documents; safe to import from client components.

export type Folder = { id: string; parent_id: string | null; name: string };

export type Version = {
  id: string;
  version: number;
  size_bytes: number | null;
  created_at: string;
  storage_path: string;
};

export type DocumentWithVersions = { id: string; name: string; versions: Version[] };

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
