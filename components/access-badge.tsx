const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const DAY = 86_400_000;

/** "27 Dec 2026  30 days left" with amber when 7 days or fewer remain and red once expired. */
export function AccessUntil({ expiresAt, now }: { expiresAt: string | null; now: number }) {
  if (!expiresAt) return <span className="badge badge-contrast">No expiry</span>;
  const t = new Date(expiresAt).getTime();
  const days = Math.ceil((t - now) / DAY);
  const badge =
    t <= now ? (
      <span className="badge badge-error">Expired</span>
    ) : days <= 7 ? (
      <span className="badge badge-warning">{days} day{days === 1 ? "" : "s"} left</span>
    ) : (
      <span className="badge badge-contrast">{days} days left</span>
    );
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span>{dateFmt.format(t)}</span>
      {badge}
    </span>
  );
}
