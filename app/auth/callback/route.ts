import { NextResponse, type NextRequest } from "next/server";
import { homeFor, type Org, type OrgType } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const roleParam = searchParams.get("role");
  // Which login page they used: /login/manufacturer, /login/exporter, or the generic /login.
  const loginRole: OrgType | null = roleParam === "manufacturer" || roleParam === "exporter" ? roleParam : null;
  const loginPage = loginRole ? `/login/${loginRole}` : "/login";

  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, siteOrigin(request)));

  if (!code) return redirectTo(`${loginPage}?error=auth_failed`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return redirectTo(`${loginPage}?error=auth_failed`);

  // Joins the company from a pending invitation for this email (no-op if already a member).
  const { data, error: acceptError } = await supabase.rpc("accept_invitation");
  if (acceptError) {
    await supabase.auth.signOut();
    return redirectTo(`${loginPage}?error=auth_failed`);
  }

  const account = data as { is_admin: boolean; org: Org | null };
  const home = homeFor({ isAdmin: account.is_admin, org: account.org });
  if (!home) {
    await supabase.auth.signOut();
    return redirectTo(`${loginPage}?error=not_invited`);
  }

  // Signed in through the other role's page: point them to the right one.
  if (loginRole && !account.is_admin && account.org && account.org.type !== loginRole) {
    await supabase.auth.signOut();
    return redirectTo(`${loginPage}?error=wrong_role&actual=${account.org.type}`);
  }

  // Only honour `next` when it is a same-origin path inside the user's own area.
  const next =
    nextParam && (nextParam === home || nextParam.startsWith(`${home}/`)) ? nextParam : home;

  return redirectTo(next);
}

function siteOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (process.env.NODE_ENV !== "development" && forwardedHost) {
    return `https://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}
