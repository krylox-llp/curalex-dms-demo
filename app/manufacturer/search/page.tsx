import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton } from "@/components/app-shell";
import { hit, SearchResults } from "@/components/search-results";
import { requireAccount } from "@/lib/account";
import { docType, folderPathLabel, getDocuments, getFolders } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Search · CuraLex - DMS" };

export default function SearchPage({ searchParams }: PageProps<"/manufacturer/search">) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <Search searchParams={searchParams} />
    </Suspense>
  );
}

async function Search({ searchParams }: Pick<PageProps<"/manufacturer/search">, "searchParams">) {
  const account = await requireAccount("manufacturer");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const needle = query.toLowerCase();
  const supabase = await createClient();
  const [docs, folders, exporters] = query
    ? await Promise.all([getDocuments("all"), getFolders(), supabase.rpc("my_exporters")])
    : [[], [], { data: [] }];

  const docItems = docs
    .filter((d) => hit(needle, d.name, d.details.product, d.details.reference_no, d.details.market, d.details.issued_by, docType(d.details.doc_type)?.label))
    .slice(0, 50)
    .map((d) => ({
      key: d.id,
      href: `/manufacturer/documents?${d.folderId ? `folder=${d.folderId}&` : ""}doc=${d.id}`,
      title: d.name,
      detail: [folderPathLabel(folders, d.folderId), d.details.product, `v${d.versions[0].version}`].filter(Boolean).join(" · "),
      badge: docType(d.details.doc_type)?.short,
    }));
  const folderItems = folders
    .filter((f) => hit(needle, f.name))
    .map((f) => ({ key: f.id, href: `/manufacturer/documents?folder=${f.id}`, title: `${f.name}/`, detail: folderPathLabel(folders, f.parent_id) }));
  const exporterItems = ((exporters.data ?? []) as { org_id: string; name: string; status: string }[])
    .filter((e) => hit(needle, e.name))
    .map((e) => ({ key: e.org_id, href: `/manufacturer/shared/${e.org_id}`, title: e.name, detail: e.status === "active" ? "Exporter" : "Exporter · invited" }));

  return (
    <AppShell account={account} area="company">
      <SearchResults
        query={query}
        groups={[
          { title: "Documents", items: docItems },
          { title: "Folders", items: folderItems },
          { title: "Exporters", items: exporterItems },
        ]}
      />
    </AppShell>
  );
}
