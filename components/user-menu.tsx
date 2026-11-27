"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { hidePanel, installPopoverFallback, positionFallback, wireTrigger } from "@/components/popover-support";

/**
 * Avatar button opening an account panel (name, email, company, Sign out). A plain popover
 * (modern-web-guidance `viewport-aware-dropdowns`), not an ARIA menu: it holds information and
 * one action, so no role="menu" / aria-haspopup.
 */
export function UserMenu({
  name,
  email,
  avatarUrl,
  company,
  links = [],
}: {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  /** The user's company and role, shown inside the menu. */
  company: { name: string; role: string };
  /** Workspace pages reached from the profile menu (e.g. Audit trail, Team). */
  links?: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  const id = useId();
  const panelId = `${id}-account`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const trigger = triggerRef.current!;
    const panel = panelRef.current!;
    wireTrigger(trigger, panelId);
    const onOpenChange = (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) positionFallback(trigger, panel);
    };
    const onToggle = (e: Event) => onOpenChange((e as ToggleEvent).newState === "open");
    panel.addEventListener("toggle", onToggle);
    const cleanup = installPopoverFallback(trigger, panel, onOpenChange);
    return () => {
      panel.removeEventListener("toggle", onToggle);
      cleanup();
    };
  }, [panelId]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-label="Account"
        className="rounded-full ring-offset-2 transition hover:ring-2 hover:ring-primary-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-50"
        {...({ commandfor: panelId, command: "toggle-popover" } as Record<string, string>)}
      >
        <Avatar name={name} email={email} avatarUrl={avatarUrl} className="size-9" />
      </button>
      <div ref={panelRef} id={panelId} popover="auto" aria-label="Account" className="overlay popover-panel w-80 overflow-hidden text-left">
        <div className="flex items-center gap-3 border-b border-contrast-10 p-4">
          <Avatar name={name} email={email} avatarUrl={avatarUrl} className="size-10" />
          <div className="min-w-0">
            {name && <p className="truncate text-sm font-semibold text-header">{name}</p>}
            <p className="truncate text-xs text-secondary">{email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border-b border-contrast-10 px-4 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lumo-m bg-primary-10 text-primary-text">
            <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
              <path d="M4 20V6a1 1 0 011-1h8a1 1 0 011 1v14M14 10h5a1 1 0 011 1v9M3 20h18M8 9h2M8 13h2M8 17h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug text-header">{company.name}</p>
            <p className="text-xs text-secondary">{company.role}</p>
          </div>
        </div>
        {links.length > 0 && (
          <nav aria-label="Account pages" className="overlay-content border-b border-contrast-10">
            {links.map((l) => {
              const current = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={current ? "page" : undefined}
                  onClick={() => panelRef.current && hidePanel(panelRef.current)}
                  className={`menu-item ${current ? "bg-primary-10 font-medium text-primary-text" : ""}`}
                >
                  <LinkIcon label={l.label} />
                  {l.label}
                </Link>
              );
            })}
          </nav>
        )}
        <form action="/auth/signout" method="post" className="overlay-content">
          <button type="submit" className="menu-item">
            <svg viewBox="0 0 24 24" fill="none" className="size-4 text-secondary" aria-hidden="true">
              <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l-4-4 4-4M6 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

function Avatar({
  name,
  email,
  avatarUrl,
  className,
}: {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  className: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className={`${className} rounded-full object-cover`} />
    );
  }
  const initial = (name ?? email).trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={`${className} grid place-items-center rounded-full bg-primary text-sm font-semibold text-white`}>
      {initial}
    </span>
  );
}

/** Small leading icon so menu labels line up with "Sign out". */
function LinkIcon({ label }: { label: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", className: "size-4 text-secondary", "aria-hidden": true } as const;
  const stroke = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (label === "Team")
    return (
      <svg {...common}>
        <path d="M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.87M16 3.13a3.5 3.5 0 010 6.75" {...stroke} />
      </svg>
    );
  if (label === "Companies")
    return (
      <svg {...common}>
        <path d="M4 20V6a1 1 0 011-1h8a1 1 0 011 1v14M14 10h5a1 1 0 011 1v9M3 20h18M8 9h2M8 13h2M8 17h2" {...stroke} />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M9 5h11M9 12h11M9 19h11M4.5 5h.01M4.5 12h.01M4.5 19h.01" {...stroke} />
    </svg>
  );
}
