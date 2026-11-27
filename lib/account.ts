import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OrgType = "manufacturer" | "exporter";

export type Org = { id: string; name: string; type: OrgType };

export type Account = {
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  org: Org | null;
};

export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  manufacturer: "Manufacturer",
  exporter: "Exporter",
};

/** The signed-in user, their company and admin status. Cached per request. */
export const getAccount = cache(async (): Promise<Account | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) return null;

  const { data, error } = await supabase.rpc("my_account");
  if (error) {
    // PGRST202/PGRST205: function or table missing from the API schema cache.
    if (error.code === "PGRST202" || error.code === "PGRST205") {
      throw new Error(
        "CuraLex database is not set up: run supabase/migrations/*_organizations_and_invitations.sql " +
          "on this Supabase project (SQL editor or `supabase db push`). If you just ran it, reload the API " +
          "schema with: notify pgrst, 'reload schema';",
      );
    }
    throw new Error(`Could not load account: ${error.message}`);
  }

  const meta = (claims.user_metadata ?? {}) as { full_name?: string; avatar_url?: string };
  const account = data as { email: string | null; is_admin: boolean; org: Org | null };

  return {
    email: account.email ?? String(claims.email ?? ""),
    name: meta.full_name ?? null,
    avatarUrl: meta.avatar_url ?? null,
    isAdmin: account.is_admin,
    org: account.org,
  };
});

/** Where a signed-in user belongs: admins → /admin, companies → their workspace. */
export function homeFor(account: Pick<Account, "isAdmin" | "org">): string | null {
  if (account.isAdmin) return "/admin";
  if (account.org) return `/${account.org.type}`;
  return null;
}

type Area = "admin" | OrgType;

/** Guards a workspace page; redirects anyone who doesn't belong there. */
export async function requireAccount(area: "admin"): Promise<Account>;
export async function requireAccount(area: OrgType): Promise<Account & { org: Org }>;
export async function requireAccount(area: Area): Promise<Account> {
  const account = await getAccount();
  if (!account) redirect("/login");

  const home = homeFor(account);
  if (!home) redirect("/login?error=not_invited");

  const allowed = area === "admin" ? account.isAdmin : account.org?.type === area;
  if (!allowed) redirect(home);

  return account;
}
