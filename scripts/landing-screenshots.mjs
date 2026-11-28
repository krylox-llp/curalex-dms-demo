// Regenerates the landing page screenshots in public/landing/.
//
// Usage (local stack only):
//   supabase start && supabase db reset          # needs an EMPTY database (fixed demo emails)
//   pnpm build && pnpm start -p 3125             # with the local Supabase env vars
//   node scripts/landing-screenshots.mjs [http://localhost:3125]
//
// Seeds fictional companies (Sarovan Lifesciences, Beta Labs API, Tarangini Pharma Exports,
// Meditrade Global) with folders, documents, details, shares, a product, team members and
// exporter activity, then captures each screen at 2x resolution.
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { admin, createClient, env, PW } from "../tests/db/lib.mjs";
import { STATE, withBrowser } from "../tests/e2e/browser.mjs";

const BASE = process.argv[2] || "http://localhost:3125";
const OUT = fileURLToPath(new URL("../public/landing/", import.meta.url));
const req = createRequire(fileURLToPath(new URL("../package.json", import.meta.url)));
const { createServerClient } = req("@supabase/ssr");
const H = { "x-audit-reason": Buffer.from("Superseded by new certificate").toString("base64") };

const people = {
  admin: ["owner@curalex.test", "Platform Owner"],
  ravi: ["ravi@sarovan.test", "Ravi Kumar"],
  priya: ["priya@sarovan.test", "Priya Nair"],
  arjun: ["arjun@sarovan.test", "Arjun Rao"],
  meera: ["meera@betalabs.test", "Meera Iyer"],
  anita: ["anita@tarangini.test", "Anita Shah"],
  karan: ["karan@meditrade.test", "Karan Mehta"],
};
const sessions = {}, c = {};
for (const [key, [email, name]] of Object.entries(people)) {
  const { error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw new Error(`${email}: ${error.message} (run on an empty database: supabase db reset)`);
  const jar = new Map();
  const ssr = createServerClient(env.API_URL, env.ANON_KEY, {
    cookies: { getAll: () => [...jar].map(([n, v]) => ({ name: n, value: v })), setAll: (cs) => cs.forEach(({ name: n, value: v }) => jar.set(n, v)) },
  });
  await ssr.auth.signInWithPassword({ email, password: PW });
  sessions[key] = { email, cookies: [...jar].map(([n, v]) => ({ name: n, value: v })) };
  c[key] = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false }, global: { headers: H } });
  await c[key].auth.signInWithPassword({ email, password: PW });
}
const rpc = async (cl, fn, a = {}) => { const { data, error } = await cl.rpc(fn, a); if (error) throw new Error(`${fn}: ${error.message}`); return data; };
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// Companies and people
await admin.from("platform_admins").insert({ email: people.admin[0] });
await rpc(c.admin, "admin_invite_company", { p_name: "Sarovan Lifesciences Pvt Ltd", p_email: people.ravi[0], p_type: "manufacturer" });
await rpc(c.admin, "admin_invite_company", { p_name: "Beta Labs API Pvt Ltd", p_email: people.meera[0], p_type: "manufacturer" });
await rpc(c.ravi, "accept_invitation"); await rpc(c.meera, "accept_invitation");
await rpc(c.ravi, "invite_colleague", { p_email: people.priya[0], p_roles: ["author"] });
await rpc(c.ravi, "invite_colleague", { p_email: people.arjun[0], p_roles: ["viewer"] });
await rpc(c.priya, "accept_invitation"); await rpc(c.arjun, "accept_invitation");
const tarangini = await rpc(c.ravi, "invite_exporter", { p_company: "Tarangini Pharma Exports LLP", p_email: people.anita[0] });
const meditrade = await rpc(c.ravi, "invite_exporter", { p_company: "Meditrade Global", p_email: people.karan[0] });
await rpc(c.meera, "invite_exporter", { p_company: "Tarangini Pharma Exports LLP", p_email: people.anita[0] });
await rpc(c.anita, "accept_invitation"); await rpc(c.karan, "accept_invitation");

