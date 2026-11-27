import Link from "next/link";
import { Logo } from "@/components/logo";
import { PermissionsProvider } from "@/components/permissions";
import { UserMenu } from "@/components/user-menu";
import { can, ORG_TYPE_LABEL, type Account } from "@/lib/account";

/**
 * Signed-in layout: CuraLex logo on the left, avatar menu (with the user's company) on the right.
 * Admin pages always show the admin context, even if the admin's account also belongs to a company.
 */
export function AppShell({
  account,
  area,
  nav,
  children,
}: {
  account: Account;
  area: "admin" | "company";
  /** Optional tab bar shown under the header. */
  nav?: React.ReactNode;
  children: React.ReactNode;
}) {
  const company =
    area === "company" && account.org
      ? { name: account.org.name, role: ORG_TYPE_LABEL[account.org.type] }
      : { name: "CuraLex - DMS", role: "Platform admin" };

  return (
    <PermissionsProvider permissions={account.permissions}>
    <div className="flex flex-1 flex-col bg-base">
      <header className="border-b border-contrast-10 bg-base">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="CuraLex - DMS home" className="rounded-lumo-m focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-50">
              <Logo size="sm" />
            </Link>
            {area === "admin" && (
              <span className="badge badge-contrast badge-sm">Admin</span>
            )}
          </div>
          <UserMenu
            name={account.name}
            email={account.email}
            avatarUrl={account.avatarUrl}
            company={company}
            links={profileLinks(account, area)}
          />
        </div>
        {nav && <div className="mx-auto max-w-6xl px-6">{nav}</div>}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
    </PermissionsProvider>
  );
}

export function AppShellSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-base" aria-busy="true">
      <header className="border-b border-contrast-10 bg-base">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="h-5 w-40 animate-pulse rounded bg-contrast-10" />
          <span className="size-9 animate-pulse rounded-full bg-contrast-10" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <span className="block h-40 animate-pulse rounded-lumo-l bg-contrast-10" />
      </main>
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

/** Links shown in the profile menu: Audit trail and Team (per permission), or the admin pages. */
function profileLinks(account: Account, area: "admin" | "company") {
  if (area === "admin") {
    return [
      { href: "/admin", label: "Companies" },
      { href: "/admin/audit", label: "Audit trail" },
    ];
  }
  const base = `/${account.org?.type ?? ""}`;
  return [
    ...(can(account, "audit.view") ? [{ href: `${base}/audit`, label: "Audit trail" }] : []),
    ...(can(account, "users.manage") ? [{ href: `${base}/team`, label: "Team" }] : []),
  ];
}
