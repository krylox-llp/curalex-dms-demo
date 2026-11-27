import "server-only";
import { headers } from "next/headers";

/**
 * Absolute base URL for links in emails. Prefers NEXT_PUBLIC_SITE_URL (set it in production,
 * e.g. https://app.curalex.com); otherwise uses the current request's host.
 */
export async function siteUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