// Folders and documents
const folder = async (cl, name, parent = null) => rpc(cl, "create_folder", { p_parent: parent, p_name: name });
async function upload(cl, folderId, name, details) {
  const r = await rpc(cl, "reserve_upload", { p_folder: folderId, p_file_name: name });
  const body = new Blob([`%PDF-1.4\n% ${name}\n`.padEnd(180_000 + Math.floor(Math.random() * 400_000), " ")], { type: "application/pdf" });
  const up = await cl.storage.from("documents").upload(r.storage_path, body, { contentType: "application/pdf" });
  if (up.error) throw up.error;
  await rpc(cl, "complete_upload", { p_version: r.version_id, p_size: body.size, p_mime: "application/pdf" });
  if (details) {
    let q = cl.from("documents").select("id").eq("name", name);
    q = folderId ? q.eq("folder_id", folderId) : q.is("folder_id", null);
    const { data } = await q.single();
    await rpc(cl, "set_document_details", { p_document: data.id, p_details: details });
  }
  return r.version_id;
}
const pick = (data) => (typeof data === "string" ? data : data?.id ?? data?.folder_id ?? data);
const quality = pick(await folder(c.ravi, "Quality"));
const certificates = pick(await folder(c.ravi, "Certificates", quality));
const coas = pick(await folder(c.ravi, "CoA", quality));
const regulatory = pick(await folder(c.ravi, "Regulatory"));
await folder(c.ravi, "Production");

const v = {};
v.gmp = await upload(c.ravi, certificates, "WHO-GMP Certificate.pdf", { doc_type: "gmp", issued_by: "CDSCO, New Delhi", reference_no: "WHO-GMP/MH/2023/0412", issue_date: inDays(-1060), expiry_date: inDays(35) });
v.coppKe = await upload(c.ravi, certificates, "CoPP - Kenya.pdf", { doc_type: "copp", product: "Paracetamol 500 mg Tablets", market: "Kenya", issued_by: "CDSCO, New Delhi", reference_no: "CDSCO/CoPP/2024/1187", issue_date: inDays(-718), expiry_date: inDays(12) });
await upload(c.ravi, certificates, "CoPP - Nigeria.pdf", { doc_type: "copp", product: "Amoxicillin 250 mg Capsules", market: "Nigeria", issued_by: "CDSCO, New Delhi", issue_date: inDays(-680), expiry_date: inDays(48) });
v.coppNg = await upload(c.priya, certificates, "CoPP - Nigeria.pdf");
v.licence = await upload(c.ravi, certificates, "Manufacturing Licence - Form 25.pdf", { doc_type: "licence", issued_by: "FDA Maharashtra", reference_no: "KD/1187", expiry_date: inDays(65) });
v.iso = await upload(c.ravi, certificates, "ISO 9001 Certificate.pdf", { doc_type: "iso", issued_by: "TÜV SÜD", expiry_date: inDays(240) });
v.coaPara1 = await upload(c.ravi, coas, "CoA - Paracetamol 500mg Tablets.pdf", { doc_type: "coa", product: "Paracetamol 500 mg Tablets", reference_no: "Batch PT2211" });
v.coaAmox = await upload(c.priya, coas, "CoA - Amoxicillin 250mg Capsules.pdf", { doc_type: "coa", product: "Amoxicillin 250 mg Capsules", reference_no: "Batch AX1187" });
v.stability = await upload(c.priya, regulatory, "Stability Data - Paracetamol 500mg.pdf", { doc_type: "stability", product: "Paracetamol 500 mg Tablets", market: "Kenya" });
await upload(c.priya, regulatory, "Product Specification - Paracetamol.pdf", { doc_type: "specification", product: "Paracetamol 500 mg Tablets" });
await upload(c.ravi, null, "Site Master File.pdf", { doc_type: "other" });
const dmf = await upload(c.meera, null, "API DMF - Paracetamol (Open Part).pdf", { doc_type: "dmf", product: "Paracetamol API" });
const apiCoa = await upload(c.meera, null, "API CoA Batch 2211.pdf", { doc_type: "coa", product: "Paracetamol API", reference_no: "Batch 2211" });

