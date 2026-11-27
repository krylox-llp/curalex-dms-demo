"use client";

import { useId, useState, useTransition } from "react";
import { setDocumentDetails } from "@/app/manufacturer/actions";
import { Dialog } from "@/components/dialog";
import { DOC_TYPES, type DocDetails, type DocType } from "@/lib/documents-shared";

/** Edit a document's details: type, product, market, issuer, reference number and dates. */
export function DetailsDialog({
  documentId,
  name,
  details,
  products,
  onClose,
}: {
  documentId: string;
  name: string;
  details: DocDetails;
  /** Product names already used, offered as suggestions. */
  products: string[];
  onClose: () => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formId = `${id}-form`;

  const submit = (fd: FormData) => {
    const text = (k: string) => String(fd.get(k) ?? "").trim() || null;
    const next: DocDetails = {
      doc_type: (text("doc_type") as DocType | null) ?? null,
      product: text("product"),
      market: text("market"),
      issued_by: text("issued_by"),
      reference_no: text("reference_no"),
      issue_date: text("issue_date"),
      expiry_date: text("expiry_date"),
    };
    if (next.issue_date && next.expiry_date && next.issue_date > next.expiry_date) {
      setError("The expiry date must be on or after the issue date.");
      return;
    }
    startTransition(async () => {
      const res = await setDocumentDetails(documentId, next);
      if (res.ok) onClose();
      else setError(res.message);
    });
  };

  const field = "flex flex-col gap-1";
  return (
    <Dialog
      title="Edit details"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-tertiary" onClick={onClose}>Cancel</button>
          <button type="submit" form={formId} className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save details"}
          </button>
        </>
      }
    >
      <p className="-mt-1 mb-4 truncate text-sm text-secondary" title={name}>{name}</p>
      <form id={formId} action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={field}>
          <span className="field-label">Document type</span>
          <select name="doc_type" defaultValue={details.doc_type ?? ""} className="text-field" data-autofocus>
            <option value="">Not set</option>
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className={field}>
          <span className="field-label">Product</span>
          <input name="product" defaultValue={details.product ?? ""} maxLength={200} list={`${id}-products`} placeholder="e.g. Paracetamol 500 mg Tablets" className="text-field" autoComplete="off" />
          <datalist id={`${id}-products`}>
            {products.map((p) => <option key={p} value={p} />)}
          </datalist>
        </label>
        <label className={field}>
          <span className="field-label">Target market</span>
          <input name="market" defaultValue={details.market ?? ""} maxLength={100} placeholder="e.g. Kenya" className="text-field" autoComplete="off" />
        </label>
        <label className={field}>
          <span className="field-label">Issued by</span>
          <input name="issued_by" defaultValue={details.issued_by ?? ""} maxLength={200} placeholder="e.g. CDSCO, New Delhi" className="text-field" autoComplete="off" />
        </label>
        <label className={field}>
          <span className="field-label">Certificate / reference no.</span>
          <input name="reference_no" defaultValue={details.reference_no ?? ""} maxLength={100} className="text-field" autoComplete="off" />
        </label>
        <span className="hidden sm:block" />
        <label className={field}>
          <span className="field-label">Issue date</span>
          <input type="date" name="issue_date" defaultValue={details.issue_date ?? ""} className="text-field" />
        </label>
        <label className={field}>
          <span className="field-label">Expiry date</span>
          <input type="date" name="expiry_date" defaultValue={details.expiry_date ?? ""} className="text-field" />
          <span className="field-helper">Used for expiry warnings on the overview.</span>
        </label>
      </form>
      {error && <p role="alert" className="notice notice-error mt-4">{error}</p>}
    </Dialog>
  );
}
