"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/exporter", label: "FPPs", match: (p: string) => p === "/exporter" || p.startsWith("/exporter/fpps") },
  { href: "/exporter/shared", label: "Shared with me", match: (p: string) => p.startsWith("/exporter/shared") },
];

export function ExporterNav() {
  const pathname = usePathname();
  return (
    <nav className="tabs -mx-4 shadow-none" aria-label="Workspace">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.match(pathname) ? "page" : undefined} className="tab">
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