// Shares
await rpc(c.ravi, "share_versions", { p_exporter: tarangini.org_id, p_items: [
  { version_id: v.coppKe, days: 365 }, { version_id: v.gmp, days: 5 }, { version_id: v.coaPara1, days: 90 },
  { version_id: v.stability, days: 180 }, { version_id: v.licence, days: 365 },
] });
await rpc(c.ravi, "share_versions", { p_exporter: meditrade.org_id, p_items: [
  { version_id: v.gmp, days: 30 }, { version_id: v.coppNg, days: 365 }, { version_id: v.iso, days: null }, { version_id: v.coaAmox, days: 90 },
] });
await rpc(c.meera, "share_versions", { p_exporter: tarangini.org_id, p_items: [{ version_id: dmf, days: 365 }, { version_id: apiCoa, days: null }] });
// A newer CoA after sharing: Tarangini now holds an older version.
await upload(c.priya, coas, "CoA - Paracetamol 500mg Tablets.pdf");

// Exporter product
const product = await rpc(c.anita, "create_fpp", { p_name: "Paracetamol 500 mg Tablets", p_details: "Kenya · renewal due Feb 2027" });
for (const m of await rpc(c.anita, "my_manufacturer_options"))
  await rpc(c.anita, "add_fpp_manufacturer", { p_fpp: product, p_manufacturer: m.org_id, p_role: m.name.startsWith("Beta") ? "api" : "finished_product" });
await rpc(c.anita, "add_fpp_documents", { p_fpp: product, p_share_ids: (await rpc(c.anita, "my_shared_documents")).map((d) => d.share_id) });

// Exporter activity
for (const [who, actions] of [["karan", ["view", "view", "download"]], ["anita", ["view", "download", "view", "download", "download"]]]) {
  const docs = await rpc(c[who], "my_shared_documents");
  for (const [i, action] of actions.entries()) await rpc(c[who], "record_document_access", { p_share: docs[i % docs.length].share_id, p_action: action });
}

fs.mkdirSync(STATE, { recursive: true });
fs.writeFileSync(`${STATE}sessions.json`, JSON.stringify(sessions));
fs.mkdirSync(OUT, { recursive: true });
console.log("seeded demo data");

// Screenshots
const visibleLink = (text) => `[...document.querySelectorAll('a')].find(a => a.offsetParent && a.textContent.includes(${JSON.stringify(text)}))`;
await withBrowser(BASE, async (b) => {
  const shot = async (name) => {
    await b.sleep(600);
    await b.shot(name);
    fs.copyFileSync(`${STATE}${name}.png`, `${OUT}${name}.png`);
    console.log("captured", name);
  };
  await b.as("ravi");
  await b.go("/manufacturer"); await shot("manufacturer-overview");
  await b.go(`/manufacturer/documents?folder=${certificates}`);
  await b.click(visibleLink("CoPP - Kenya")); await b.sleep(1200); await shot("documents-details");
  await b.go(`/manufacturer/share?v=${v.coaAmox},${v.stability}&to=${tarangini.org_id}`); await shot("share");
  await b.go(`/manufacturer/shared/${tarangini.org_id}`); await shot("exporter-access");
  await b.go("/manufacturer/audit"); await shot("audit-trail");
  await b.go("/manufacturer/team"); await shot("team-roles");
  await b.as("anita");
  await b.go("/exporter"); await shot("exporter-overview");
  await b.go("/exporter/shared"); await b.click(visibleLink("Sarovan")); await b.sleep(1200); await shot("exporter-documents");
}, { scale: 2 });
console.log(`screenshots written to ${OUT}`);
