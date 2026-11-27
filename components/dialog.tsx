"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** Lumo-style modal dialog rendered in <body>: title, content, optional footer. */
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
  useEffect(() => ref.current?.showModal(), []);
  return createPortal(
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={`dialog m-auto w-full p-0 ${size === "lg" ? "max-w-2xl" : "max-w-lg"}`}
    >
      <header className="dialog-header">
        <h2 className="dialog-title">{title}</h2>
      </header>
      <div className="dialog-content">{children}</div>
      {footer && <footer className="dialog-footer">{footer}</footer>}
    </dialog>,
    document.body,
  );
}
