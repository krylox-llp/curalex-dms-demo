// Database / permission suite: 04-remove-exporter. Run all suites with `pnpm test:db` (see tests/README.md).
import { admin, createClient, env, PW, tag } from "./lib.mjs";
async function user(email) { await admin.auth.admin.createUser({ email, password: PW, email_confirm: true }); const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-audit-reason": Buffer.from("automated test").toString("base64") } } }); const { error } = await c.auth.signInWithPassword({ email, password: PW }); if (error) throw error; return c; }
let pass = 0, fail = 0; const check = (l, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${x ? "  — " + x : ""}`); };
const rpc = async (c, fn, a) => { const { data, error } = await c.rpc(fn, a); return { data, err: error?.message }; };
const owner = await user(`o-${tag}@t.test`); await admin.from("platform_admins").insert({ email: `o-${tag}@t.test` });
const m1 = await user(`m1-${tag}@t.test`), m2 = await user(`m2-${tag}@t.test`), e1 = await user(`e1-${tag}@t.test`);
for (const [n, e] of [["Acme", "m1"], ["Beta", "m2"]]) await rpc(owner, "admin_invite_company", { p_name: n, p_email: `${e}-${tag}@t.test`, p_type: "manufacturer" });
for (const c of [m1, m2]) await rpc(c, "accept_invitation", {});
const g = (await rpc(m1, "invite_exporter", { p_company: "Globex", p_email: `e1-${tag}@t.test` })).data;
await rpc(m2, "invite_exporter", { p_company: "Globex", p_email: `e1-${tag}@t.test` });
await rpc(e1, "accept_invitation", {});
async function share(c, name) { const r = (await rpc(c, "reserve_upload", { p_folder: null, p_file_name: name })).data; await c.storage.from("documents").upload(r.storage_path, new Blob(["x"])); await rpc(c, "complete_upload", { p_version: r.version_id, p_size: 1, p_mime: "application/pdf" }); await rpc(c, "share_versions", { p_exporter: g.org_id, p_items: [{ version_id: r.version_id, days: 30 }] }); }
await share(m1, "A.pdf"); await share(m1, "B.pdf"); await share(m2, "C.pdf");
const docs = (await rpc(e1, "my_shared_documents", {})).data;
const a = docs.find(d => d.file_name === "A.pdf");
await rpc(e1, "record_document_access", { p_share: a.share_id, p_action: "view" });
const ids = Object.fromEntries((await e1.from("organizations").select("id,name")).data.map(o => [o.name, o.id]));
const fpp = (await rpc(e1, "create_fpp", { p_name: "Para", p_details: null })).data;
await rpc(e1, "add_fpp_manufacturer", { p_fpp: fpp, p_manufacturer: ids.Acme, p_role: "finished_product" });
await rpc(e1, "add_fpp_manufacturer", { p_fpp: fpp, p_manufacturer: ids.Beta, p_role: "api" });
await rpc(e1, "add_fpp_documents", { p_fpp: fpp, p_share_ids: docs.map(d => d.share_id) });

check("other manufacturer cannot remove Acme's exporter link", (await rpc(m2, "remove_exporter", { p_exporter: ids.Acme })).err === "not_found");
check("exporter cannot call remove_exporter", (await rpc(e1, "remove_exporter", { p_exporter: g.org_id })).err === "not_allowed");
const r = await rpc(m1, "remove_exporter", { p_exporter: g.org_id });
check("Acme removes Globex, revoking 2 live shares", r.data === 2, r.err);
check("Globex gone from Acme's exporters", !((await rpc(m1, "my_exporters", {})).data ?? []).some(e => e.org_id === g.org_id));
check("Acme gone from Globex's manufacturers", JSON.stringify((await rpc(e1, "my_manufacturer_options", {})).data.map(o => o.name)) === '["Beta"]');
check("Globex keeps Beta's documents only", JSON.stringify((await rpc(e1, "my_shared_documents", {})).data.map(d => d.file_name)) === '["C.pdf"]');
const { data: fm } = await e1.from("fpp_manufacturers").select("manufacturer_org_id").eq("fpp_id", fpp);
check("Acme removed from exporter's FPP, Beta stays", fm.length === 1 && fm[0].manufacturer_org_id === ids.Beta);
const { data: fd } = await e1.from("fpp_documents").select("share_id").eq("fpp_id", fpp);
check("only Beta's document left in FPP", fd.length === 1);
check("Globex cannot open Acme's file any more", (await rpc(e1, "record_document_access", { p_share: a.share_id, p_action: "view" })).err === "no_access");
const { data: hist } = await m1.from("document_shares").select("revoked_at").eq("exporter_org_id", g.org_id);
check("share history kept (revoked)", hist.length === 2 && hist.every(s => s.revoked_at));
check("access log kept for Acme", ((await m1.from("access_events").select("id")).data ?? []).length === 1);
check("cannot share with removed exporter", (await rpc(m1, "share_versions", { p_exporter: g.org_id, p_items: [] })).err === "not_your_exporter");
check("removing again -> not_found", (await rpc(m1, "remove_exporter", { p_exporter: g.org_id })).err === "not_found");
const re = await rpc(m1, "invite_exporter", { p_company: "Globex", p_email: `e1-${tag}@t.test` });
check("re-invite reconnects the same exporter", re.data?.status === "linked_existing" && re.data.org_id === g.org_id, JSON.stringify(re.data ?? re.err));
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
