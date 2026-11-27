"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addFppDocuments, addFppManufacturer, createFpp, deleteFpp, removeFppManufacturer, updateFpp, type Result,
} from "@/app/exporter/actions";
import { Dialog } from "@/components/dialog";
import { RowMenu } from "@/components/manufacturer/row-menu";
import { FPP_ROLES, type FppRole, type SharedDoc } from "@/lib/exporter/shared";

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, onOk: (r: Result & { ok: true }) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) onOk(r);
      else setError(r.message);
    });
  return { error, pending, run };
}

const ErrorNote = ({ error }: { error: string | null }) =>
  error ? <p role="alert" className="notice notice-error mt-4">{error}</p> : null;

/* ------------------------------------------------------------ Product create / edit */

function FppForm({
  initial,
  submitLabel,
  onSubmit,
  onClose,
  pending,
  error,
}: {
  initial?: { name: string; details: string | null };
  submitLabel: string;
  onSubmit: (name: string, details: string) => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <form
      action={(fd) => onSubmit(String(fd.get("name") ?? ""), String(fd.get("details") ?? ""))}
      className="flex flex-col gap-4"
    >
      <label className="field-label">
        Product name
        <input name="name" required maxLength={200} defaultValue={initial?.name} data-autofocus placeholder="Paracetamol 500 mg Tablets" className="text-field" />
      </label>
      <label className="field-label">
        Details <span className="font-normal text-tertiary">(optional)</span>
        <input name="details" maxLength={500} defaultValue={initial?.details ?? ""} placeholder="e.g. Target market, pack size, registration number" className="text-field" />
      </label>
      <ErrorNote error={error} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-tertiary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}

export function NewFppButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { error, pending, run } = useAction();
  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>New product</button>
      {open && (
        <Dialog title="New product" onClose={() => setOpen(false)}>
          <p className="mb-4 text-secondary">
            Create a finished pharmaceutical product (FPP), then add the manufacturers behind it and their documents.
          </p>
          <FppForm
            submitLabel="Create product"
            pending={pending}
            error={error}
            onClose={() => setOpen(false)}
            onSubmit={(name, details) => run(() => createFpp(name, details), (r) => router.push(`/exporter/fpps/${r.id}`))}
          />
        </Dialog>
      )}
    </>
  );
}

export function FppMenu({ fpp }: { fpp: { id: string; name: string; details: string | null } }) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const router = useRouter();
  const { error, pending, run } = useAction();
  return (
    <>
      <RowMenu
        label={`Actions for ${fpp.name}`}
        items={[
          { label: "Edit details", onSelect: () => setMode("edit") },
          { label: "Delete product", danger: true, separatorBefore: true, onSelect: () => setMode("delete") },
        ]}
      />
      {mode === "edit" && (
        <Dialog title="Edit product" onClose={() => setMode(null)}>
          <FppForm
            initial={fpp}
            submitLabel="Save"
            pending={pending}
            error={error}
            onClose={() => setMode(null)}
            onSubmit={(name, details) => run(() => updateFpp(fpp.id, name, details), () => setMode(null))}
          />
        </Dialog>
      )}
      {mode === "delete" && (
        <Dialog
          title="Delete product?"
          onClose={() => setMode(null)}
          footer={
            <>
              <button type="button" className="btn-tertiary" onClick={() => setMode(null)} data-autofocus>Cancel</button>
              <button
                type="button"
                className="btn-error-primary"
                disabled={pending}
                onClick={() => run(() => deleteFpp(fpp.id), () => router.push("/exporter"))}
              >
                {pending ? "Deleting…" : "Delete product"}
              </button>
            </>
          }
        >
          <p className="text-body">
            This removes the product “{fpp.name}” and its grouping. The documents stay available under Shared with me.
          </p>
          <ErrorNote error={error} />
        </Dialog>
      )}
    </>
  );
}

/* --------------------------------------------------------- Manufacturers in product */

