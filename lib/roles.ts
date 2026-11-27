// Role catalogue and permissions (client-safe). Mirrors supabase/migrations/20261127090000_roles.sql
// and docs/roles-and-permissions.md.

export type Permission =
  | "documents.edit"
  | "documents.delete"
  | "sharing.share"
  | "sharing.revoke"
  | "exporters.invite"
  | "exporters.remove"
  | "activity.view"
  | "audit.view"
  | "users.manage"
  | "products.edit"
  | "documents.download";

export type RoleMeta = { value: string; label: string; description: string };

export const ROLES: Record<"manufacturer" | "exporter", RoleMeta[]> = {
  manufacturer: [
    { value: "admin", label: "Company admin", description: "Manages users and roles, connects and removes exporters, revokes access" },
    { value: "author", label: "Document author", description: "Creates folders, uploads files and new versions" },
    { value: "qa_approver", label: "QA approver", description: "Deletes documents (with reason) and revokes access; will approve versions" },
    { value: "doc_controller", label: "Document controller", description: "Shares documents with exporters, sets durations, revokes, invites exporters" },
    { value: "viewer", label: "Viewer", description: "Read-only access, including exporter activity and the audit trail" },
  ],
  exporter: [
    { value: "admin", label: "Company admin", description: "Manages users and roles; everything below" },
    { value: "regulatory", label: "Regulatory / quality", description: "Builds products, adds manufacturers and documents, downloads files" },
    { value: "viewer", label: "Viewer", description: "Views shared documents in the browser; no downloads" },
  ],
};

export const roleLabel = (type: "manufacturer" | "exporter", role: string) =>
  ROLES[type].find((r) => r.value === role)?.label ?? role;
