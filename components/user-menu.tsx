"use client";

import { useEffect, useId, useRef, useState } from "react";

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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Account menu"
        className="rounded-full ring-offset-2 transition hover:ring-2 hover:ring-primary-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-50"
      >
        <Avatar name={name} email={email} avatarUrl={avatarUrl} className="size-9" />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="overlay absolute right-0 z-20 mt-2 w-80 overflow-hidden"
        >
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
            <button
              type="submit"
              role="menuitem"
              className="menu-item"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-4 text-secondary" aria-hidden="true">
                <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l-4-4 4-4M6 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
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
