"use client";

import { useActionState, useState } from "react";
import type { InviteResult } from "@/app/actions";
import type { EmailStatus } from "@/lib/email/send-invite";

type Field =
  | { name: string; label: string; type: "text" | "email"; placeholder?: string }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[] };

export function InviteForm({
  action,
  fields,
  submitLabel,
  stacked = false,
}: {
  action: (prev: InviteResult | null, formData: FormData) => Promise<InviteResult>;
  fields: Field[];
  submitLabel: string;
  /** Fields above each other (e.g. in a dialog) instead of in one row. */
  stacked?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const values = state && !state.ok ? state.values : {};

  return (
    <div>
      {/* Re-mount inputs per result so failed submissions keep what was typed. */}
      <form
        key={JSON.stringify(state)}
        action={formAction}
        className={stacked ? "flex flex-col gap-4" : "flex flex-col gap-3 sm:flex-row sm:items-end"}
      >
        {fields.map((f) => (
          <label key={f.name} className="field-label flex-1">
            {f.label}
            {f.type === "select" ? (
              <select
                name={f.name}
                defaultValue={values[f.name] ?? f.options[0]?.value}
                className="text-field"
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={f.name}
                type={f.type}
                required
                defaultValue={values[f.name]}
                placeholder={f.placeholder}
                autoComplete="off"
                className="text-field"
              />
            )}
          </label>
        ))}
        <button
          type="submit"
          disabled={pending}
          className={stacked ? "btn-primary self-end" : "btn-primary shrink-0"}
        >
          {pending ? "Sending…" : submitLabel}
        </button>
      </form>

      {state && !state.ok && (
        <p role="alert" className="notice notice-error mt-3">
          {state.message}
        </p>
      )}
      {state?.ok && state.kind === "linked" && (
        <p role="status" className={`notice mt-3 ${state.emailStatus.sent ? "notice-success" : "notice-warning"}`}>
          {state.orgName} is already on CuraLex and has been added to your exporters.{" "}
          {state.emailStatus.sent
            ? `We've emailed ${state.email} to let them know.`
            : `The notification email couldn't be sent (${state.emailStatus.error}).`}
        </p>
      )}
      {state?.ok && state.kind === "invited" && (
        <InvitedNotice email={state.email} loginPath={state.loginPath} emailStatus={state.emailStatus} />
      )}
    </div>
  );
}

function InvitedNotice({ email, loginPath, emailStatus }: { email: string; loginPath: string; emailStatus: EmailStatus }) {
  const [copied, setCopied] = useState(false);
  // Only rendered after a client-side submit, so `window` is always available.
  const loginUrl = typeof window === "undefined" ? loginPath : `${window.location.origin}${loginPath}`;

  return (
    <div role="status" className={`notice mt-3 flex-col ${emailStatus.sent ? "notice-success" : "notice-warning"}`}>
      {emailStatus.sent ? (
        <p>
          Invitation emailed to <strong>{email}</strong>. They sign in with Google using that address. You can also
          share the link yourself:
        </p>
      ) : (
        <p>
          Invitation created for <strong>{email}</strong>, but the email couldn&apos;t be sent ({emailStatus.error}).
          Send them this link and ask them to sign in with Google using that email:
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lumo-s bg-base px-2 py-1.5 text-xs text-body">{loginUrl}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(loginUrl);
            setCopied(true);
          }}
          className="btn btn-sm bg-base"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
