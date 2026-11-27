import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton } from "@/components/app-shell";
import { hit, SearchResults } from "@/components/search-results";
import { requireAccount } from "@/lib/account";
import { docType } from "@/lib/documents-shared";
import { getFpps, getSharedDocuments } from "@/lib/exporter/data";

export const metadata: Metadata = { title: "Search · CuraLex - DMS" };

export default function SearchPage({ searchParams }: PageProps<"/exporter/search">) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <Search searchParams={searchParams} />
    </Suspense>
  );
}

async function Search({ searchParams }: Pick<PageProps<"/exporter/search">, "searchParams">) {
  const account = await requireAccount("exporter");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const needle = query.toLowerCase();
  const [shared, { fpps }] = query
    ? await Promise.all([getSharedDocuments(), getFpps()])
    : [[], { fpps: [] }];

  const docItems = shared
    .filter((d) => !d.expired && hit(needle, d.file_name, d.product, d.manufacturer_name, docType(d.doc_type)?.label))
    .slice(0, 50)
    .map((d) => ({
      key: d.share_id,
      href: `/exporter/shared/${d.manufacturer_id}`,
      title: d.file_name,
      detail: [d.manufacturer_name, d.product, `v${d.version}`].filter(Boolean).join(" · "),
      badge: docType(d.doc_type)?.short,
    }));
  const productItems = fpps
    .filter((p) => hit(needle, p.name, p.details))
    .map((p) => ({ key: p.id, href: `/exporter/fpps/${p.id}`, title: p.name, detail: p.details ?? undefined }));
  const makers = [...new Map(shared.map((d) => [d.manufacturer_id, d.manufacturer_name])).entries()]
    .filter(([, name]) => hit(needle, name))
    .map(([id, name]) => ({ key: id, href: `/exporter/shared/${id}`, title: name, detail: "Manufacturer" }));

  return (
    <AppShell account={account} area="company">
      <SearchResults
        query={query}
        groups={[
          { title: "Products", items: productItems },
          { title: "Documents", items: docItems },
          { title: "Manufacturers", items: makers },
        ]}
      />
    </AppShell>
  );
}
