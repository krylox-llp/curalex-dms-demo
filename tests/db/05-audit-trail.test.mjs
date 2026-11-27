// Database / permission suite: 05-audit-trail. Run all suites with `pnpm test:db` (see tests/README.md).
import { admin, createClient, env, PW, tag } from "./lib.mjs";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
async function user(email) { await admin.auth.admin.createUser({ email, password: PW, email_confirm: true }); const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: PW }); if (error) throw error; return c; }
let pass = 0, fail = 0; const check = (l, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${x ? "  — " + x : ""}`); };
const rpc = async (c, fn, a, reason) => { let q = c.rpc(fn, a); if (reason) q = q.setHeader("x-audit-reason", b64(reason)); const { data, error } = await q; return { data, err: error?.message }; };
const owner = await user(`o-${tag}@t.test`); await admin.from("platform_admins").insert({ email: `o-${tag}@t.test` });
const m1 = await user(`m1-${tag}@t.test`), m2 = await user(`m2-${tag}@t.test`), e1 = await user(`e1-${tag}@t.test`);
await rpc(owner, "admin_invite_company", { p_name: "Acme", p_email: `m1-${tag}@t.test`, p_type: "manufacturer" });
await rpc(owner, "admin_invite_company", { p_name: "Beta", p_email: `m2-${tag}@t.test`, p_type: "manufacturer" });
await rpc(m1, "accept_invitation", {}); await rpc(m2, "accept_invitation", {});
const g = (await rpc(m1, "invite_exporter", { p_company: "Globex", p_email: `e1-${tag}@t.test` })).data;
await rpc(e1, "accept_invitation", {});
const folder = (await rpc(m1, "create_folder", { p_parent: null, p_name: "Quality" })).data;
const r = (await rpc(m1, "reserve_upload", { p_folder: folder, p_file_name: "CoA.pdf" })).data;
await m1.storage.from("documents").upload(r.storage_path, new Blob(["x"]));
await rpc(m1, "complete_upload", { p_version: r.version_id, p_size: 1, p_mime: "application/pdf" });
await rpc(m1, "share_versions", { p_exporter: g.org_id, p_items: [{ version_id: r.version_id, days: 30 }] });
const share = (await rpc(e1, "my_shared_documents", {})).data[0];
await rpc(m1, "set_share_duration", { p_share: share.share_id, p_days: 90 });
await rpc(e1, "record_document_access", { p_share: share.share_id, p_action: "download" });

// Reasons
check("revoke without reason is refused", (await rpc(m1, "revoke_shares", { p_share_ids: [share.share_id] })).err === "reason_required");
check("delete without reason is refused", (await rpc(m1, "delete_documents", { p_document_ids: [r.document_id] })).err === "reason_required");
check("remove exporter without reason is refused", (await rpc(m1, "remove_exporter", { p_exporter: g.org_id })).err === "reason_required");
check("revoke with reason works", (await rpc(m1, "revoke_shares", { p_share_ids: [share.share_id] }, "Superseded CoA — batch 12 → 13")).data === 1);
check("delete with reason works", !(await rpc(m1, "delete_documents", { p_document_ids: [r.document_id] }, "Uploaded in error")).err);

const { data: log } = await m1.from("audit_log").select("action, actor_email, subject_name, reason, changed_fields, subject_document_id").order("id");
const actions = log.map(l => l.action);
for (const a of ["company.created", "invitation.created", "member.added", "invitation.accepted", "exporter.connected", "folder.created", "document.created", "version.uploaded", "share.created", "share.duration_changed", "document.downloaded", "share.revoked", "document.deleted", "version.deleted"])
  check(`audit has ${a}`, actions.includes(a));
check("no entry for the pending reservation (only version.uploaded)", actions.filter(a => a.startsWith("version.")).length === 2, actions.filter(a => a.startsWith("version.")).join(","));
const rev = log.find(l => l.action === "share.revoked");
check("reason stored (UTF-8)", rev?.reason === "Superseded CoA — batch 12 → 13", rev?.reason);
check("actor recorded", rev?.actor_email === `m1-${tag}@t.test`);
check("subject label snapshot", rev?.subject_name === "CoA.pdf v1 → Globex", rev?.subject_name);
check("changed fields captured", JSON.stringify(log.find(l => l.action === "share.duration_changed")?.changed_fields) === '["expires_at"]');
check("download attributed to exporter user", log.find(l => l.action === "document.downloaded")?.actor_email === `e1-${tag}@t.test`);
check("per-document grouping", log.filter(l => l.subject_document_id === r.document_id).length >= 6);

// Visibility
const { data: e1log } = await e1.from("audit_log").select("action");
const e1a = e1log.map(l => l.action);
check("exporter sees share + access events", e1a.includes("share.created") && e1a.includes("document.downloaded") && e1a.includes("share.revoked"));
check("exporter doesn't see manufacturer-internal events", !e1a.includes("document.created") && !e1a.includes("folder.created"));
check("other manufacturer sees none of Acme's events", !((await m2.from("audit_log").select("action")).data ?? []).some(l => l.action.startsWith("share.") || l.action.startsWith("folder.")));

// Immutability / forgery
const upd = await m1.from("audit_log").update({ reason: "edited" }).eq("action", "share.revoked").select();
check("client cannot update audit rows", (upd.data ?? []).length === 0);
const del = await m1.from("audit_log").delete().eq("action", "share.revoked").select();
check("client cannot delete audit rows", (del.data ?? []).length === 0);
const ins = await m1.from("audit_log").insert({ action: "x", table_name: "x", operation: "INSERT", row_hash: "x" });
check("client cannot insert audit rows", !!ins.error);
check("direct _audit_append is refused", (await rpc(m1, "_audit_append", { p_action: "fake", p_table: "x", p_op: "INSERT", p_record_id: null, p_org: null, p_related: null, p_document: null, p_subject: null, p_old: null, p_new: null })).err === "not_allowed");
const v = await rpc(owner, "verify_audit_chain", {});
check("hash chain verifies", v.data?.ok === true, JSON.stringify(v.data));
check("only admins can run chain check", (await rpc(m1, "verify_audit_chain", {})).err === "not_allowed");
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
