// Database / permission suite: 03-products. Run all suites with `pnpm test:db` (see tests/README.md).
import { admin, createClient, env, PW, tag } from "./lib.mjs";
if (!/^http:\/\/127\.0\.0\.1:/.test(env.API_URL)) throw new Error("not local");
async function user(email) { await admin.auth.admin.createUser({ email, password: PW, email_confirm: true }); const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-audit-reason": Buffer.from("automated test").toString("base64") } } }); const { error } = await c.auth.signInWithPassword({ email, password: PW }); if (error) throw error; return c; }
let pass = 0, fail = 0; const check = (l, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${x ? "  — " + x : ""}`); };
const rpc = async (c, fn, a) => { const { data, error } = await c.rpc(fn, a); return { data, err: error?.message }; };
const owner = await user(`o-${tag}@t.test`); await admin.from("platform_admins").insert({ email: `o-${tag}@t.test` });
const m1 = await user(`m1-${tag}@t.test`), m2 = await user(`m2-${tag}@t.test`), m3 = await user(`m3-${tag}@t.test`), e1 = await user(`e1-${tag}@t.test`), e2 = await user(`e2-${tag}@t.test`);
for (const [n, e] of [["Acme", "m1"], ["Beta", "m2"], ["Gamma", "m3"]]) await rpc(owner, "admin_invite_company", { p_name: n, p_email: `${e}-${tag}@t.test`, p_type: "manufacturer" });
for (const c of [m1, m2, m3]) await rpc(c, "accept_invitation", {});
const g = await rpc(m1, "invite_exporter", { p_company: "Globex", p_email: `e1-${tag}@t.test` });
await rpc(m2, "invite_exporter", { p_company: "Globex", p_email: `e1-${tag}@t.test` });
await rpc(m3, "invite_exporter", { p_company: "Nova", p_email: `e2-${tag}@t.test` });
for (const c of [e1, e2]) await rpc(c, "accept_invitation", {});
async function share(c, name) { const r = await rpc(c, "reserve_upload", { p_folder: null, p_file_name: name }); await c.storage.from("documents").upload(r.data.storage_path, new Blob(["x"])); await rpc(c, "complete_upload", { p_version: r.data.version_id, p_size: 1, p_mime: "application/pdf" }); await rpc(c, "share_versions", { p_exporter: g.data.org_id, p_items: [{ version_id: r.data.version_id, days: 30 }] }); return r.data; }
await share(m1, "CoA.pdf"); await share(m1, "GMP.pdf"); await share(m2, "API-DMF.pdf");
const docs = (await rpc(e1, "my_shared_documents", {})).data; const byName = Object.fromEntries(docs.map(d => [d.file_name, d]));
const ids = Object.fromEntries((await e1.from("organizations").select("id,name")).data.map(o => [o.name, o.id]));

const f = await rpc(e1, "create_fpp", { p_name: "Paracetamol 500mg Tablets", p_details: "Kenya registration" });
check("exporter creates FPP", !f.err && f.data, f.err);
check("duplicate FPP name rejected", (await rpc(e1, "create_fpp", { p_name: "paracetamol 500MG tablets", p_details: null })).err === "fpp_exists");
check("manufacturer cannot create FPP", (await rpc(m1, "create_fpp", { p_name: "X", p_details: null })).err === "not_allowed");
check("options list linked manufacturers", JSON.stringify((await rpc(e1, "my_manufacturer_options", {})).data.map(o => o.name)) === '["Acme","Beta"]');
check("add Acme as finished product mfr", !(await rpc(e1, "add_fpp_manufacturer", { p_fpp: f.data, p_manufacturer: ids.Acme, p_role: "finished_product" })).err);
check("add Beta as API mfr", !(await rpc(e1, "add_fpp_manufacturer", { p_fpp: f.data, p_manufacturer: ids.Beta, p_role: "api" })).err);
const { data: gammaOrg } = await m3.from("organizations").select("id").eq("name", "Gamma");
check("cannot add unlinked manufacturer", (await rpc(e1, "add_fpp_manufacturer", { p_fpp: f.data, p_manufacturer: gammaOrg[0].id, p_role: null })).err === "not_your_manufacturer");
check("invalid role rejected", !!(await rpc(e1, "add_fpp_manufacturer", { p_fpp: f.data, p_manufacturer: ids.Acme, p_role: "boss" })).err);
const add = await rpc(e1, "add_fpp_documents", { p_fpp: f.data, p_share_ids: [byName["CoA.pdf"].share_id, byName["API-DMF.pdf"].share_id] });
check("add docs from two manufacturers", add.data === 2, add.err);
check("adding same doc again adds 0", (await rpc(e1, "add_fpp_documents", { p_fpp: f.data, p_share_ids: [byName["CoA.pdf"].share_id] })).data === 0);
const { data: fd } = await e1.from("fpp_documents").select("share_id").eq("fpp_id", f.data);
check("FPP holds 2 documents", fd.length === 2);
check("other exporter cannot see FPP", ((await e2.from("fpps").select("id")).data ?? []).length === 0);
check("manufacturer cannot see FPP or its docs", ((await m1.from("fpps").select("id")).data ?? []).length === 0 && ((await m1.from("fpp_documents").select("share_id")).data ?? []).length === 0);
check("other exporter cannot add to FPP", (await rpc(e2, "add_fpp_documents", { p_fpp: f.data, p_share_ids: [byName["GMP.pdf"].share_id] })).err === "not_found");
// doc from manufacturer not in FPP
const f2 = await rpc(e1, "create_fpp", { p_name: "Amoxicillin 250mg", p_details: null });
await rpc(e1, "add_fpp_manufacturer", { p_fpp: f2.data, p_manufacturer: ids.Acme, p_role: null });
check("cannot add doc from a manufacturer not in the FPP", (await rpc(e1, "add_fpp_documents", { p_fpp: f2.data, p_share_ids: [byName["API-DMF.pdf"].share_id] })).err === "not_found");
// revocation propagates: share row still referenced but revoked -> app hides/flags
await rpc(m1, "revoke_shares", { p_share_ids: [byName["CoA.pdf"].share_id] });
check("revoked share no longer in exporter docs list", !(await rpc(e1, "my_shared_documents", {})).data.some(d => d.share_id === byName["CoA.pdf"].share_id));
check("cannot add a revoked share", (await rpc(e1, "add_fpp_documents", { p_fpp: f2.data, p_share_ids: [byName["CoA.pdf"].share_id] })).err === "not_found");
// remove manufacturer drops its docs
await rpc(e1, "remove_fpp_manufacturer", { p_fpp: f.data, p_manufacturer: ids.Beta });
const { data: fd2 } = await e1.from("fpp_documents").select("share_id").eq("fpp_id", f.data);
check("removing Beta removes its docs from FPP", !fd2.some(r => r.share_id === byName["API-DMF.pdf"].share_id));
check("share still exists after removal from FPP", (await rpc(e1, "my_shared_documents", {})).data.some(d => d.share_id === byName["API-DMF.pdf"].share_id));
check("rename FPP", !(await rpc(e1, "update_fpp", { p_fpp: f.data, p_name: "Paracetamol 500 mg Tablets", p_details: "KE" })).err);
check("delete FPP", !(await rpc(e1, "delete_fpp", { p_fpp: f2.data })).err && ((await e1.from("fpps").select("id")).data ?? []).length === 1);
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
