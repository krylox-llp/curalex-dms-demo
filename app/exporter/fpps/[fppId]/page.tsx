import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell, AppShellSkeleton, PageHeader } from "@/components/app-shell";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DocsTable } from "@/components/exporter/docs-table";
import { AddDocumentsButton, AddManufacturerButton, FppMenu, ManufacturerMenu } from "@/components/exporter/fpp-controls";
import { ExporterNav } from "@/components/exporter/nav";
import { requireAccount } from "@/lib/account";
import { isUuid } from "@/lib/documents-shared";
import { getFpp, getManufacturerOptions, getSharedDocuments, roleLabel } from "@/lib/exporter/data";

export const metadata: Metadata = { title: "Product · CuraLex - DMS" };

export default function FppPage(props: PageProps<"/exporter/fpps/[fppId]">) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <FppDetail {...props} />
    </Suspense>
  );
}

async function FppDetail({ params }: PageProps<"/exporter/fpps/[fppId]">) {
  const account = await requireAccount("exporter");
  const { fppId } = await params;
  if (!isUuid(fppId)) notFound();
  const data = await loadFpp(fppId);
  if (!data) notFound();
  const { fpp, sections, addable, now } = data;

  return (
    <AppShell account={account} area="company" nav={<ExporterNav />}>
      <PageHeader
        title={fpp.name}
        description={fpp.details ?? undefined}
        breadcrumb={<Breadcrumbs items={[{ label: "Products", href: "/exporter" }, { label: fpp.name }]} />}
        actions={
          <>
            <AddManufacturerButton fppId={fpp.id} options={addable} />
            <FppMenu fpp={fpp} />
          </>
        }
      />

      {sections.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <p className="font-medium text-header">No manufacturers yet</p>
          <p className="mx-auto mt-1 max-w-md text-secondary">
            Add the manufacturers behind this product, such as the finished product and API manufacturers, then pick
            the documents each has shared with you.
          </p>
          <div className="mt-5 flex justify-center">
            <AddManufacturerButton fppId={fpp.id} options={addable} variant="secondary" />
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map((s) => (
            <section key={s.id} aria-labelledby={`mfr-${s.id}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <h2 id={`mfr-${s.id}`} className="truncate text-lg font-semibold text-header">{s.name}</h2>
                  {s.role && <span className="badge">{roleLabel(s.role)}</span>}
                  <span className="text-sm text-secondary">
                    {s.docs.length} document{s.docs.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <AddDocumentsButton fppId={fpp.id} manufacturerName={s.name} available={s.available} />
                  <ManufacturerMenu fppId={fpp.id} manufacturer={{ id: s.id, name: s.name, role: s.role, docCount: s.docs.length }} />
                </div>
              </div>
              {s.unavailable > 0 && (
                <p className="notice notice-warning mb-3">
                  {s.unavailable} document{s.unavailable === 1 ? " is" : "s are"} no longer shared by {s.name}. Ask them
                  to share {s.unavailable === 1 ? "it" : "them"} again if you still need {s.unavailable === 1 ? "it" : "them"}.
                </p>
              )}
              <DocsTable
                docs={s.docs}
                now={now}
                fppId={fpp.id}
                emptyText={
                  s.available.length
                    ? `No documents added yet. Use “Add documents” to pick from what ${s.name} has shared.`
                    : `${s.name} hasn't shared any documents with you yet.`
                }
              />
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}

async function loadFpp(fppId: string) {
  const [detail, docs, options] = await Promise.all([getFpp(fppId), getSharedDocuments(), getManufacturerOptions()]);
  if (!detail) return null;
  const nameById = new Map(options.map((o) => [o.org_id, o.name]));
  const inFpp = new Set(detail.manufacturers.map((m) => m.id));
  // Attached shares missing from the live list were revoked by the manufacturer or the file was deleted.
  const live = new Set(docs.map((d) => d.share_id));
  const missingFrom = (mfr: string) =>
    [...detail.shareIds].filter((id) => !live.has(id) && detail.shareMaker.get(id) === mfr).length;

  const sections = detail.manufacturers.map((m) => {
    const fromMfr = docs.filter((d) => d.manufacturer_id === m.id);
    const attached = fromMfr.filter((d) => detail.shareIds.has(d.share_id));
    return {
      id: m.id,
      name: nameById.get(m.id) ?? "Unknown manufacturer",
      role: m.role,
      docs: attached,
      available: fromMfr.filter((d) => !detail.shareIds.has(d.share_id) && !d.expired),
      unavailable: missingFrom(m.id),
    };
  });
  // Finished product manufacturer first, then API, excipient, packaging, other, unspecified.
  const order = ["finished_product", "api", "excipient", "packaging", "other"];
  const rank = (r: string | null) => (r ? order.indexOf(r) : order.length);
  sections.sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name));

  return {
    fpp: detail.fpp,
    sections,
    addable: options.filter((o) => !inFpp.has(o.org_id)),
    now: Date.now(),
  };
}
