import type { DocShare } from "@/lib/documents-shared";

const TONES = [
  "bg-success-10 text-success-text",
  "bg-primary-10 text-primary-text",
  "bg-[hsla(280,60%,50%,0.13)] text-[hsl(280,55%,38%)]",
  "bg-warning-10 text-warning-text",
];

export const initialsOf = (name: string) =>
  name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** Stable colour per company, so the same exporter looks the same everywhere. */
export function toneFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

/** Overlapping initials of the exporters a document is currently shared with. */
export function ExporterAvatars({ shares, max = 3 }: { shares: DocShare[]; max?: number }) {
  const exporters = [...new Map(shares.map((s) => [s.exporterId, s.exporterName])).entries()];
  if (exporters.length === 0) return <span className="text-sm text-tertiary">Not shared</span>;
  const names = exporters.map(([, n]) => n).join(", ");
  return (
    <span className="inline-flex items-center" title={`Shared with ${names}`}>
      <span className="sr-only">Shared with {names}</span>
      {exporters.slice(0, max).map(([id, name], i) => (
        <span
          key={id}
          aria-hidden="true"
          className={`grid size-6 place-items-center rounded-full border-2 border-base text-[0.625rem] font-semibold ${toneFor(id)} ${i ? "-ml-1.5" : ""}`}
        >
          {initialsOf(name)}
        </span>
      ))}
      {exporters.length > max && (
        <span aria-hidden="true" className="-ml-1.5 grid size-6 place-items-center rounded-full border-2 border-base bg-contrast-10 text-[0.625rem] font-semibold text-body">
          +{exporters.length - max}
        </span>
      )}
    </span>
  );
}
