// Database / permission suite: 06-roles. Run all suites with `pnpm test:db` (see tests/README.md).
import { admin, createClient, env, PW, tag } from "./lib.mjs";
const H = { "x-audit-reason": Buffer.from("test").toString("base64") };
async function user(name) { const email = `${name}-${tag}@t.test`; await admin.auth.admin.createUser({ email, password: PW, email_confirm: true }); const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false }, global: { headers: H } }); const { error } = await c.auth.signInWithPassword({ email, password: PW }); if (error) throw error; c.email = email; return c; }
let pass = 0, fail = 0; const check = (l, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${x ? "  — " + x : ""}`); };
const rpc = async (c, fn, a = {}) => { const { data, error } = await c.rpc(fn, a); return { data, err: error?.message }; };
const ok = (r) => !r.err;
const denied = (r) => r.err === "not_allowed";

const owner = await user("owner"); await admin.from("platform_admins").insert({ email: owner.email });
const founder = await user("founder"), author = await user("author"), viewer = await user("viewer"), ctrl = await user("ctrl"), qa = await user("qa");
const exFounder = await user("exfounder"), exViewer = await user("exviewer");
await rpc(owner, "admin_invite_company", { p_name: "Acme", p_email: founder.email, p_type: "manufacturer" });
await rpc(founder, "accept_invitation");
const acct = (await rpc(founder, "my_account")).data;
check("founder gets founder roles", JSON.stringify(acct.roles) === '["admin","author","doc_controller","qa_approver"]', JSON.stringify(acct.roles));
check("founder permissions include share/edit/users", ["documents.edit", "sharing.share", "users.manage", "audit.view"].every(p => acct.permissions.includes(p)), JSON.stringify(acct.permissions));

// Team invitations
check("invalid role for manufacturer rejected", (await rpc(founder, "invite_colleague", { p_email: author.email, p_roles: ["regulatory"] })).err === "invalid_role");
check("empty roles rejected", (await rpc(founder, "invite_colleague", { p_email: author.email, p_roles: [] })).err === "roles_required");
for (const [c, roles] of [[author, ["author"]], [viewer, ["viewer"]], [ctrl, ["doc_controller"]], [qa, ["qa_approver"]]]) {
  const r = await rpc(founder, "invite_colleague", { p_email: c.email, p_roles: roles });
  if (r.err) console.log("invite err", r.err);
  await rpc(c, "accept_invitation");
}
check("author joined with only author role", JSON.stringify((await rpc(author, "my_account")).data.roles) === '["author"]');
check("non-admin cannot invite colleagues", denied(await rpc(author, "invite_colleague", { p_email: `x-${tag}@t.test`, p_roles: ["viewer"] })));
check("non-admin cannot list team", denied(await rpc(viewer, "my_team")));
const team = (await rpc(founder, "my_team")).data;
check("admin sees 5 members", team.members.length === 5, String(team.members.length));

// Exporter connection by doc controller; data for share tests
const exp = await rpc(ctrl, "invite_exporter", { p_company: "Globex", p_email: exFounder.email });
check("doc controller can invite exporter", ok(exp), exp.err);
check("author cannot invite exporter", denied(await rpc(author, "invite_exporter", { p_company: "Y", p_email: `y-${tag}@t.test` })));
await rpc(exFounder, "accept_invitation");

// Author uploads; others can't
const f = await rpc(author, "create_folder", { p_parent: null, p_name: "Quality" });
check("author creates folder", ok(f), f.err);
check("viewer cannot create folder", denied(await rpc(viewer, "create_folder", { p_parent: null, p_name: "X" })));
check("doc controller cannot upload", denied(await rpc(ctrl, "reserve_upload", { p_folder: null, p_file_name: "a.pdf" })));
const r = (await rpc(author, "reserve_upload", { p_folder: f.data, p_file_name: "CoA.pdf" })).data;
await author.storage.from("documents").upload(r.storage_path, new Blob(["x"]));
check("author completes upload", ok(await rpc(author, "complete_upload", { p_version: r.version_id, p_size: 1, p_mime: "application/pdf" })));

// Sharing
check("author cannot share", denied(await rpc(author, "share_versions", { p_exporter: exp.data.org_id, p_items: [{ version_id: r.version_id, days: 30 }] })));
check("qa approver cannot share", denied(await rpc(qa, "share_versions", { p_exporter: exp.data.org_id, p_items: [{ version_id: r.version_id, days: 30 }] })));
check("doc controller shares", (await rpc(ctrl, "share_versions", { p_exporter: exp.data.org_id, p_items: [{ version_id: r.version_id, days: 30 }] })).data === 1);
const share = (await rpc(exFounder, "my_shared_documents")).data[0];
check("viewer cannot change duration", denied(await rpc(viewer, "set_share_duration", { p_share: share.share_id, p_days: 7 })));
check("viewer cannot revoke", denied(await rpc(viewer, "revoke_shares", { p_share_ids: [share.share_id] })));
check("doc controller cannot remove exporter", denied(await rpc(ctrl, "remove_exporter", { p_exporter: exp.data.org_id })));

// Audit visibility
check("viewer can read audit", ((await viewer.from("audit_log").select("id")).data ?? []).length > 0);
check("author cannot read audit", ((await author.from("audit_log").select("id")).data ?? []).length === 0);

// Exporter roles
const exAcct = (await rpc(exFounder, "my_account")).data;
check("exporter founder roles", JSON.stringify(exAcct.roles) === '["admin","regulatory"]', JSON.stringify(exAcct.roles));
await rpc(exFounder, "invite_colleague", { p_email: exViewer.email, p_roles: ["viewer"] });
await rpc(exViewer, "accept_invitation");
check("exporter viewer can view", ok(await rpc(exViewer, "record_document_access", { p_share: share.share_id, p_action: "view" })));
check("exporter viewer cannot download", denied(await rpc(exViewer, "record_document_access", { p_share: share.share_id, p_action: "download" })));
check("exporter viewer cannot create product", denied(await rpc(exViewer, "create_fpp", { p_name: "P", p_details: null })));
check("exporter founder downloads", ok(await rpc(exFounder, "record_document_access", { p_share: share.share_id, p_action: "download" })));
check("manufacturer role invalid for exporter", (await rpc(exFounder, "invite_colleague", { p_email: `z-${tag}@t.test`, p_roles: ["author"] })).err === "invalid_role");

// Role changes, last admin, deactivation
const viewerId = team.members.find(m => m.email === viewer.email).user_id;
const founderId = team.members.find(m => m.email === founder.email).user_id;
check("admin adds author role to viewer", ok(await rpc(founder, "set_member_roles", { p_user: viewerId, p_roles: ["viewer", "author"] })));
check("viewer can now create folder", ok(await rpc(viewer, "create_folder", { p_parent: null, p_name: "Regulatory" })));
check("admin removes author role again", ok(await rpc(founder, "set_member_roles", { p_user: viewerId, p_roles: ["viewer"] })));
check("viewer can no longer create folder", denied(await rpc(viewer, "create_folder", { p_parent: null, p_name: "Nope" })));
check("cannot remove last admin", (await rpc(founder, "set_member_roles", { p_user: founderId, p_roles: ["author"] })).err === "last_admin");
check("cannot deactivate self", (await rpc(founder, "set_member_active", { p_user: founderId, p_active: false })).err === "cannot_change_self");
const authorId = team.members.find(m => m.email === author.email).user_id;
check("deactivate author", ok(await rpc(founder, "set_member_active", { p_user: authorId, p_active: false })));
const deact = (await rpc(author, "my_account")).data;
check("deactivated user has no company or permissions", deact.org === null && deact.deactivated === true && deact.permissions.length === 0);
check("deactivated author cannot upload", denied(await rpc(author, "create_folder", { p_parent: null, p_name: "Z" })));
check("deactivated author sees no documents", ((await author.from("documents").select("id")).data ?? []).length === 0);
check("reactivate author", ok(await rpc(founder, "set_member_active", { p_user: authorId, p_active: true })));
check("reactivated author can upload again", ok(await rpc(author, "create_folder", { p_parent: null, p_name: "Again" })));

// Invitations
await rpc(founder, "invite_colleague", { p_email: `later-${tag}@t.test`, p_roles: ["viewer"] });
const pend = (await rpc(founder, "my_team")).data.invitations.find(i => i.email === `later-${tag}@t.test`);
check("pending invitation listed", !!pend && JSON.stringify(pend.roles) === '["viewer"]');
check("cancel invitation", ok(await rpc(founder, "cancel_invitation", { p_invitation: pend.id })));
const { data: audit } = await founder.from("audit_log").select("action, subject_name");
check("audit has role and deactivation events", ["member.role_added", "member.role_removed", "member.deactivated", "member.reactivated"].every(a => audit.some(x => x.action === a)), [...new Set(audit.map(a => a.action))].filter(a => a.startsWith("member")).join(","));
check("audit chain intact", (await rpc(owner, "verify_audit_chain")).data?.ok === true);
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
