import { NextResponse, type NextRequest } from "next/server";
import { ACTION_LABEL, getAuditEntries, parseFilters } from "@/lib/audit";

/** CSV export of the audit trail the caller can see (RLS), with the current filters. */
export async function GET(req: NextRequest) {
  const filters = parseFilters(Object.fromEntries(req.nextUrl.searchParams));
  const { entries, setupError } = await getAuditEntries(filters, 10000);
  if (setupError) return new NextResponse(setupError, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  const cols = [
    "id", "at_utc", "user", "action", "action_label", "record", "table", "operation", "record_id",
    "document_id", "changed_fields", "reason", "old_data", "new_data", "prev_hash", "row_hash",
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
    // Guard against spreadsheet formula injection, then CSV-quote.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [cols.join(",")].concat(
    entries.map((e) =>
      [
        e.id, e.at, e.actor_email, e.action, ACTION_LABEL[e.action] ?? e.action, e.subject_name, e.table_name, e.operation,
        e.record_id, e.subject_document_id, e.changed_fields?.join(" "), e.reason, e.old_data, e.new_data, e.prev_hash, e.row_hash,
      ]
        .map(esc)
        .join(","),
    ),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="curalex-audit-trail-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
