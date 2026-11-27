// Database / permission suite: 02-exporter-access. Run all suites with `pnpm test:db` (see tests/README.md).
import { admin, createClient, env, PW, tag } from "./lib.mjs";
if (!/^http:\/\/127\.0\.0\.1:/.test(env.API_URL)) throw new Error("not local");
async function user(email) {
  await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-audit-reason": Buffer.from("automated test").toString("base64") } } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW }); if (error) throw error;
  return c;
}
let pass = 0, fail = 0;
const check = (l, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${x ? "  — " + x : ""}`); };
const rpc = async (c, fn, a) => { const { data, error } = await c.rpc(fn, a); return { data, err: error?.message }; };

const owner = await user(`owner-${tag}@t.test`); await admin.from("platform_admins").insert({ email: `owner-${tag}@t.test` });
const m1 = await user(`m1-${tag}@t.test`), m2 = await user(`m2-${tag}@t.test`), e1 = await user(`e1-${tag}@t.test`), e2 = await user(`e2-${tag}@t.test`);
await rpc(owner, "admin_invite_company", { p_name: "Acme", p_email: `m1-${tag}@t.test`, p_type: "manufacturer" });
await rpc(owner, "admin_invite_company", { p_name: "Beta", p_email: `m2-${tag}@t.test`, p_type: "manufacturer" });
for (const c of [m1, m2]) await rpc(c, "accept_invitation", {});
const g = await rpc(m1, "invite_exporter", { p_company: "Globex", p_email: `e1-${tag}@t.test` });
await rpc(m2, "invite_exporter", { p_company: "Globex", p_email: `e1-${tag}@t.test` });
await rpc(m1, "invite_exporter", { p_company: "Nova", p_email: `e2-${tag}@t.test` });
for (const c of [e1, e2]) await rpc(c, "accept_invitation", {});

async function upload(c, name, body) {
  const r = await rpc(c, "reserve_upload", { p_folder: null, p_file_name: name });
  await c.storage.from("documents").upload(r.data.storage_path, new Blob([body]), { contentType: "application/pdf" });
  await rpc(c, "complete_upload", { p_version: r.data.version_id, p_size: body.length, p_mime: "application/pdf" });
  return r.data;
}
const a = await upload(m1, "CoA.pdf", "coa"), b = await upload(m1, "GMP.pdf", "gmp"), c3 = await upload(m2, "FSC.pdf", "fsc");
await rpc(m1, "share_versions", { p_exporter: g.data.org_id, p_items: [{ version_id: a.version_id, days: 30 }, { version_id: b.version_id, days: 30 }] });
await rpc(m2, "share_versions", { p_exporter: g.data.org_id, p_items: [{ version_id: c3.version_id, days: null }] });

const docs = await rpc(e1, "my_shared_documents", {});
check("exporter lists docs from both manufacturers", docs.data?.length === 3 && new Set(docs.data.map(d => d.manufacturer_name)).size === 2, JSON.stringify(docs.data?.map(d => d.manufacturer_name + ":" + d.file_name)));
check("other exporter sees none", (await rpc(e2, "my_shared_documents", {})).data?.length === 0);
check("manufacturer gets no rows from my_shared_documents", (await rpc(m1, "my_shared_documents", {})).data?.length === 0);
const coa = docs.data.find(d => d.file_name === "CoA.pdf");
const open = await rpc(e1, "record_document_access", { p_share: coa.share_id, p_action: "download" });
check("exporter opens live share", !open.err && open.data.storage_path === a.storage_path && open.data.file_name === "CoA.pdf", open.err);
check("other exporter cannot open it", (await rpc(e2, "record_document_access", { p_share: coa.share_id, p_action: "view" })).err === "no_access");
check("manufacturer cannot use exporter access", (await rpc(m1, "record_document_access", { p_share: coa.share_id, p_action: "view" })).err === "no_access");
check("invalid action rejected", (await rpc(e1, "record_document_access", { p_share: coa.share_id, p_action: "delete" })).err === "invalid_action");
check("exporter still cannot read storage directly", !!(await e1.storage.from("documents").download(a.storage_path)).error);
await rpc(e1, "record_document_access", { p_share: coa.share_id, p_action: "view" });

const { data: ev1 } = await m1.from("access_events").select("action, user_email, share_id");
check("manufacturer sees access log for its shares", ev1.length === 2 && ev1.every(e => e.user_email === `e1-${tag}@t.test`), JSON.stringify(ev1.map(e => e.action)));
check("other manufacturer sees none of it", ((await m2.from("access_events").select("id")).data ?? []).length === 0);
check("other exporter sees none of it", ((await e2.from("access_events").select("id")).data ?? []).length === 0);
const ins = await e1.from("access_events").insert({ share_id: coa.share_id, version_id: a.version_id, manufacturer_org_id: coa.manufacturer_id, exporter_org_id: g.data.org_id, action: "view" });
check("access log cannot be written directly", !!ins.error, ins.error?.message);
const del = await m1.from("access_events").delete().eq("share_id", coa.share_id).select();
check("access log cannot be deleted", (del.data ?? []).length === 0 && ((await m1.from("access_events").select("id")).data ?? []).length === 2);

// revoke / expire / delete
await rpc(m1, "revoke_shares", { p_share_ids: [coa.share_id] });
check("revoked share: no access", (await rpc(e1, "record_document_access", { p_share: coa.share_id, p_action: "view" })).err === "no_access");
check("revoked share disappears from exporter list", !(await rpc(e1, "my_shared_documents", {})).data.some(d => d.share_id === coa.share_id));
const gmp = docs.data.find(d => d.file_name === "GMP.pdf");
await admin.from("document_shares").update({ expires_at: new Date(Date.now() - 60000).toISOString() }).eq("id", gmp.share_id);
const afterExp = (await rpc(e1, "my_shared_documents", {})).data.find(d => d.share_id === gmp.share_id);
check("expired share listed but flagged", afterExp?.expired === true);
check("expired share: no access", (await rpc(e1, "record_document_access", { p_share: gmp.share_id, p_action: "download" })).err === "no_access");
const fsc = docs.data.find(d => d.file_name === "FSC.pdf");
await rpc(m2, "delete_documents", { p_document_ids: [c3.document_id] });
check("deleted file: no access and gone from list", (await rpc(e1, "record_document_access", { p_share: fsc.share_id, p_action: "view" })).err === "no_access" && !(await rpc(e1, "my_shared_documents", {})).data.some(d => d.share_id === fsc.share_id));
const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
check("anon: no access", (await rpc(anon, "record_document_access", { p_share: gmp.share_id, p_action: "view" })).err === "no_access");
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
