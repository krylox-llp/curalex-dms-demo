"use client";

import { useEffect, useId, useRef, useState } from "react";
import { installPopoverFallback, positionFallback, wireTrigger } from "@/components/popover-support";

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
}: {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  /** The user's company and role, shown inside the menu. */
  company: { name: string; role: string };
}) {
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

