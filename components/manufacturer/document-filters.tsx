"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { DOC_TYPES } from "@/lib/documents-shared";

export const EXPIRY_FILTERS = [
  { value: "expired", label: "Expired" },
  { value: "30", label: "Expiring ≤ 30 days" },
  { value: "90", label: "Expiring ≤ 90 days" },
  { value: "none", label: "No expiry date" },
] as const;

/**
 * Filter toolbar for Documents. Any filter searches every folder; clearing returns to the folder view.
 * Filters live in the URL so a filtered list can be bookmarked or shared with a colleague.
 */
export function DocumentFilters({ products, resultCount }: { products: string[]; resultCount: number | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("doc");
    if (["q", "type", "product", "expiry"].some((k) => next.get(k))) next.delete("folder");
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };
  const active = ["q", "type", "product", "expiry"].some((k) => params.get(k));

  return (
    <form
      role="search"
      aria-label="Filter documents"
      aria-busy={pending}
      className="mb-4 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        set("q", String(new FormData(e.currentTarget).get("q") ?? "").trim());
      }}
    >
      <label className="relative">
        <span className="sr-only">Filter by name, product or reference number</span>
        <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-secondary" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          key={params.get("q") ?? ""}
          type="search"
          name="q"
          defaultValue={params.get("q") ?? ""}
          placeholder="Name, product, reference no."
          maxLength={100}
          onChange={(e) => e.currentTarget.value === "" && params.get("q") && set("q", "")}
          className="text-field text-field-sm w-60 pl-8"
        />
      </label>
      <Select label="Type" value={params.get("type") ?? ""} onChange={(v) => set("type", v)} options={DOC_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
      <Select label="Product" value={params.get("product") ?? ""} onChange={(v) => set("product", v)} options={products.map((p) => ({ value: p, label: p }))} />
      <Select label="Expiry" value={params.get("expiry") ?? ""} onChange={(v) => set("expiry", v)} options={EXPIRY_FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
      {active && (
        <>
          <button
            type="button"
            className="btn-tertiary btn-sm"
            onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
          >
            Clear filters
          </button>
          {resultCount !== null && (
            <span role="status" className="ml-auto text-sm text-secondary">
              {resultCount} document{resultCount === 1 ? "" : "s"} across all folders
            </span>
          )}
        </>
      )}
    </form>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`text-field text-field-sm max-w-56 ${value ? "font-medium text-primary-text" : ""}`}
      >
        <option value="">{label}: All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
