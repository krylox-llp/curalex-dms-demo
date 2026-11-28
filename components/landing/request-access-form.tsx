"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { requestAccess, type RequestAccessState } from "@/app/request-access/actions";

const TYPES = [
  { value: "manufacturer", label: "Manufacturer", hint: "We make finished products, APIs or excipients" },
  { value: "exporter", label: "Exporter", hint: "We export products made by manufacturers" },
  { value: "other", label: "Other", hint: "Consultant, importer, regulator…" },
];

/**
 * "Request access" form (modern-web-guidance `forms`): visible labels, required marked in text,
 * autocomplete hints, radios for the 3-way choice, errors only after interaction (:user-invalid),
 * a honeypot hidden from assistive tech, and the outcome announced in a status region.
 */
export function RequestAccessForm() {
  const id = useId();
  const [state, action, pending] = useActionState<RequestAccessState, FormData>(requestAccess, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const v = state.status === "error" ? state.values : undefined;

  // Server-side error on a specific field: move focus there.
  useEffect(() => {
    if (state.status === "error" && state.field) {
      formRef.current?.querySelector<HTMLElement>(`[name="${state.field}"]`)?.focus();
    }
  }, [state]);

  if (state.status === "sent") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-lumo-l bg-success-10 px-6 py-10 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-success text-white" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="size-6"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <p className="text-lg font-semibold text-header">Thank you{state.name ? `, ${state.name.split(" ")[0]}` : ""}.</p>
        <p className="max-w-sm text-[0.9375rem] text-body">
          We&apos;ve received your request and will get back to you within one working day to set up your workspace.
        </p>
      </div>
    );
  }

  const field = "flex flex-col gap-1.5";
  const label = "text-sm font-medium text-header";
  const req = <span className="font-normal text-secondary"> (required)</span>;
  const errorFor = (name: string) => state.status === "error" && state.field === name;

  return (
    <form ref={formRef} action={action} aria-labelledby={`${id}-title`} className="flex flex-col gap-5" noValidate={false}>
      <h3 id={`${id}-title`} className="sr-only">Request access</h3>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className={field}>
          <label htmlFor={`${id}-name`} className={label}>Your name{req}</label>
          <input id={`${id}-name`} name="name" required maxLength={100} autoComplete="name" enterKeyHint="next"
            defaultValue={v?.name} aria-invalid={errorFor("name") || undefined} className="landing-input" />
        </div>
        <div className={field}>
          <label htmlFor={`${id}-email`} className={label}>Work email{req}</label>
          <input id={`${id}-email`} name="email" type="email" required maxLength={254} autoComplete="email"
            autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" defaultValue={v?.email}
            aria-describedby={`${id}-email-hint`} aria-invalid={errorFor("email") || undefined} className="landing-input" />
          <span id={`${id}-email-hint`} className="text-xs text-secondary">We&apos;ll send your invitation here. It must be a Google account.</span>
        </div>
        <div className={field}>
          <label htmlFor={`${id}-company`} className={label}>Company{req}</label>
          <input id={`${id}-company`} name="company" required maxLength={200} autoComplete="organization" enterKeyHint="next"
            defaultValue={v?.company} aria-invalid={errorFor("company") || undefined} className="landing-input" />
        </div>
        <div className={field}>
          <label htmlFor={`${id}-phone`} className={label}>Phone <span className="font-normal text-secondary">(optional)</span></label>
          <input id={`${id}-phone`} name="phone" type="tel" maxLength={30} autoComplete="tel" enterKeyHint="next"
            defaultValue={v?.phone} className="landing-input" />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2" aria-invalid={errorFor("company_type") || undefined}>
        <legend className={`${label} mb-2`}>Your company is{req}</legend>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {TYPES.map((t) => (
            <label key={t.value} className="landing-choice">
              <input type="radio" name="company_type" value={t.value} required defaultChecked={v?.company_type === t.value} className="mt-0.5 size-4 shrink-0 accent-[var(--lumo-primary-color)]" />
              <span>
                <span className="block text-sm font-medium text-header">{t.label}</span>
                <span className="block text-xs text-secondary">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={field}>
        <label htmlFor={`${id}-message`} className={label}>What would you like to manage? <span className="font-normal text-secondary">(optional)</span></label>
        <textarea id={`${id}-message`} name="message" rows={4} maxLength={2000} defaultValue={v?.message}
          placeholder="e.g. We share CoAs and CoPPs with 6 exporters for Africa and South-East Asia."
          className="landing-input min-h-28 resize-y" />
      </div>

      {/* Honeypot for bots: hidden from people and assistive technology. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div aria-live="polite">
        {state.status === "error" && (
          <p role="alert" className="notice notice-error">
            <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 size-4 shrink-0" aria-hidden="true"><path d="M12 8v5M12 16h.01M12 21a9 9 0 100-18 9 9 0 000 18z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <span><span className="sr-only">Error: </span>{state.message}</span>
          </p>
        )}
      </div>

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-secondary">
          We use these details only to contact you about CuraLex - DMS.
        </p>
        <button type="submit" disabled={pending} className="btn-primary h-12 px-6 text-[1rem]">
          {pending ? "Sending…" : "Request access"}
        </button>
      </div>
    </form>
  );
}
