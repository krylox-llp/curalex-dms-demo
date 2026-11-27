"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/manufacturer", label: "Documents", match: (p: string) => p === "/manufacturer" },
  { href: "/manufacturer/shared", label: "Shared with", match: (p: string) => p.startsWith("/manufacturer/share") },
];

export function ManufacturerNav() {
  const pathname = usePathname();
  return (
    <nav className="tabs -mx-4 shadow-none" aria-label="Workspace">
      {TABS.map((t) => {
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