function RoleSelect({ defaultValue }: { defaultValue?: FppRole | null }) {
  return (
    <label className="field-label">
      Role <span className="font-normal text-tertiary">(optional)</span>
      <select name="role" defaultValue={defaultValue ?? ""} className="text-field">
        <option value="">Not specified</option>
        {FPP_ROLES.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
    </label>
  );
}

export function AddManufacturerButton({
  fppId,
  options,
  variant = "primary",
}: {
  fppId: string;
  options: { org_id: string; name: string }[];
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const { error, pending, run } = useAction();
  return (
    <>
      <button type="button" className={variant === "primary" ? "btn-primary" : "btn"} onClick={() => setOpen(true)}>
        Add manufacturer
      </button>
      {open && (
        <Dialog title="Add manufacturer" onClose={() => setOpen(false)}>
          {options.length === 0 ? (
            <p className="text-secondary">
              All manufacturers who have added you are already in this product. Manufacturers appear here once they invite you.
            </p>
          ) : (
            <form
              className="flex flex-col gap-4"
              action={(fd) =>
                run(
                  () => addFppManufacturer(fppId, String(fd.get("manufacturer")), String(fd.get("role") ?? "")),
                  () => setOpen(false),
                )
              }
            >
              <label className="field-label">
                Manufacturer
                <select name="manufacturer" required className="text-field">
                  {options.map((o) => (
                    <option key={o.org_id} value={o.org_id}>{o.name}</option>
                  ))}
                </select>
              </label>
              <RoleSelect />
              <ErrorNote error={error} />
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-tertiary" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Adding…" : "Add manufacturer"}</button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}

export function ManufacturerMenu({
  fppId,
  manufacturer,
}: {
  fppId: string;
  manufacturer: { id: string; name: string; role: FppRole | null; docCount: number };
}) {
  const [mode, setMode] = useState<"role" | "remove" | null>(null);
  const { error, pending, run } = useAction();
  return (
    <>
      <RowMenu
        label={`Actions for ${manufacturer.name}`}
        items={[
          { label: "Change role", onSelect: () => setMode("role") },
          { label: "Remove from product", danger: true, separatorBefore: true, onSelect: () => setMode("remove") },
        ]}
      />
      {mode === "role" && (
        <Dialog title={`Role of ${manufacturer.name}`} onClose={() => setMode(null)}>
          <form
            className="flex flex-col gap-4"
            action={(fd) =>
              run(() => addFppManufacturer(fppId, manufacturer.id, String(fd.get("role") ?? "")), () => setMode(null))
            }
          >
            <RoleSelect defaultValue={manufacturer.role} />
            <ErrorNote error={error} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-tertiary" onClick={() => setMode(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={pending}>Save</button>
            </div>
          </form>
        </Dialog>
      )}
      {mode === "remove" && (
        <Dialog
          title="Remove manufacturer?"
          onClose={() => setMode(null)}
          footer={
            <>
              <button type="button" className="btn-tertiary" onClick={() => setMode(null)} data-autofocus>Cancel</button>
              <button
                type="button"
                className="btn-error-primary"
                disabled={pending}
                onClick={() => run(() => removeFppManufacturer(fppId, manufacturer.id), () => setMode(null))}
              >
                Remove
              </button>
            </>
          }
        >
          <p className="text-body">
            {manufacturer.name}
            {manufacturer.docCount > 0
              ? ` and its ${manufacturer.docCount} document${manufacturer.docCount === 1 ? "" : "s"} will be removed from this product.`
              : " will be removed from this product."}{" "}
            The documents stay available under Shared with me.
          </p>
          <ErrorNote error={error} />
        </Dialog>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ Add documents */

export function AddDocumentsButton({
  fppId,
  manufacturerName,
  available,
}: {
  fppId: string;
  manufacturerName: string;
  /** This manufacturer's shared documents not yet in the product (live ones only). */
  available: SharedDoc[];
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { error, pending, run } = useAction();
  const close = () => {
    setOpen(false);
    setPicked(new Set());
  };
  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>Add documents</button>
      {open && (
        <Dialog
          title={`Add documents from ${manufacturerName}`}
          size="lg"
          onClose={close}
          footer={
            <>
              <button type="button" className="btn-tertiary" onClick={close}>Cancel</button>
              <button
                type="button"
                className="btn-primary"
                disabled={pending || picked.size === 0}
                onClick={() => run(() => addFppDocuments(fppId, [...picked]), close)}
              >
                {picked.size ? `Add ${picked.size} document${picked.size === 1 ? "" : "s"}` : "Add documents"}
              </button>
            </>
          }
        >
          {available.length === 0 ? (
            <p className="text-secondary">
              Nothing more to add. Every document {manufacturerName} has shared with you is already in this product.
            </p>
          ) : (
            <div className="data-grid data-grid-compact">
              <table>
                <thead>
                  <tr>
                    <th className="w-10">
                      <input
                        type="checkbox"
                        className="checkbox"
                        aria-label="Select all"
                        checked={picked.size === available.length}
                        onChange={(e) => setPicked(e.target.checked ? new Set(available.map((d) => d.share_id)) : new Set())}
                      />
                    </th>
                    <th>Document</th>
                    <th>Version</th>
                  </tr>
                </thead>
                <tbody>
                  {available.map((d) => (
                    <tr key={d.share_id} aria-selected={picked.has(d.share_id)}>
                      <td>
                        <input
                          type="checkbox"
                          className="checkbox"
                          aria-label={`Select ${d.file_name}`}
                          checked={picked.has(d.share_id)}
                          onChange={(e) =>
                            setPicked((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(d.share_id);
                              else next.delete(d.share_id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="max-w-0 w-[80%]">
                        <span className="block truncate font-medium text-header" title={d.file_name}>{d.file_name}</span>
                        <span className="block truncate text-[0.8125rem] text-secondary">{d.folder_path || "Documents"}</span>
                      </td>
                      <td className="text-secondary">v{d.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ErrorNote error={error} />
        </Dialog>
      )}
    </>
  );
}
