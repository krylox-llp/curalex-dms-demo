// Database / permission suite: 07-document-details. Run all suites with `pnpm test:db` (see tests/README.md).
import { admin, createClient, env, PW, tag } from "./lib.mjs";

const H = { "x-audit-reason": Buffer.from("test").toString("base64") };
async function user(name) {
  const email = `${name}-${tag}@t.test`;
  await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false }, global: { headers: H } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw error;
  c.email = email;
  return c;
}
let pass = 0, fail = 0;
const check = (l, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${x ? "  — " + x : ""}`); };
const rpc = async (c, fn, a = {}) => { const { data, error } = await c.rpc(fn, a); return { data, err: error?.message }; };

const owner = await user("owner"); await admin.from("platform_admins").insert({ email: owner.email });
const m1 = await user("m1"), m2 = await user("m2"), e1 = await user("e1"), viewer = await user("viewer");
await rpc(owner, "admin_invite_company", { p_name: "Maker", p_email: m1.email, p_type: "manufacturer" });
await rpc(owner, "admin_invite_company", { p_name: "Other", p_email: m2.email, p_type: "manufacturer" });
await rpc(m1, "accept_invitation"); await rpc(m2, "accept_invitation");
const ex = (await rpc(m1, "invite_exporter", { p_company: "Exp", p_email: e1.email })).data;
await rpc(e1, "accept_invitation");
await rpc(m1, "invite_colleague", { p_email: viewer.email, p_roles: ["viewer"] });
await rpc(viewer, "accept_invitation");

const r = (await rpc(m1, "reserve_upload", { p_folder: null, p_file_name: "CoPP - Kenya.pdf" })).data;
await m1.storage.from("documents").upload(r.storage_path, new Blob(["x"]));
await rpc(m1, "complete_upload", { p_version: r.version_id, p_size: 1, p_mime: "application/pdf" });
const { data: docRow } = await m1.from("documents").select("id").eq("name", "CoPP - Kenya.pdf").single();
const doc = docRow.id;

const details = {
  doc_type: "copp", product: "  Paracetamol 500 mg Tablets ", market: "Kenya", issued_by: "CDSCO",
  reference_no: "CoPP/2024/1187", issue_date: "2024-12-10", expiry_date: "2026-12-09",
};
check("author sets details", !(await rpc(m1, "set_document_details", { p_document: doc, p_details: details })).err);
const { data: saved } = await m1.from("documents").select("doc_type, product, market, issued_by, reference_no, issue_date, expiry_date").eq("id", doc).single();
check("details stored and trimmed", saved.product === "Paracetamol 500 mg Tablets" && saved.expiry_date === "2026-12-09" && saved.doc_type === "copp", JSON.stringify(saved));

check("viewer cannot edit details", (await rpc(viewer, "set_document_details", { p_document: doc, p_details: details })).err === "not_allowed");
check("viewer can read details", (await viewer.from("documents").select("product").eq("id", doc).single()).data?.product === "Paracetamol 500 mg Tablets");
check("other manufacturer cannot edit", (await rpc(m2, "set_document_details", { p_document: doc, p_details: details })).err === "not_found");
check("other manufacturer cannot read", ((await m2.from("documents").select("id").eq("id", doc)).data ?? []).length === 0);
check("exporter cannot edit", (await rpc(e1, "set_document_details", { p_document: doc, p_details: details })).err === "not_allowed");
check("unknown type rejected", (await rpc(m1, "set_document_details", { p_document: doc, p_details: { ...details, doc_type: "invoice" } })).err === "invalid_details");
check("bad date rejected", (await rpc(m1, "set_document_details", { p_document: doc, p_details: { ...details, expiry_date: "31-12-2026" } })).err === "invalid_date");
check("expiry before issue rejected", (await rpc(m1, "set_document_details", { p_document: doc, p_details: { ...details, issue_date: "2027-01-01" } })).err === "expiry_before_issue");
check("non-object rejected", (await rpc(m1, "set_document_details", { p_document: doc, p_details: [] })).err === "invalid_details");

const { data: audit } = await admin.from("audit_log").select("action, old_data, new_data, changed_fields").eq("subject_document_id", doc).eq("action", "document.updated");
check("details change audited with old and new values", (audit ?? []).some((a) => a.new_data?.expiry_date === "2026-12-09" && a.old_data?.expiry_date === null), JSON.stringify(audit?.[0] ?? null));

// Exporter sees type, product, expiry and the latest version number with shared documents
await rpc(m1, "share_versions", { p_exporter: ex.org_id, p_items: [{ version_id: r.version_id, days: 30 }] });
const r2 = (await rpc(m1, "reserve_upload", { p_folder: null, p_file_name: "CoPP - Kenya.pdf" })).data;
await m1.storage.from("documents").upload(r2.storage_path, new Blob(["y"]));
await rpc(m1, "complete_upload", { p_version: r2.version_id, p_size: 1, p_mime: "application/pdf" });
const shared = (await rpc(e1, "my_shared_documents")).data ?? [];
check("exporter sees details on shared document", shared[0]?.doc_type === "copp" && shared[0]?.product === "Paracetamol 500 mg Tablets" && shared[0]?.document_expiry === "2026-12-09", JSON.stringify(shared[0]));
check("exporter sees a newer version exists", shared[0]?.version === 1 && shared[0]?.latest_version === 2);

check("clearing details works", !(await rpc(m1, "set_document_details", { p_document: doc, p_details: {} })).err && (await m1.from("documents").select("product").eq("id", doc).single()).data?.product === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
