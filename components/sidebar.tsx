"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type NavIcon = "overview" | "documents" | "shared" | "products" | "audit" | "team" | "companies" | "folder";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  count?: number;
  /** Other path prefixes that also make this item current (e.g. detail pages). */
  alsoFor?: string[];
  /** Folder shortcuts shown under the item. */
  children?: { href: string; label: string; folderId: string }[];
};

export type NavSection = { label?: string; items: NavItem[] };

/**
 * Workspace navigation: a left sidebar on desktop, a horizontally scrolling bar on small screens.
 * The current page is marked with aria-current.
 */
export function Sidebar({ sections, company }: { sections: NavSection[]; company: { name: string; role: string } }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const isCurrent = (item: NavItem) => {
    const prefixes = [item.href, ...(item.alsoFor ?? [])];
    // Workspace home ("/manufacturer") is only current on itself; others match their sub-pages too.
    return prefixes.some((p, i) => (i === 0 && p.split("/").length === 2 ? pathname === p : pathname === p || pathname.startsWith(`${p}/`)));
  };
  const currentFolder = params.get("folder");

  return (
    <nav
      aria-label="Workspace"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-contrast-10 bg-base px-3 py-2 md:sticky md:top-15 md:h-[calc(100dvh-3.75rem)] md:w-60 md:flex-col md:gap-0.5 md:overflow-y-auto md:border-r md:border-b-0 md:px-3 md:py-5"
    >
      {sections.map((section, si) => (
        <div key={si} className="flex gap-1 md:flex-col md:gap-0.5">
          {section.label && (
            <p className="hidden px-2.5 pb-1.5 pt-5 text-[0.6875rem] font-semibold uppercase tracking-wider text-secondary md:block">
              {section.label}
            </p>
          )}
          {section.items.map((item) => {
            const current = isCurrent(item);
            return (
              <div key={item.href} className="contents md:block">
                <Link
                  href={item.href}
                  aria-current={current && !(currentFolder && item.children?.length) ? "page" : undefined}
                  className={`flex h-9 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lumo-m px-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary-50 ${
                    current ? "bg-primary-10 text-primary-text" : "text-secondary hover:bg-contrast-5 hover:text-header"
                  }`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                  {item.count !== undefined && (
                    <span className={`ml-auto pl-2 text-xs tabular-nums ${current ? "text-primary-text" : "text-secondary"}`}>
                      {item.count}
                    </span>
                  )}
                </Link>
                {item.children && item.children.length > 0 && (
                  <div className="ml-[1.375rem] mt-0.5 hidden flex-col gap-px border-l border-contrast-10 pb-1 pl-2.5 md:flex">
                    {item.children.map((c) => {
                      const on = current && currentFolder === c.folderId;
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          aria-current={on ? "page" : undefined}
                          className={`flex h-7 items-center truncate rounded-lumo-m px-2 text-[0.8125rem] focus-visible:outline-2 focus-visible:outline-primary-50 ${
                            on ? "font-semibold text-header" : "text-secondary hover:bg-contrast-5 hover:text-header"
                          }`}
                        >
                          <span className="truncate">{c.label}/</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div className="mt-auto hidden items-center gap-2.5 border-t border-contrast-10 px-2.5 pt-3 md:flex">
        <span className="grid size-8 shrink-0 place-items-center rounded-lumo-m bg-primary-10 text-xs font-semibold text-primary-text">
          {initials(company.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[0.8125rem] font-semibold text-header" title={company.name}>{company.name}</span>
          <span className="block text-xs text-secondary">{company.role}</span>
        </span>
      </div>
    </nav>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "•";

const PATHS: Record<NavIcon, string> = {
  overview: "M3 3h7v8H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 15h7v6H3z",
  documents: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5",
  shared: "M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  products: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  audit: "M9 5h11M9 12h11M9 19h11M4.5 5h.01M4.5 12h.01M4.5 19h.01",
  team: "M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.87M16 3.13a3.5 3.5 0 010 6.75",
  companies: "M4 20V6a1 1 0 011-1h8a1 1 0 011 1v14M14 10h5a1 1 0 011 1v9M3 20h18M8 9h2M8 13h2M8 17h2",
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z",
};

function Icon({ name }: { name: NavIcon }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[1.125rem] shrink-0" aria-hidden="true">
      <path d={PATHS[name]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
