"use client";

/**
 * Small helpers for native popovers (menus and account panel), following modern-web-guidance
 * `menu` / `viewport-aware-dropdowns`: Popover API + invoker commands + CSS anchor positioning,
 * with lightweight fallbacks for browsers that lack them (no polyfill dependencies).
 */

export const supportsPopover = () => typeof HTMLElement !== "undefined" && Object.hasOwn(HTMLElement.prototype, "popover");
export const supportsInvokers = () => typeof HTMLButtonElement !== "undefined" && "command" in HTMLButtonElement.prototype;
export const supportsAnchoring = () => typeof CSS !== "undefined" && CSS.supports("position-area: block-end");

/** Without invoker commands, fall back to popovertarget (supported longer). */
export function wireTrigger(trigger: HTMLButtonElement, panelId: string) {
  if (supportsPopover() && !supportsInvokers()) {
    trigger.removeAttribute("commandfor");
    trigger.removeAttribute("command");
    trigger.setAttribute("popovertarget", panelId);
  }
}

/** Without anchor positioning: place the panel below its trigger, right-aligned, flipping up and clamping to the viewport. */
export function positionFallback(trigger: HTMLElement, panel: HTMLElement) {
  if (supportsAnchoring()) return;
  const t = trigger.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const gap = 4;
  let top = t.bottom + gap;
  if (top + p.height > innerHeight - 8) top = Math.max(8, t.top - p.height - gap);
  const left = Math.min(Math.max(8, t.right - p.width), innerWidth - p.width - 8);
  panel.style.position = "fixed";
  panel.style.inset = "auto";
  panel.style.margin = "0";
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

/** Without native focusgroup: arrow keys, Home/End, and menu roles (guide fallback). */
export function installFocusgroupFallback(group: HTMLElement | null) {
  if (!group || "focusGroup" in HTMLElement.prototype || group.dataset.fgFallback) return;
  group.dataset.fgFallback = "1";
  group.setAttribute("role", "menu");
  group.querySelectorAll("button:not([role])").forEach((b) => b.setAttribute("role", "menuitem"));
  group.addEventListener(
    "keydown",
    (event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = [...group.querySelectorAll<HTMLButtonElement>("button")].filter(
        (b) => b.closest("[focusgroup]") === group && !b.disabled,
      );
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      if (current < 0) return;
      const next =
        event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
      event.preventDefault();
      event.stopImmediatePropagation();
      items[next].focus({ preventScroll: true });
    },
    true,
  );
}

/**
 * Last-resort fallback for browsers without the Popover API: toggle a data-open attribute on
 * trigger click and close on outside click / Escape. Returns a cleanup function.
 */
export function installPopoverFallback(trigger: HTMLButtonElement, panel: HTMLElement, onToggle: (open: boolean) => void) {
  if (supportsPopover()) return () => {};
  const set = (open: boolean) => {
    panel.toggleAttribute("data-open", open);
    onToggle(open);
    if (open) positionFallback(trigger, panel);
  };
  const click = () => set(!panel.hasAttribute("data-open"));
  const outside = (e: PointerEvent) => {
    if (!panel.contains(e.target as Node) && !trigger.contains(e.target as Node)) set(false);
  };
  const esc = (e: KeyboardEvent) => {
    if (e.key === "Escape" && panel.hasAttribute("data-open")) {
      set(false);
      trigger.focus();
    }
  };
  trigger.addEventListener("click", click);
  document.addEventListener("pointerdown", outside);
  document.addEventListener("keydown", esc);
  return () => {
    trigger.removeEventListener("click", click);
    document.removeEventListener("pointerdown", outside);
    document.removeEventListener("keydown", esc);
  };
}

export function hidePanel(panel: HTMLElement) {
  if (supportsPopover()) {
    if (panel.matches(":popover-open")) panel.hidePopover();
  } else panel.removeAttribute("data-open");
}
