"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Lumo-style modal dialog (modern-web-guidance `dialog`): native <dialog> opened with showModal(),
 * named by its heading, `closedby="any"` for Esc + click-outside (with a fallback where closedby
 * is unsupported), and initial focus on the element marked `data-autofocus` (e.g. Cancel in a
 * destructive confirmation). The browser handles focus containment and returns focus on close.
 */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    // Light dismiss where `closedby` isn't supported: press and release outside the dialog box.
    if ("closedBy" in HTMLDialogElement.prototype) return;
    const outside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    const down = (e: PointerEvent) => (pressedOutside = outside(e));
    const up = (e: PointerEvent) => {
      if (pressedOutside && outside(e)) dialog.close();
    };
    dialog.addEventListener("pointerdown", down);
    dialog.addEventListener("pointerup", up);
    return () => {
      dialog.removeEventListener("pointerdown", down);
      dialog.removeEventListener("pointerup", up);
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className={`dialog m-auto w-full p-0 ${size === "lg" ? "max-w-2xl" : "max-w-lg"}`}
      {...({ closedby: "any" } as Record<string, string>)}
    >
      <header className="dialog-header">
        <h1 id={titleId} className="dialog-title">{title}</h1>
      </header>
      <div className="dialog-content">{children}</div>
      {footer && <footer className="dialog-footer">{footer}</footer>}
    </dialog>,
    document.body,
  );
}
