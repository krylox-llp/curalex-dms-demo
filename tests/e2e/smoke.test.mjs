// Browser smoke test: the main screens, menus, dialogs, and the secure download route.
import { visible, withBrowser } from "./browser.mjs";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3125";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`); };
const rowsText = `[...document.querySelectorAll('tbody tr')].filter(e => e.offsetParent !== null).map(r => r.innerText.replace(/\\s+/g, ' ').trim())`;
const openPopovers = "[...document.querySelectorAll('[popover]')].filter(p => p.matches(':popover-open')).length";

await withBrowser(BASE, async (b) => {
  // Manufacturer
  await b.as("manufacturer");
  check("manufacturer lands on Overview", (await b.go("/")) === "/manufacturer");
  const sidebar = await b.eval(`[...document.querySelectorAll('nav[aria-label="Workspace"] a')].filter(a => a.offsetParent !== null).map(a => a.textContent.replace(/\\d+$/, '').trim()).join('|')`);
  check("sidebar links", sidebar === "Overview|Documents|Shared with|Audit trail|Team", sidebar);
  check("overview flags the CoPP expiring in 12 days", (await b.eval("document.body.innerText")).includes("CoPP - Kenya.pdf expires"));
  await b.go("/manufacturer/documents");
  check("three files listed", (await b.eval(`${rowsText}.length`)) === 3);
  check("type and expiry shown", (await b.eval(`${rowsText}.join(' ')`)).includes("CoPP") && /\b1[12] days\b/.test(await b.eval(`${rowsText}.join(' ')`)));
  await b.click(visible("a", "CoPP - Kenya"));
  await b.sleep(1200);
  check("details panel opens", (await b.eval(`document.querySelector('aside[aria-label^="Details of"] h2')?.textContent`)) === "CoPP - Kenya.pdf");
  await b.go("/manufacturer/documents?expiry=30");
  check("expiry filter finds 1 document", (await b.eval(`${rowsText}.length`)) === 1);
  await b.go("/manufacturer/search?q=paracetamol");
  check("search finds documents", (await b.eval("document.body.innerText")).includes("CoA - Paracetamol 500mg Tablets.pdf"));

  await b.go("/manufacturer/shared");
  check("exporter listed under Shared with", (await b.eval(`${rowsText}.join(' ')`)).includes("Tarangini Pharma Exports LLP"));
  await b.click(visible("a", "Tarangini"));
  await b.sleep(1200);
  check("exporter page lists 3 shares", (await b.eval(`${rowsText}.length`)) === 3);

  // Row menu with the keyboard
  await b.eval(`${visible('[aria-label^="Actions for CoA"]')}.focus()`);
  await b.key("Enter");
  check("Enter opens the row menu and focuses the first item", (await b.eval(openPopovers)) === 1 && (await b.eval("document.activeElement.textContent")) === "7 days");
  await b.key("Escape");
  check("Escape closes the menu and returns focus", (await b.eval(openPopovers)) === 0 && (await b.eval("document.activeElement.getAttribute('aria-label')"))?.startsWith("Actions for CoA"));

  // Revoke requires a reason
  await b.click(visible('[aria-label^="Actions for WHO"]'));
  await b.click(visible("[popover] button", "Revoke access"));
  await b.sleep(400);
  check("revoke dialog opens with Cancel focused", (await b.eval("document.activeElement.textContent")) === "Cancel");
  check("revoke disabled without a reason", (await b.eval(`[...document.querySelectorAll('dialog[open] button')].find(x => x.textContent === 'Revoke access').disabled`)) === true);
  await b.key("Escape");

  // Exporter
  await b.as("exporter");
  check("exporter lands on Overview", (await b.go("/")) === "/exporter");
  check("product readiness lists the product", (await b.eval(`${rowsText}.join(' ')`)).includes("Paracetamol 500 mg Tablets"));
  await b.click(visible("a", "Paracetamol"));
  await b.sleep(1500);
  check("product shows both manufacturers", (await b.eval(`[...document.querySelectorAll('section h2')].filter(h => h.offsetParent !== null).length`)) === 2);
  const href = await b.eval(`${visible('a[href$="/download"]')}.getAttribute('href')`);
  const dl = await b.eval(`fetch(${JSON.stringify(href)}).then(async r => ({ status: r.status, host: new URL(r.url).host, body: (await r.text()).slice(0, 8) }))`);
  check("download goes through the secure route to storage", dl.status === 200 && dl.body === "%PDF-1.4", JSON.stringify(dl));
  check("unknown share is refused", (await b.eval("fetch('/documents/00000000-0000-0000-0000-000000000000/view').then(r => r.status)")) === 403);

  // Admin
  await b.as("admin");
  await b.go("/admin/audit");
  check("audit integrity check passes", ((await b.eval(`${visible("[role=status]")}?.innerText`)) ?? "").startsWith("Integrity check passed"));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
