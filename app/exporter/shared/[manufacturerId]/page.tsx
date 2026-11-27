import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton, PageHeader } from "@/components/app-shell";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DocsTable } from "@/components/exporter/docs-table";
import { requireAccount } from "@/lib/account";
import { isUuid } from "@/lib/documents-shared";
import { getManufacturerOptions, getSharedDocuments } from "@/lib/exporter/data";

export const metadata: Metadata = { title: "Shared with me · CuraLex - DMS" };

export default function ManufacturerDocsPage(props: PageProps<"/exporter/shared/[manufacturerId]">) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <ManufacturerDocs {...props} />
    </Suspense>
  );
}

async function ManufacturerDocs({ params }: PageProps<"/exporter/shared/[manufacturerId]">) {
  const account = await requireAccount("exporter");
  const { manufacturerId } = await params;
  if (!isUuid(manufacturerId)) notFound();
  const data = await load(manufacturerId);
  if (!data) notFound();

  return (
    <AppShell account={account} area="company">
      <PageHeader
        title={data.name}
        description="Documents this manufacturer has shared with you. Every view and download is recorded and visible to the manufacturer."
        breadcrumb={<Breadcrumbs items={[{ label: "Shared with me", href: "/exporter/shared" }, { label: data.name }]} />}
      />
      <DocsTable docs={data.docs} now={data.now} emptyText={`${data.name} hasn't shared any documents with you yet.`} />
    </AppShell>
  );
}

async function load(manufacturerId: string) {
  const [docs, options] = await Promise.all([getSharedDocuments(), getManufacturerOptions()]);
  const m = options.find((o) => o.org_id === manufacturerId);
  if (!m) return null;
  return { name: m.name, docs: docs.filter((d) => d.manufacturer_id === manufacturerId), now: Date.now() };
}
