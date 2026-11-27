"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  hidePanel, installFocusgroupFallback, installPopoverFallback, positionFallback, wireTrigger,
} from "@/components/popover-support";

export type MenuItem =
  | { label: string; onSelect: () => void; danger?: boolean; separatorBefore?: boolean }
  | { heading: string; separatorBefore?: boolean };

/**
 * "⋯" action menu (modern-web-guidance `menu`): a command invoker toggles a `popover="auto"`
 * placed right after it; items live in a `focusgroup="menu"` (arrow keys, Home/End); the panel
 * is anchored with CSS anchor positioning and sits in the top layer, so tables can't clip it.
 */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const id = useId();
  const triggerId = `${id}-trigger`;
  const menuId = `${id}-menu`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const enterOnOpen = useRef(false);
  const [open, setOpen] = useState(false);

  const firstItem = () => menuRef.current?.querySelector<HTMLButtonElement>("[focusgroup] > button:not(:disabled)");

  useEffect(() => {
    const trigger = triggerRef.current!;
    const menu = menuRef.current!;
    wireTrigger(trigger, menuId);
    installFocusgroupFallback(menu.querySelector<HTMLElement>("[focusgroup]"));

    const onOpenChange = (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        positionFallback(trigger, menu);
        // Keyboard opens enter the menu; pointer opens keep focus on the trigger.
        if (enterOnOpen.current) firstItem()?.focus();
        document.addEventListener("focusin", onFocusIn);
      } else {
        document.removeEventListener("focusin", onFocusIn);
      }
      enterOnOpen.current = false;
    };
    // Close when focus moves outside the menu system (e.g. Tab).
    const onFocusIn = (e: FocusEvent) => {
      if (!menu.contains(e.target as Node) && e.target !== trigger) hidePanel(menu);
    };
    const onToggle = (e: Event) => onOpenChange((e as ToggleEvent).newState === "open");
    menu.addEventListener("toggle", onToggle);
    const cleanupFallback = installPopoverFallback(trigger, menu, onOpenChange);
    return () => {
      menu.removeEventListener("toggle", onToggle);
      document.removeEventListener("focusin", onFocusIn);
      cleanupFallback();
    };
  }, [menuId]);

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") enterOnOpen.current = true; // native click toggles
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (open) firstItem()?.focus();
      else {
        enterOnOpen.current = true;
        triggerRef.current?.click();
      }
    }
  }

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Tab leaves the menu system: close it and put focus back on the trigger (never on hidden
    // content or <body>); the next Tab continues from there.
    if (e.key === "Tab") {
      e.preventDefault();
      hidePanel(menuRef.current!);
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== "Home" && e.key !== "End") return;
    const list = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[focusgroup] > button:not(:disabled)") ?? [])];
    e.preventDefault();
    (e.key === "Home" ? list[0] : list.at(-1))?.focus();
  }

  function activate(item: Extract<MenuItem, { label: string }>, fromPointer: boolean) {
    hidePanel(menuRef.current!);
    triggerRef.current?.focus({ focusVisible: !fromPointer } as FocusOptions);
    item.onSelect();
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={onTriggerKeyDown}
        className="btn-tertiary btn-icon btn-sm text-secondary aria-expanded:bg-contrast-10"
        {...({ commandfor: menuId, command: "toggle-popover" } as Record<string, string>)}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
          <circle cx="4" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="16" cy="10" r="1.6" />
        </svg>
      </button>
      {/* Immediately after its trigger (no implicit aria-details); popover="auto" gives light dismiss + Esc. */}
      <div ref={menuRef} id={menuId} popover="auto" className="overlay popover-panel w-56 text-left">
        <div
          aria-labelledby={triggerId}
          onKeyDown={onMenuKeyDown}
          className="overlay-content"
          {...({ focusgroup: "menu nomemory" } as Record<string, string>)}
        >
          {items.map((item) => {
            const key = "heading" in item ? `h:${item.heading}` : item.label;
            return [
              item.separatorBefore ? <hr key={`${key}-sep`} className="my-1 border-contrast-10" /> : null,
              "heading" in item ? (
                <p key={key} className="px-[calc(var(--lumo-space-m)+var(--lumo-border-radius-m)/4)] pb-1 pt-2 text-xs font-medium text-tertiary">
                  {item.heading}
                </p>
              ) : (
                <button
                  key={key}
                  type="button"
                  className={`menu-item ${item.danger ? "menu-item-error" : ""}`}
                  onPointerMove={(e) => e.currentTarget !== document.activeElement && e.currentTarget.focus({ preventScroll: true })}
                  onClick={(e) => activate(item, e.detail > 0)}
                >
                  {item.label}
                </button>
              ),
            ];
          })}
        </div>
      </div>
    </>
  );
}
