import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton, PageHeader } from "@/components/app-shell";
import { RequestStatus } from "@/components/request-status";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Access requests · CuraLex - DMS" };

const TYPE_LABEL: Record<string, string> = { manufacturer: "Manufacturer", exporter: "Exporter", other: "Other" };
const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

type Request = {
  id: string; name: string; email: string; company: string; company_type: string;
  phone: string | null; message: string | null; status: "new" | "contacted" | "invited" | "declined"; created_at: string;
};

export default function AccessRequestsPage() {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <AccessRequests />
    </Suspense>
  );
}

async function AccessRequests() {
  const account = await requireAccount("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("access_requests")
    .select("id, name, email, company, company_type, phone, message, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const setupMissing = error?.code === "PGRST205";
  if (error && !setupMissing) throw new Error(error.message);
  const requests = (data ?? []) as Request[];

  return (
    <AppShell account={account} area="admin">
      <PageHeader
        title="Access requests"
        description="Requests from the “Request access” form on the landing page. Invite approved companies from Companies."
      />
      {setupMissing ? (
        <p className="notice notice-warning">Run supabase/migrations/20261128010000_access_requests.sql on this database to enable access requests.</p>
      ) : (
        <div className="data-grid">
          <table>
            <thead>
              <tr>
                <th>Received</th>
                <th>Contact</th>
                <th>Company</th>
                <th>Message</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-secondary">No requests yet.</td></tr>
              )}
              {requests.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap pt-3 text-secondary">{when.format(new Date(r.created_at))}</td>
                  <td className="pt-3">
                    <span className="block font-medium text-header">{r.name}</span>
                    <a href={`mailto:${r.email}`} className="block text-sm text-primary-text hover:underline">{r.email}</a>
                    {r.phone && <a href={`tel:${r.phone}`} className="block text-sm text-secondary">{r.phone}</a>}
                  </td>
                  <td className="pt-3">
                    <span className="block text-header">{r.company}</span>
                    <span className="badge badge-contrast badge-sm mt-1">{TYPE_LABEL[r.company_type] ?? r.company_type}</span>
                  </td>
                  <td className="max-w-md pt-3 text-sm text-body"><span className="line-clamp-4 whitespace-pre-line" title={r.message ?? undefined}>{r.message ?? "—"}</span></td>
                  <td className="py-2"><RequestStatus id={r.id} status={r.status} label={r.name} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
