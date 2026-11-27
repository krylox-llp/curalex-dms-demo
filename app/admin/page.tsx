import type { Metadata } from "next";
import { Suspense } from "react";
import { inviteCompany } from "@/app/actions";
import {
  AppShell, AppShellSkeleton, EmptyRow, PageHeader, Section, StatusBadge, dateFormat, tableClasses as t,
} from "@/components/app-shell";
import { AdminNav } from "@/components/admin-nav";
import { InviteForm } from "@/components/invite-form";
import { ORG_TYPE_LABEL, requireAccount, type OrgType } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin · CuraLex - DMS" };

type CompanyRow = {
  org_id: string;
  name: string;
  type: OrgType;
  contact_email: string | null;
  status: string;
  invited_at: string | null;
  invited_by_company: string | null;
};

export default function AdminPage() {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <AdminWorkspace />
    </Suspense>
  );
}

async function AdminWorkspace() {
  const account = await requireAccount("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_companies");
  if (error) throw new Error(error.message);
  const companies = (data ?? []) as CompanyRow[];

  return (
    <AppShell account={account} area="admin" nav={<AdminNav />}>
      <PageHeader title="Companies" description="Manufacturers and exporters on CuraLex. Companies join by invitation only." />
      <Section title="Invite a company" description="The contact signs in with Google using this email to join.">
        <InviteForm
          action={inviteCompany}
          submitLabel="Send invite"
          fields={[
            { name: "company", label: "Company name", type: "text", placeholder: "Acme Pharma Pvt Ltd" },
            { name: "email", label: "Contact email", type: "email", placeholder: "qa@acmepharma.in" },
            {
              name: "type",
              label: "Role",
              type: "select",
              options: [
                { value: "manufacturer", label: "Manufacturer" },
                { value: "exporter", label: "Exporter" },
              ],
            },
          ]}
        />

        </Section>
        <div className={t.wrap}>
          <table className={t.table}>
            <thead className={t.head}>
              <tr>
                <th className={t.th}>Company</th>
                <th className={t.th}>Role</th>
                <th className={t.th}>Contact</th>
                <th className={t.th}>Invited by</th>
                <th className={t.th}>Invited</th>
                <th className={t.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 && <EmptyRow colSpan={6}>No companies yet. Invite your first manufacturer above.</EmptyRow>}
              {companies.map((c) => (
                <tr key={c.org_id}>
                  <td className={`${t.td} font-medium text-header`}>{c.name}</td>
                  <td className={t.td}>{ORG_TYPE_LABEL[c.type]}</td>
                  <td className={t.td}>{c.contact_email ?? "—"}</td>
                  <td className={t.td}>{c.invited_by_company ?? "CuraLex"}</td>
                  <td className={t.td}>{c.invited_at ? dateFormat.format(new Date(c.invited_at)) : "—"}</td>
                  <td className={t.td}><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </AppShell>
  );
}
