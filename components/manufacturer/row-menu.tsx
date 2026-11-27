"use client";

import { useEffect, useRef, useState } from "react";

export type MenuItem =
  | { label: string; onSelect: () => void; danger?: boolean; separatorBefore?: boolean }
  | { heading: string; separatorBefore?: boolean };

/** "⋯" button with a small dropdown of row actions. */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="btn-tertiary btn-icon btn-sm text-secondary"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
          <circle cx="4" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="16" cy="10" r="1.6" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="overlay overlay-content absolute right-0 z-20 mt-1 w-56">
          {items.map((item) => (
            <div key={"heading" in item ? `h:${item.heading}` : item.label}>
            {item.separatorBefore && <hr className="my-1 border-contrast-10" />}
            {"heading" in item ? (
              <p className="px-[calc(var(--lumo-space-m)+var(--lumo-border-radius-m)/4)] pb-1 pt-2 text-xs font-medium text-tertiary">
                {item.heading}
              </p>
            ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`menu-item ${item.danger ? "menu-item-error" : ""}`}
            >
              {item.label}
            </button>
            )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
