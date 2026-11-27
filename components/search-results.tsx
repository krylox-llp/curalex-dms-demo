import Link from "next/link";

export type SearchGroup = {
  title: string;
  items: { key: string; href: string; title: string; detail?: string; badge?: string }[];
};

/** Grouped results for the header search. */
export function SearchResults({ query, groups }: { query: string; groups: SearchGroup[] }) {
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <>
      <div className="mb-6">
        <h1 className="text-[1.75rem] font-semibold leading-tight text-header">Search</h1>
        <p role="status" className="mt-1 text-[0.9375rem] text-secondary">
          {query ? `${total} result${total === 1 ? "" : "s"} for “${query}”` : "Type in the search box at the top of the page."}
        </p>
      </div>
      {query && total === 0 && (
        <p className="card px-5 py-10 text-center text-sm text-secondary">Nothing matches. Try part of a file name, product or company name.</p>
      )}
      <div className="flex flex-col gap-5">
        {groups.filter((g) => g.items.length).map((g) => (
          <section key={g.title} className="card overflow-hidden" aria-label={g.title}>
            <h2 className="border-b border-contrast-10 px-5 py-3 text-base font-semibold text-header">
              {g.title} <span className="font-normal text-secondary">({g.items.length})</span>
            </h2>
            <ul>
              {g.items.map((i) => (
                <li key={i.key} className="border-t border-contrast-10 first:border-t-0">
                  <Link href={i.href} className="flex items-center gap-3 px-5 py-3 hover:bg-contrast-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-header">{i.title}</span>
                      {i.detail && <span className="block truncate text-[0.8125rem] text-secondary">{i.detail}</span>}
                    </span>
                    {i.badge && <span className="doc-type shrink-0">{i.badge}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/** Case-insensitive "contains" over several fields. */
export const hit = (q: string, ...fields: (string | null | undefined)[]) => fields.some((f) => f?.toLowerCase().includes(q));
