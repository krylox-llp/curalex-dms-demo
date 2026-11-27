// Database / permission suite: 01-documents-and-sharing. Run all suites with `pnpm test:db` (see tests/README.md).
import { admin, createClient, env, PW, t } from "./lib.mjs";
if (!/^http:\/\/127\.0\.0\.1:/.test(env.API_URL)) throw new Error("not local");
async function user(email, name) {
  await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, user_metadata: { full_name: name } });
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-audit-reason": Buffer.from("automated test").toString("base64") } } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW }); if (error) throw error;
  return c;
}
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`); };
const rpc = async (c, fn, args) => { const { data, error } = await c.rpc(fn, args); return { data, err: error?.message }; };

const owner = await user(t("owner@curalex.test"), "Owner");
await admin.from("platform_admins").insert({ email: t("owner@curalex.test") });
const acme = await user(t("qa@acme.test"), "Ravi");
const beta = await user(t("qa@beta.test"), "Beta QA");
const globex = await user(t("docs@globex.test"), "Anita");

await rpc(owner, "admin_invite_company", { p_name: "Acme", p_email: t("qa@acme.test"), p_type: "manufacturer" });
await rpc(owner, "admin_invite_company", { p_name: "Beta", p_email: t("qa@beta.test"), p_type: "manufacturer" });
for (const c of [acme, beta]) await rpc(c, "accept_invitation", {});
const inv = await rpc(acme, "invite_exporter", { p_company: "Globex", p_email: t("docs@globex.test") });
await rpc(globex, "accept_invitation", {});
const globexOrg = inv.data.org_id;

// Folders
const q = await rpc(acme, "create_folder", { p_parent: null, p_name: "Quality" });
check("create root folder", !q.err && q.data, q.err);
const coa = await rpc(acme, "create_folder", { p_parent: q.data, p_name: "CoA & Reports" });
check("create sub folder", !coa.err, coa.err);
check("duplicate folder rejected (case-insensitive)", (await rpc(acme, "create_folder", { p_parent: null, p_name: "quality" })).err === "folder_exists");
check("folder name with / rejected", (await rpc(acme, "create_folder", { p_parent: null, p_name: "a/b" })).err === "invalid_name");
check("exporter cannot create folder", (await rpc(globex, "create_folder", { p_parent: null, p_name: "X" })).err === "not_allowed");
check("beta cannot create folder inside acme folder", (await rpc(beta, "create_folder", { p_parent: q.data, p_name: "X" })).err === "not_found");

// Upload v1 + v2 of same name
async function upload(c, folder, name, body) {
  const r = await rpc(c, "reserve_upload", { p_folder: folder, p_file_name: name });
  if (r.err) return { err: r.err };
  const up = await c.storage.from("documents").upload(r.data.storage_path, new Blob([body], { type: "application/pdf" }), { contentType: "application/pdf" });
  if (up.error) return { err: "storage: " + up.error.message, reserved: r.data };
  const done = await rpc(c, "complete_upload", { p_version: r.data.version_id, p_size: body.length, p_mime: "application/pdf" });
  return { ...r.data, err: done.err };
}
const v1 = await upload(acme, coa.data, "CoA Paracetamol 500mg (Batch #12).pdf", "v1 bytes");
check("upload v1", !v1.err && v1.version === 1, v1.err ?? v1.storage_path);
const v2 = await upload(acme, coa.data, "coa paracetamol 500mg (batch #12).pdf", "v2 bytes!!");
check("same name (any case) becomes v2", !v2.err && v2.version === 2 && v2.document_id === v1.document_id, v2.storage_path);
const rootFile = await upload(acme, null, "WHO-GMP.pdf", "gmp");
check("upload at top level", !rootFile.err, rootFile.storage_path);

// Storage access rules
const r1 = await rpc(acme, "reserve_upload", { p_folder: null, p_file_name: "sneaky.pdf" });
const wrongPath = await acme.storage.from("documents").upload(`${r1.data.storage_path}.evil`, new Blob(["x"]));
check("cannot upload to an unreserved path", !!wrongPath.error, wrongPath.error?.message);
const otherOrg = await beta.storage.from("documents").upload(r1.data.storage_path, new Blob(["x"]));
check("other manufacturer cannot upload to acme's reserved path", !!otherOrg.error, otherOrg.error?.message);
check("complete_upload fails when file not uploaded", (await rpc(acme, "complete_upload", { p_version: r1.data.version_id, p_size: 1, p_mime: "x" })).err === "file_missing");
const dl = await acme.storage.from("documents").download(v2.storage_path);
check("acme downloads own v2", !dl.error && (await dl.data.text()) === "v2 bytes!!");
check("beta cannot download acme file", !!(await beta.storage.from("documents").download(v2.storage_path)).error);
check("exporter cannot download directly from storage", !!(await globex.storage.from("documents").download(v2.storage_path)).error);
const signed = await globex.storage.from("documents").createSignedUrl(v2.storage_path, 60);
check("exporter cannot create signed URL", !!signed.error);

// RLS reads
const { data: acmeDocs } = await acme.from("documents").select("name, document_versions(version,status)");
check("acme sees its documents", acmeDocs?.length === 3, JSON.stringify(acmeDocs?.map(d => d.name)));
const { data: betaDocs } = await beta.from("documents").select("id");
check("beta sees none of acme's documents", betaDocs?.length === 0);
const { data: fp } = await acme.rpc("folder_path", { p_folder: coa.data });
check("folder_path", fp === "Quality/CoA & Reports", fp);

// Sharing
check("share requires a linked exporter", (await rpc(beta, "share_versions", { p_exporter: globexOrg, p_items: [{ version_id: v2.version_id, days: 30 }] })).err === "not_your_exporter");
check("cannot share a pending version", (await rpc(acme, "share_versions", { p_exporter: globexOrg, p_items: [{ version_id: r1.data.version_id, days: 30 }] })).err === "not_found");
check("invalid duration rejected", (await rpc(acme, "share_versions", { p_exporter: globexOrg, p_items: [{ version_id: v2.version_id, days: 0 }] })).err === "invalid_duration");
const sh = await rpc(acme, "share_versions", { p_exporter: globexOrg, p_items: [{ version_id: v2.version_id, days: 30 }, { version_id: rootFile.version_id, days: null }] });
check("share 2 files", sh.data === 2, sh.err);
const again = await rpc(acme, "share_versions", { p_exporter: globexOrg, p_items: [{ version_id: v2.version_id, days: 7 }] });
const { data: shares } = await acme.from("document_shares").select("id, expires_at, revoked_at, version_id").is("revoked_at", null);
check("re-share updates expiry instead of duplicating", again.data === 1 && shares.length === 2);
const v2share = shares.find(s => s.version_id === v2.version_id);
const days = (new Date(v2share.expires_at) - Date.now()) / 86400000;
check("expiry ~7 days after re-share", days > 6.9 && days < 7.1, days.toFixed(2));
check("no-expiry share has null expires_at", shares.find(s => s.version_id === rootFile.version_id).expires_at === null);
const { data: gShares } = await globex.from("document_shares").select("id");
check("exporter can see shares given to it", gShares?.length === 2);
check("beta cannot change acme share duration", (await rpc(beta, "set_share_duration", { p_share: v2share.id, p_days: 90 })).err === "not_found");
check("acme sets duration to 90 days", !(await rpc(acme, "set_share_duration", { p_share: v2share.id, p_days: 90 })).err);
check("beta revoking acme shares revokes 0", (await rpc(beta, "revoke_shares", { p_share_ids: shares.map(s => s.id) })).data === 0);
check("acme revokes one", (await rpc(acme, "revoke_shares", { p_share_ids: [v2share.id] })).data === 1);
check("acme revoke-all revokes remaining one", (await rpc(acme, "revoke_shares", { p_share_ids: shares.map(s => s.id) })).data === 1);
const re = await rpc(acme, "share_versions", { p_exporter: globexOrg, p_items: [{ version_id: v2.version_id, days: 30 }] });
check("can share again after revoke", re.data === 1, re.err);

// anon
const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
check("anon cannot create folder", (await rpc(anon, "create_folder", { p_parent: null, p_name: "x" })).err === "not_allowed");
check("anon cannot revoke", (await rpc(anon, "revoke_shares", { p_share_ids: [v2share.id] })).err === "not_allowed");
check("anon reads no documents", ((await anon.from("documents").select("id")).data ?? []).length === 0);

// ---- Delete ----
const exists = async (path) => { const dir = path.split("/").slice(0, -1).join("/"); const { data } = await admin.storage.from("documents").list(dir); return !!data?.some(o => o.name === path.split("/").pop()); };
const v3 = await upload(acme, coa.data, "CoA Paracetamol 500mg (Batch #12).pdf", "v3");
await rpc(acme, "share_versions", { p_exporter: globexOrg, p_items: [{ version_id: v3.version_id, days: 30 }] });
const imp = await rpc(acme, "delete_impact", { p_document_ids: null, p_folder: null, p_version: v3.version_id });
check("delete_impact for a shared version", imp.data?.versions === 1 && imp.data?.live_shares === 1 && imp.data?.exporters === 1, JSON.stringify(imp.data));
check("beta cannot delete acme version", (await rpc(beta, "delete_version", { p_version: v3.version_id })).err === "not_found");
check("beta calling _delete_versions directly does nothing", JSON.stringify((await rpc(beta, "_delete_versions", { p_version_ids: [v3.version_id] })).data) === "[]");
const dv = await rpc(acme, "delete_version", { p_version: v3.version_id });
check("delete one version returns its path", dv.data?.length === 1 && dv.data[0] === v3.storage_path, JSON.stringify(dv.data));
const rm = await acme.storage.from("documents").remove(dv.data);
check("storage remove allowed for deleted version", !rm.error && rm.data?.length === 1, rm.error?.message);
check("file gone from storage", !(await exists(v3.storage_path)));
check("v1 still in storage", await exists(v1.storage_path));
const { data: liveV3 } = await acme.from("document_shares").select("id").eq("version_id", v3.version_id).is("revoked_at", null);
check("share of deleted version revoked", liveV3.length === 0);
const { data: verAfter } = await acme.from("document_versions").select("version").eq("document_id", v1.document_id).order("version");
check("deleted version hidden; v1,v2 remain", JSON.stringify(verAfter.map(v => v.version)) === "[1,2]", JSON.stringify(verAfter));
const v4 = await upload(acme, coa.data, "CoA Paracetamol 500mg (Batch #12).pdf", "v4");
check("version numbers not reused (next is v4)", v4.version === 4, String(v4.version));
check("cannot remove storage of a live version", ((await acme.storage.from("documents").remove([v1.storage_path])).data ?? []).length === 0 && await exists(v1.storage_path));
check("cannot share a deleted version", (await rpc(acme, "share_versions", { p_exporter: globexOrg, p_items: [{ version_id: v3.version_id, days: 30 }] })).err === "not_found");

const fimp = await rpc(acme, "delete_impact", { p_document_ids: null, p_folder: q.data, p_version: null });
check("folder impact counts sub folders and files", fimp.data?.folders === 2 && fimp.data?.files === 1, JSON.stringify(fimp.data));
const df = await rpc(acme, "delete_folder", { p_folder: q.data });
check("delete folder returns all live version paths (v1,v2,v4)", df.data?.length === 3, String(df.data?.length));
await acme.storage.from("documents").remove(df.data);
check("folder files gone from storage", !(await exists(v1.storage_path)) && !(await exists(v2.storage_path)));
const { data: foldersAfter } = await acme.from("folders").select("name");
check("deleted folders hidden", foldersAfter.length === 0, JSON.stringify(foldersAfter));
check("can recreate folder with same name", !(await rpc(acme, "create_folder", { p_parent: null, p_name: "Quality" })).err);
check("cannot upload into deleted folder", (await rpc(acme, "reserve_upload", { p_folder: coa.data, p_file_name: "x.pdf" })).err === "not_found");

const dd = await rpc(acme, "delete_documents", { p_document_ids: [rootFile.document_id] });
check("delete file (all versions)", dd.data?.length === 1, JSON.stringify(dd.data));
const re2 = await upload(acme, null, "WHO-GMP.pdf", "new");
check("same name after delete starts a fresh file at v1", re2.version === 1 && re2.document_id !== rootFile.document_id, re2.err ?? re2.storage_path);
const { data: allShares } = await acme.from("document_shares").select("revoked_at");
check("all shares of deleted items revoked", allShares.every(s => s.revoked_at), String(allShares.length));

const { data: objs } = await admin.storage.from("documents").list(`${v1.storage_path.split("/")[0]}/Quality/CoA & Reports/CoA Paracetamol 500mg (Batch _12).pdf`);
console.log("storage tree:", objs?.map(o => o.name).join(", "), "| path:", v1.storage_path.split("/").slice(1).join("/"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
