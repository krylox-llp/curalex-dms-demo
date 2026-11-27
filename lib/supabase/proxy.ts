import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth"];

/**
 * Refreshes the Supabase session and gates signed-out users.
 * Company/role checks live in the pages (lib/account.ts), since they need the database.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the auth token. Do not put code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, searchParams } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  const redirect = (path: string) => {
    const url = request.nextUrl.clone();
    const [p, q] = path.split("?");
    url.pathname = p;
    url.search = q ? `?${q}` : "";
    const res = NextResponse.redirect(url);
    // Keep any refreshed auth cookies on the redirect.
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!signedIn && !isPublic) {
    // Workspace links go to that role's sign-in page; everything else to the chooser.
    const area = pathname.split("/")[1];
    const loginPage = area === "manufacturer" || area === "exporter" ? `/login/${area}` : "/login";
    return redirect(pathname === "/" ? loginPage : `${loginPage}?next=${encodeURIComponent(pathname)}`);
  }

  // Signed-in users skip the login page ("/" sends them to their workspace),
  // unless it is showing an error such as "not invited".
  if (signedIn && (pathname === "/login" || pathname.startsWith("/login/")) && !searchParams.has("error")) {
    return redirect("/");
  }

  return response;
}
