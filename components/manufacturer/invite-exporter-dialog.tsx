"use client";

import { useState } from "react";
import { inviteExporter } from "@/app/actions";
import { Dialog } from "@/components/dialog";
import { InviteForm } from "@/components/invite-form";

export function InviteExporterButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={variant === "primary" ? "btn-primary" : "btn"} onClick={() => setOpen(true)}>
        Invite exporter
      </button>
      {open && (
        <Dialog
          title="Invite an exporter"
          onClose={() => setOpen(false)}
          footer={
            <button type="button" className="btn-tertiary" onClick={() => setOpen(false)}>
              Close
            </button>
          }
        >
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
        </Dialog>
      )}
    </>
  );
}
