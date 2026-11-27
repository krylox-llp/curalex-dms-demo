import "server-only";
import { cache } from "react";
import type { NavSection } from "@/components/sidebar";
import { can, type Account } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";

/** Sidebar sections for the signed-in user's workspace, with counts. Cached per request. */
export const getNavSections = cache(async (account: Account, area: "admin" | "company"): Promise<NavSection[]> => {
  if (area === "admin" || !account.org) {
    return [
      {
        items: [
          { href: "/admin", label: "Companies", icon: "companies" },
          { href: "/admin/audit", label: "Audit trail", icon: "audit" },
        ],
      },
    ];
  }

  const supabase = await createClient();
  const base = `/${account.org.type}`;
  const company: NavSection = {
    label: "Company",
    items: [
      ...(can(account, "audit.view") ? [{ href: `${base}/audit`, label: "Audit trail", icon: "audit" as const }] : []),
      ...(can(account, "users.manage") ? [{ href: `${base}/team`, label: "Team", icon: "team" as const }] : []),
    ],
  };

  if (account.org.type === "manufacturer") {
    const [docs, folders, exporters] = await Promise.all([
      supabase.from("documents").select("id", { count: "exact", head: true }),
      supabase.from("folders").select("id, name").is("parent_id", null).order("name").limit(12),
      supabase.rpc("my_exporters"),
    ]);
    return [
      {
        items: [
          { href: "/manufacturer", label: "Overview", icon: "overview" },
          {
            href: "/manufacturer/documents",
            label: "Documents",
            icon: "documents",
            count: docs.count ?? undefined,
            children: (folders.data ?? []).map((f) => ({
              href: `/manufacturer/documents?folder=${f.id}`,
              label: f.name as string,
              folderId: f.id as string,
            })),
          },
          {
            href: "/manufacturer/shared",
            label: "Shared with",
            icon: "shared",
            alsoFor: ["/manufacturer/share"],
            count: Array.isArray(exporters.data) ? exporters.data.length : undefined,
          },
        ],
      },
      ...(company.items.length ? [company] : []),
    ];
  }

  const [products, shared] = await Promise.all([
    supabase.from("fpps").select("id", { count: "exact", head: true }),
    supabase.rpc("my_shared_documents"),
  ]);
  const liveShared = Array.isArray(shared.data) ? (shared.data as { expired: boolean }[]).filter((d) => !d.expired).length : undefined;
  return [
    {
      items: [
        { href: "/exporter", label: "Overview", icon: "overview" },
        { href: "/exporter/products", label: "Products", icon: "products", alsoFor: ["/exporter/fpps"], count: products.count ?? undefined },
        { href: "/exporter/shared", label: "Shared with me", icon: "documents", count: liveShared },
      ],
    },
    ...(company.items.length ? [company] : []),
  ];
});
