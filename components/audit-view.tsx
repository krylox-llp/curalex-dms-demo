import Link from "next/link";
import { ACTION_LABEL, CATEGORIES, describeChange, formatUtc, getAuditEntries, tone, type AuditFilters } from "@/lib/audit";

/** Audit trail table with filters, paging and CSV export (server component). */
export async function AuditView({ basePath, filters }: { basePath: string; filters: AuditFilters }) {
  const { entries, more, setupError } = await getAuditEntries(filters);
  if (setupError) return <p role="alert" className="notice notice-warning">{setupError}</p>;
  const params = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ category: filters.category, q: filters.q, document: filters.document, ...extra }))
      if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const docName = filters.document ? entries.find((e) => e.subject_document_id === filters.document)?.subject_name?.replace(/ v\d+.*$/, "") : null;

  return (
    <div>
      <form method="get" action={basePath} className="mb-4 flex flex-wrap items-end gap-3">
        {filters.document && <input type="hidden" name="document" value={filters.document} />}
        <label className="field-label">
          Category
          <select name="category" defaultValue={filters.category ?? ""} className="text-field text-field-sm min-w-48">
            <option value="">All activity</option>
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <option key={k} value={k}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Search
          <input type="search" name="q" defaultValue={filters.q ?? ""} placeholder="File, user or reason" className="text-field text-field-sm min-w-64" />
        </label>
        <button type="submit" className="btn btn-sm">Apply</button>
        <a href={`/audit/export${params({})}`} className="btn-tertiary btn-sm ml-auto" download>
          Export CSV
        </a>
      </form>

      {filters.document && (
        <p className="notice mb-4 items-center justify-between">
          <span>History of <strong className="font-semibold">{docName ?? "this document"}</strong>: uploads, versions, sharing and access.</span>
          <Link href={`${basePath}${params({ document: undefined })}`} className="btn-tertiary btn-sm">Show all activity</Link>
        </p>
      )}

      <div className="data-grid">
        <table>
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th>User</th>
              <th>Action</th>
              <th>Record</th>
              <th>Details</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="py-14 text-center text-secondary">No activity matches these filters.</td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-secondary" title={`#${e.id} · ${e.row_hash}`}>{formatUtc(e.at).replace(" UTC", "")}</td>
                <td className="max-w-0 w-[16%]"><span className="block truncate" title={e.actor_email ?? "System"}>{e.actor_email ?? "System"}</span></td>
                <td><span className={`badge whitespace-nowrap ${tone(e.action)}`}>{ACTION_LABEL[e.action] ?? e.action}</span></td>
                <td className="max-w-0 w-[24%]"><span className="block truncate font-medium text-header" title={e.subject_name ?? ""}>{e.subject_name ?? "—"}</span></td>
                <td className="max-w-0 w-[20%]"><span className="block truncate text-secondary" title={describeChange(e)}>{describeChange(e) || "—"}</span></td>
                <td className="max-w-0 w-[18%]"><span className="block truncate" title={e.reason ?? ""}>{e.reason ?? <span className="text-tertiary">—</span>}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && (
        <div className="mt-3 flex justify-end">
          <Link href={`${basePath}${params({ before: String(entries.at(-1)!.id) })}`} className="btn btn-sm">Older entries →</Link>
        </div>
      )}
    </div>
  );
}
