"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCan } from "@/components/permissions";
import type { Permission } from "@/lib/roles";

const TABS = [
  { href: "/manufacturer", label: "Documents", match: (p: string) => p === "/manufacturer" },
  { href: "/manufacturer/shared", label: "Shared with", match: (p: string) => p.startsWith("/manufacturer/share") },
  { href: "/manufacturer/audit", label: "Audit trail", match: (p: string) => p.startsWith("/manufacturer/audit"), needs: "audit.view" as Permission },
  { href: "/manufacturer/team", label: "Team", match: (p: string) => p.startsWith("/manufacturer/team"), needs: "users.manage" as Permission },
];

export function ManufacturerNav() {
  const pathname = usePathname();
  const canAudit = useCan("audit.view");
  const canTeam = useCan("users.manage");
  const allowed = (t: { needs?: Permission }) =>
    !t.needs || (t.needs === "audit.view" ? canAudit : canTeam);
  return (
    <nav className="tabs -mx-4 shadow-none" aria-label="Workspace">
      {TABS.filter(allowed).map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className="tab"
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
