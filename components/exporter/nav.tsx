"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCan } from "@/components/permissions";
import type { Permission } from "@/lib/roles";

const TABS = [
  { href: "/exporter", label: "Products", match: (p: string) => p === "/exporter" || p.startsWith("/exporter/fpps") },
  { href: "/exporter/shared", label: "Shared with me", match: (p: string) => p.startsWith("/exporter/shared") },
  { href: "/exporter/audit", label: "Audit trail", match: (p: string) => p.startsWith("/exporter/audit"), needs: "audit.view" as Permission },
  { href: "/exporter/team", label: "Team", match: (p: string) => p.startsWith("/exporter/team"), needs: "users.manage" as Permission },
];

export function ExporterNav() {
  const pathname = usePathname();
  const canAudit = useCan("audit.view");
  const canTeam = useCan("users.manage");
  const allowed = (t: { needs?: Permission }) =>
    !t.needs || (t.needs === "audit.view" ? canAudit : canTeam);
  return (
    <nav className="tabs -mx-4 shadow-none" aria-label="Workspace">
      {TABS.filter(allowed).map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.match(pathname) ? "page" : undefined} className="tab">
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
