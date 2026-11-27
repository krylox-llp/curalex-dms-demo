import Link from "next/link";
import { GlobalSearch } from "@/components/global-search";
import { Logo } from "@/components/logo";
import { PermissionsProvider } from "@/components/permissions";
import { Sidebar } from "@/components/sidebar";
import { UserMenu } from "@/components/user-menu";
import { ORG_TYPE_LABEL, type Account } from "@/lib/account";
import { getNavSections } from "@/lib/nav";

/**
 * Signed-in layout: header (logo, search, avatar menu) over a left sidebar with the workspace's pages.
 * Admin pages always show the admin context, even if the admin's account also belongs to a company.
 */
export async function AppShell({
  account,
  area,
  children,
}: {
  account: Account;
  area: "admin" | "company";
  children: React.ReactNode;
}) {
  const company =
    area === "company" && account.org
      ? { name: account.org.name, role: ORG_TYPE_LABEL[account.org.type] }
      : { name: "CuraLex - DMS", role: "Platform admin" };
  const sections = await getNavSections(account, area);
  const searchBase = area === "company" && account.org ? `/${account.org.type}/search` : null;

  return (
    <PermissionsProvider permissions={account.permissions}>
      <div className="flex flex-1 flex-col bg-contrast-5/40">
        <header className="sticky top-0 z-30 border-b border-contrast-10 bg-base">
          <div className="flex h-15 items-center gap-4 px-4 md:px-6">
            <div className="flex shrink-0 items-center gap-3 md:w-52">
              <Link href="/" aria-label="CuraLex - DMS home" className="rounded-lumo-m focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-50">
                <Logo size="sm" />
              </Link>
              {area === "admin" && <span className="badge badge-contrast badge-sm">Admin</span>}
            </div>
            {searchBase ? (
              <GlobalSearch
                action={searchBase}
                placeholder={account.org?.type === "exporter" ? "Search products, manufacturers, documents…" : "Search documents, exporters…"}
              />
            ) : (
              <span className="flex-1" />
            )}
            <div className="ml-auto shrink-0">
              <UserMenu name={account.name} email={account.email} avatarUrl={account.avatarUrl} company={company} />
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col md:flex-row">
          <Sidebar sections={sections} company={company} />
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-7">
            <div className="mx-auto max-w-[90rem]">{children}</div>
          </main>
        </div>
      </div>
    </PermissionsProvider>
  );
}

export function AppShellSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-contrast-5/40" aria-busy="true">
      <header className="border-b border-contrast-10 bg-base">
        <div className="flex h-15 items-center justify-between px-6">
          <span className="h-5 w-40 animate-pulse rounded bg-contrast-10" />
          <span className="size-9 animate-pulse rounded-full bg-contrast-10" />
        </div>
      </header>
      <div className="flex flex-1">
        <span className="hidden w-60 border-r border-contrast-10 bg-base md:block" />
        <main className="flex-1 px-8 py-7">
          <span className="block h-8 w-64 animate-pulse rounded bg-contrast-10" />
          <span className="mt-6 block h-40 animate-pulse rounded-lumo-l bg-contrast-10" />
        </main>
      </div>
    </div>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold text-header">{title}</h2>
      {description && <p className="mt-1 text-sm text-secondary">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  // Lumo badges: success for joined companies, neutral contrast for pending invitations.
  return status === "active" ? (
    <span className="badge badge-success">Active</span>
  ) : (
    <span className="badge badge-contrast">Invited</span>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-secondary">
        {children}
      </td>
    </tr>
  );
}

/** Lumo grid styling lives in the `.grid` component class (globals.css). */
export const tableClasses = {
  wrap: "data-grid mt-6",
  table: "",
  head: "",
  th: "",
  td: "",
};

export const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Standard page header: optional breadcrumb, title, one-line description and actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
        <h1 className="truncate text-[1.75rem] font-semibold leading-tight text-header">{title}</h1>
        {description && <div className="mt-1 text-[0.9375rem] text-secondary">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
