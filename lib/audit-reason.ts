/**
 * Attaches the reason for a change to a Supabase RPC call. The database audit trigger reads it
 * from the "x-audit-reason" request header (base64, so any language/characters survive HTTP).
 */
export function withReason<T extends { setHeader(name: string, value: string): T }>(query: T, reason?: string | null): T {
  const r = reason?.trim();
  return r ? query.setHeader("x-audit-reason", Buffer.from(r.slice(0, 500), "utf8").toString("base64")) : query;
}
