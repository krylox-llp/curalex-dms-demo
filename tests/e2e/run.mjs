// Seeds the local database, builds and starts the app against the local Supabase stack,
// runs the browser smoke test, then stops the app. Set E2E_BASE_URL to use an already-running app.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { env } from "../db/lib.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = 3125;
const appEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: env.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
  RESEND_API_KEY: "", // never send real emails from tests
};
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });

if (run(process.execPath, ["tests/e2e/seed.mjs"]).status !== 0) process.exit(1);

let server;
if (!process.env.E2E_BASE_URL) {
  if (run("pnpm", ["build"], { env: appEnv }).status !== 0) process.exit(1);
  server = spawn("pnpm", ["start", "-p", String(port)], { cwd: root, env: appEnv, stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    try { await fetch(`http://localhost:${port}/login`); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
}
const r = run(process.execPath, ["tests/e2e/smoke.test.mjs"], { env: { ...process.env, E2E_BASE_URL: process.env.E2E_BASE_URL || `http://localhost:${port}` } });
if (server) process.kill(-server.pid);
process.exitCode = r.status ?? 1;
