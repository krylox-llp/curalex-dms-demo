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
  /** Colour and icon: error (red), warning (amber), contrast (grey), info (blue). */
  tone: "error" | "warning" | "contrast" | "info";
  /** Icon shape; defaults by tone. */
  kind?: "expiry" | "clock" | "version" | "info";
  /** Main line, usually the file name. Wraps instead of being cut off. */
  title: string;
  /** Short status shown as a badge under the title, e.g. "Expires in 11 days". */
  badge: string;
  /** Supporting facts after the badge, e.g. "9 Dec 2026 · Paracetamol 500 mg". */
  detail?: string;
  action?: { label: string; href: string };
};

const TONE: Record<AttentionItem["tone"], { icon: string; badge: string }> = {
  error: { icon: "bg-error-10 text-error-text", badge: "badge-error" },
  warning: { icon: "bg-warning-10 text-warning-text", badge: "badge-warning" },
  contrast: { icon: "bg-contrast-5 text-body", badge: "badge-contrast" },
  info: { icon: "bg-primary-10 text-primary-text", badge: "" },
};

const KIND_BY_TONE: Record<AttentionItem["tone"], NonNullable<AttentionItem["kind"]>> = {
  error: "expiry",
  warning: "clock",
  contrast: "version",
  info: "info",
};

const ICON_PATHS: Record<NonNullable<AttentionItem["kind"]>, string> = {
  expiry: "M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM12 13v3",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  version: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01",
};

export function Attention({ items, empty }: { items: AttentionItem[]; empty: string }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-success-10 text-success-text" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="size-5"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <p className="text-sm font-medium text-header">All clear</p>
        <p className="max-w-sm text-[0.8125rem] text-secondary">{empty}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-contrast-10">
      {items.map((i) => {
        const tone = TONE[i.tone];
        return (
          <li key={i.key} className="flex items-start gap-3.5 px-5 py-4">
            <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lumo-l ${tone.icon}`} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" className="size-[1.125rem]">
                <path d={ICON_PATHS[i.kind ?? KIND_BY_TONE[i.tone]]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-[0.9375rem] font-medium leading-snug text-header">{i.title}</p>
              <span className={`badge badge-sm mt-1.5 ${tone.badge}`}>{i.badge}</span>
              {i.detail && <p className="mt-1.5 text-[0.8125rem] leading-snug text-secondary">{i.detail}</p>}
            </div>
            {i.action && (
              <Link href={i.action.href} className="btn-secondary btn-sm mt-0.5 shrink-0">
                {i.action.label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export type ActivityItem = {
  id: string | number;
  action: "view" | "download";
  /** Who did it (email or name). */
  actor: string;
  company: string;
  companyId: string;
  /** What they opened, e.g. "CoA - Paracetamol.pdf v2". */
  target: string;
  href?: string;
  at: string;
};

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const dayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const timeLabel = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

/**
 * Exporter views and downloads grouped by day (India time). `today` is YYYY-MM-DD in India.
 * Each entry reads as an action ("Downloaded CoA… v2") with who and when underneath.
 */
export function ActivityFeed({
  items,
  today,
  avatar,
}: {
  items: ActivityItem[];
  today: string;
  /** Renders the company avatar (initials and colour) for an item. */
  avatar: (item: ActivityItem) => React.ReactNode;
}) {
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const groups: { label: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const key = dayKey.format(new Date(item.at));
    const label = key === today ? "Today" : key === yesterday ? "Yesterday" : dayLabel.format(new Date(item.at));
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div className="pb-2">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="bg-contrast-5/60 px-5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-secondary">{g.label}</h3>
          <ol className="divide-y divide-contrast-10">
            {g.items.map((item) => (
              <li key={item.id} className="flex items-start gap-3.5 px-5 py-3.5">
                <span className="relative mt-0.5 shrink-0">
                  {avatar(item)}
                  <span
                    className={`absolute -bottom-1 -right-1 grid size-[1.125rem] place-items-center rounded-full border-2 border-base ${
                      item.action === "download" ? "bg-primary text-white" : "bg-contrast-60 text-white"
                    }`}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="size-2.5">
                      <path
                        d={item.action === "download" ? "M12 4v12M6 11l6 6 6-6" : "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z"}
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[0.9375rem] leading-snug text-body">
                    <span className="text-secondary">{item.action === "download" ? "Downloaded" : "Viewed"} </span>
                    {item.href ? (
                      <Link href={item.href} className="font-medium text-header hover:text-primary-text hover:underline">{item.target}</Link>
                    ) : (
                      <span className="font-medium text-header">{item.target}</span>
                    )}
                  </p>
                  <p className="mt-1 truncate text-[0.8125rem] text-secondary" title={`${item.actor} · ${item.company}`}>
                    {item.actor} <span aria-hidden="true">·</span> {item.company}
                  </p>
                </div>
                <time dateTime={item.at} className="mt-0.5 shrink-0 text-[0.8125rem] tabular-nums text-secondary">
                  {timeLabel.format(new Date(item.at))}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
