import Link from "next/link";

/** Building blocks for the Overview pages: key-figure tiles, titled panels and the attention list. */

export function Kpi({
  label,
  value,
  note,
  tone,
  href,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: "warning";
  href?: string;
}) {
  const warn = tone === "warning";
  const body = (
    <>
      <span className={`text-[0.8125rem] font-medium ${warn ? "text-warning-text" : "text-secondary"}`}>{label}</span>
      <span className={`text-[1.75rem] font-semibold leading-tight tabular-nums ${warn ? "text-warning-text" : "text-header"}`}>{value}</span>
      {note && <span className="text-[0.8125rem] text-secondary">{note}</span>}
    </>
  );
  const cls = `card flex flex-col gap-1.5 px-5 py-4 ${warn ? "!shadow-[0_0_0_1px_hsla(40,100%,40%,0.45)] bg-warning-10/30" : ""}`;
  return href ? (
    <Link href={href} className={`${cls} transition-shadow hover:!shadow-[0_0_0_1px_var(--lumo-primary-color-50pct)] focus-visible:outline-2 focus-visible:outline-primary-50`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Panel({
  title,
  aside,
  className = "",
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`card overflow-hidden ${className}`} aria-label={title}>
      <div className="flex items-center justify-between gap-3 border-b border-contrast-10 px-5 py-3.5">
        <h2 className="text-base font-semibold text-header">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export type AttentionItem = {
  key: string;
  badge: string;
  tone: "error" | "warning" | "contrast" | "info";
  title: string;
  detail?: string;
  action?: { label: string; href: string };
};

const TONE: Record<AttentionItem["tone"], string> = {
  error: "badge-error",
  warning: "badge-warning",
  contrast: "badge-contrast",
  info: "",
};

export function Attention({ items, empty }: { items: AttentionItem[]; empty: string }) {
  if (items.length === 0) return <p className="px-5 py-8 text-center text-sm text-secondary">{empty}</p>;
  return (
    <ul>
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-4 border-t border-contrast-10 px-5 py-3 first:border-t-0">
          <span className={`badge badge-sm w-24 shrink-0 justify-center ${TONE[i.tone]}`}>{i.badge}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-header" title={i.title}>{i.title}</span>
            {i.detail && <span className="block truncate text-[0.8125rem] text-secondary">{i.detail}</span>}
          </span>
          {i.action && (
            <Link href={i.action.href} className="btn-tertiary btn-sm shrink-0">
              {i.action.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
