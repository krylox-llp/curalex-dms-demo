// Database / permission suite: 08-access-requests. Run all suites with `pnpm test:db` (see tests/README.md).
import { admin, createClient, env, PW, tag } from "./lib.mjs";

let pass = 0, fail = 0;
const check = (l, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${x ? "  — " + x : ""}`); };
const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
async function user(name) {
  const email = `${name}-${tag}@t.test`;
  await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: PW });
  c.email = email;
  return c;
}
const submit = (c, over = {}) => c.rpc("submit_access_request", {
  p_name: "Lakshmi Menon", p_email: `lead-${tag}@example.com`, p_company: "Example Pharma", p_company_type: "manufacturer",
  p_phone: "+91 98450 00000", p_message: "We share CoAs with 5 exporters.", ...over,
});

const first = await submit(anon);
check("signed-out visitor can submit", !first.error && typeof first.data === "string", first.error?.message);
check("bad email rejected", (await submit(anon, { p_email: "not-an-email" })).error?.message === "invalid_input");
check("unknown company type rejected", (await submit(anon, { p_company_type: "distributor" })).error?.message === "invalid_input");
check("blank name rejected", (await submit(anon, { p_name: "  " })).error?.message === "invalid_input");
check("too long message rejected", (await submit(anon, { p_message: "x".repeat(2001) })).error?.message === "invalid_input");
await submit(anon); await submit(anon);
check("4th request from the same email in a day is throttled", (await submit(anon)).error?.message === "too_many_requests");

check("visitors can't read requests", ((await anon.from("access_requests").select("id")).data ?? []).length === 0);
const member = await user("member");
check("ordinary users can't read requests", ((await member.from("access_requests").select("id")).data ?? []).length === 0);
check("ordinary users can't change status", (await member.rpc("set_access_request_status", { p_request: first.data, p_status: "contacted" })).error?.message === "not_allowed");

const owner = await user("owner"); await admin.from("platform_admins").insert({ email: owner.email });
const rows = (await owner.from("access_requests").select("id, email, status, phone").eq("email", `lead-${tag}@example.com`)).data ?? [];
check("platform admin reads requests", rows.length === 3 && rows.every((r) => r.status === "new"), `${rows.length} rows`);
check("admin sets status", !(await owner.rpc("set_access_request_status", { p_request: first.data, p_status: "contacted" })).error);
const after = (await owner.from("access_requests").select("status, handled_at").eq("id", first.data).single()).data;
check("status and handled time recorded", after?.status === "contacted" && after?.handled_at !== null);
check("invalid status rejected", (await owner.rpc("set_access_request_status", { p_request: first.data, p_status: "spam" })).error?.message === "invalid_input");

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
