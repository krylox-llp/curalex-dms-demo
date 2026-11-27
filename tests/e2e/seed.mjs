// Seeds the local database for the e2e smoke test and saves browser sessions to tests/e2e/.state.
// Two manufacturers share documents with one exporter, who groups them into a product.
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { admin, createClient, env, PW, t } from "../db/lib.mjs";
import { STATE } from "./browser.mjs";

const req = createRequire(fileURLToPath(new URL("../../package.json", import.meta.url)));
const { createServerClient } = req("@supabase/ssr");

const people = {
  admin: [t("owner@curalex.test"), "Priya Owner"],
  manufacturer: [t("qa@sarovan.test"), "Ravi Kumar"],
  manufacturer2: [t("qa@betalabs.test"), "Meera Iyer"],
  exporter: [t("docs@tarangini.test"), "Anita Shah"],
};

const sessions = {}, clients = {};
for (const [key, [email, name]] of Object.entries(people)) {
  const { error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  const jar = new Map();
  const ssr = createServerClient(env.API_URL, env.ANON_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach(({ name, value }) => jar.set(name, value)) },
  });
  await ssr.auth.signInWithPassword({ email, password: PW });
  sessions[key] = { email, cookies: [...jar].map(([name, value]) => ({ name, value })) };
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: PW });
  clients[key] = c;
}
const rpc = async (c, fn, a = {}) => { const { data, error } = await c.rpc(fn, a); if (error) throw new Error(`${fn}: ${error.message}`); return data; };

await admin.from("platform_admins").insert({ email: people.admin[0] });
await rpc(clients.admin, "admin_invite_company", { p_name: "Sarovan Lifesciences Pvt Ltd", p_email: people.manufacturer[0], p_type: "manufacturer" });
await rpc(clients.admin, "admin_invite_company", { p_name: "Beta Labs API Pvt Ltd", p_email: people.manufacturer2[0], p_type: "manufacturer" });
await rpc(clients.manufacturer, "accept_invitation"); await rpc(clients.manufacturer2, "accept_invitation");
const exporter = await rpc(clients.manufacturer, "invite_exporter", { p_company: "Tarangini Pharma Exports LLP", p_email: people.exporter[0] });
await rpc(clients.manufacturer2, "invite_exporter", { p_company: "Tarangini", p_email: people.exporter[0] });
await rpc(clients.exporter, "accept_invitation");

const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function shareFile(c, name, days, details) {
  const r = await rpc(c, "reserve_upload", { p_folder: null, p_file_name: name });
  const up = await c.storage.from("documents").upload(r.storage_path, new Blob([`%PDF-1.4 ${name}`], { type: "application/pdf" }), { contentType: "application/pdf" });
  if (up.error) throw up.error;
  await rpc(c, "complete_upload", { p_version: r.version_id, p_size: name.length, p_mime: "application/pdf" });
  await rpc(c, "share_versions", { p_exporter: exporter.org_id, p_items: [{ version_id: r.version_id, days }] });
  if (details) {
    const { data } = await c.from("documents").select("id").eq("name", name).single();
    await rpc(c, "set_document_details", { p_document: data.id, p_details: details });
  }
}
await shareFile(clients.manufacturer, "CoA - Paracetamol 500mg Tablets.pdf", 30, { doc_type: "coa", product: "Paracetamol 500 mg Tablets", reference_no: "B2211" });
await shareFile(clients.manufacturer, "WHO-GMP Certificate.pdf", 5, { doc_type: "gmp", issued_by: "CDSCO", issue_date: inDays(-1060), expiry_date: inDays(35) });
await shareFile(clients.manufacturer, "CoPP - Kenya.pdf", 365, { doc_type: "copp", product: "Paracetamol 500 mg Tablets", market: "Kenya", issued_by: "CDSCO, New Delhi", reference_no: "CDSCO/CoPP/2024/1187", issue_date: inDays(-718), expiry_date: inDays(12) });
await shareFile(clients.manufacturer2, "API DMF - Paracetamol.pdf", 90, { doc_type: "dmf", product: "Paracetamol API" });
await shareFile(clients.manufacturer2, "API CoA Batch 2211.pdf", null);

const product = await rpc(clients.exporter, "create_fpp", { p_name: "Paracetamol 500 mg Tablets", p_details: "Kenya" });
for (const m of await rpc(clients.exporter, "my_manufacturer_options"))
  await rpc(clients.exporter, "add_fpp_manufacturer", { p_fpp: product, p_manufacturer: m.org_id, p_role: m.name.startsWith("Beta") ? "api" : "finished_product" });
await rpc(clients.exporter, "add_fpp_documents", { p_fpp: product, p_share_ids: (await rpc(clients.exporter, "my_shared_documents")).map((d) => d.share_id) });

fs.mkdirSync(STATE, { recursive: true });
fs.writeFileSync(`${STATE}sessions.json`, JSON.stringify(sessions));
console.log("seeded: 2 manufacturers, 1 exporter, 5 shared files, 1 product");
