// Shared setup for the database / permission test suites.
// Runs against the LOCAL Supabase stack only (supabase start); refuses remote URLs.
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const req = createRequire(`${repoRoot}package.json`);
export const { createClient } = req("@supabase/supabase-js");

function loadEnv() {
  if (process.env.TEST_SUPABASE_URL) {
    return {
      API_URL: process.env.TEST_SUPABASE_URL,
      ANON_KEY: process.env.TEST_SUPABASE_ANON_KEY,
      SERVICE_ROLE_KEY: process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,
    };
  }
  const out = execSync("supabase status -o env", { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return Object.fromEntries(
    out.trim().split("\n").filter((l) => l.includes("=")).map((l) => {
      const [k, ...v] = l.split("=");
      return [k, v.join("=").replace(/^"|"$/g, "")];
    }),
  );
}

export const env = loadEnv();
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(env.API_URL ?? "")) {
  throw new Error(`Refusing to run tests against ${env.API_URL}: only a local Supabase stack is allowed.`);
}

/** Service-role client for test setup only (creating users, adding platform admins, forcing expiry). */
export const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** Random password and tag so suites can run repeatedly against the same database. */
export const PW = "pw-" + Math.random().toString(36).slice(2);
export const tag = Math.random().toString(36).slice(2, 6);
/** Makes a fixed test email unique for this run: "qa@acme.test" -> "qa-ab12@acme.test". */
export const t = (email) => email.replace("@", `-${tag}@`);
