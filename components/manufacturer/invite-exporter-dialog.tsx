"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inviteExporter } from "@/app/actions";
import { InviteForm } from "@/components/invite-form";

export function InviteExporterButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={variant === "primary" ? "btn-primary" : "btn"} onClick={() => setOpen(true)}>
        Invite exporter
      </button>
      {open && <InviteExporterDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function InviteExporterDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);

  return createPortal(
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="dialog m-auto w-full max-w-lg p-0"
      aria-labelledby="invite-exporter-title"
    >
      <header className="dialog-header">
        <h2 id="invite-exporter-title" className="dialog-title">Invite an exporter</h2>
      </header>
      <div className="dialog-content">
        <p className="mb-4 text-secondary">
          They&apos;ll sign in with Google using this email. Only exporters you invite can receive your documents.
        </p>
        <InviteForm
          action={inviteExporter}
          submitLabel="Send invite"
          stacked
          fields={[
            { name: "company", label: "Exporter company", type: "text", placeholder: "Globex Exports" },
            { name: "email", label: "POC email", type: "email", placeholder: "docs@globexexports.com" },
          ]}
        />
      </div>
      <footer className="dialog-footer">
        <button type="button" className="btn-tertiary" onClick={onClose}>Close</button>
      </footer>
    </dialog>,
    document.body,
  );
}
