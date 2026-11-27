"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Companies", match: (p: string) => p === "/admin" },
  { href: "/admin/audit", label: "Audit trail", match: (p: string) => p.startsWith("/admin/audit") },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="tabs -mx-4 shadow-none" aria-label="Admin">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.match(pathname) ? "page" : undefined} className="tab">
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
