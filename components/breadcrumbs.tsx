import Link from "next/link";

export type Crumb = { label: string; href?: string };

/**
 * Modelled on Vaadin's Breadcrumbs component: links to higher levels in secondary text,
 * chevron separators, and the current page (the last item, without href) as plain text.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 flex-wrap items-center gap-y-1 text-[0.9375rem]">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${i}-${item.label}`} className="flex min-w-0 items-center">
              {item.href && !last ? (
                <Link href={item.href} className="truncate text-secondary transition hover:text-primary-text hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="truncate text-body">
                  {item.label}
                </span>
              )}
              {!last && (
                <svg viewBox="0 0 20 20" fill="none" className="mx-2 size-4 shrink-0 text-tertiary" aria-hidden="true">
                  <path d="M7.5 4.5L13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
