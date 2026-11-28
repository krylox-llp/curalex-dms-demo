"use client";

import { useState, useTransition } from "react";
import { setRequestStatus } from "@/app/admin/requests/actions";

const STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "invited", label: "Invited" },
  { value: "declined", label: "Declined" },
] as const;

/** Status picker for one access request (platform admins). */
export function RequestStatus({ id, status, label }: { id: string; status: (typeof STATUSES)[number]["value"]; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <select
        aria-label={`Status of request from ${label}`}
        defaultValue={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as (typeof STATUSES)[number]["value"];
          start(async () => {
            const res = await setRequestStatus(id, next);
            setError(res.ok ? null : res.message);
          });
        }}
        className={`text-field text-field-sm ${status === "new" ? "font-medium text-primary-text" : ""}`}
      >
        {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      {error && <p className="mt-1 text-xs text-error-text">{error}</p>}
    </div>
  );
}
