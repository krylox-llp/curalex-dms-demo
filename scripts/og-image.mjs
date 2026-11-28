// Renders the link-preview image (Open Graph / Twitter) shown when someone shares dms.krylox.ai on
// WhatsApp, LinkedIn, Slack, iMessage…: 1200×630, JPEG, well under WhatsApp's ~300 KB limit.
// Needs Google Chrome and ImageMagick (`convert`). Run after scripts/landing-screenshots.mjs:
//   node scripts/og-image.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { STATE, withBrowser } from "../tests/e2e/browser.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const shot = `${root}public/landing/manufacturer-overview.png`;
fs.mkdirSync(STATE, { recursive: true });

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: Inter, system-ui, sans-serif;
         background: linear-gradient(160deg, #e9f1ff 0%, #ffffff 60%); color: #1a2b42; position: relative; }
  .copy { position: absolute; left: 72px; top: 64px; width: 560px; }
  .logo { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 600; }
  .logo .dms { color: #5b6b7f; font-weight: 500; border-left: 2px solid #cfd8e3; padding-left: 14px; }
  .logo .lex { color: #005fdb; }
  h1 { margin-top: 56px; font-size: 52px; line-height: 1.12; font-weight: 700; letter-spacing: -0.02em; }
  p { margin-top: 26px; font-size: 24px; line-height: 1.45; color: #4a5a6e; }
  .domain { position: absolute; left: 72px; bottom: 56px; font-size: 22px; font-weight: 600; color: #005fdb; }
  .shot { position: absolute; left: 690px; top: 70px; width: 820px; border-radius: 14px; overflow: hidden;
          box-shadow: 0 0 0 1px rgba(26,57,96,.12), 0 30px 60px -20px rgba(26,57,96,.45); background: #fff; }
  .bar { height: 26px; background: #f1f4f8; border-bottom: 1px solid #e3e8ef; display: flex; gap: 7px; align-items: center; padding-left: 12px; }
  .bar i { width: 10px; height: 10px; border-radius: 50%; background: #d3dae3; }
  .shot img { display: block; width: 100%; }
</style></head><body>
  <div class="copy">
    <div class="logo">
      <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><path d="M12 2l8.5 3.2v6.3c0 5.2-3.6 9.6-8.5 10.5-4.9-.9-8.5-5.3-8.5-10.5V5.2z" fill="#006af5"/><path d="M10.6 7.5h2.8v3.1h3.1v2.8h-3.1v3.1h-2.8v-3.1H7.5v-2.8h3.1z" fill="#fff"/></svg>
      <span>Cura<span class="lex">Lex</span></span><span class="dms">DMS</span>
    </div>
    <h1>Share regulatory documents with your exporters, without losing control.</h1>
    <p>CoAs, CoPPs, GMP certificates and dossiers. Versioned, time-limited access, every download logged.</p>
  </div>
  <div class="domain">dms.krylox.ai</div>
  <div class="shot"><div class="bar"><i></i><i></i><i></i></div><img src="file://${shot}"></div>
</body></html>`;
fs.writeFileSync(`${STATE}og.html`, html);

await withBrowser(`file://${STATE}`, async (b) => {
  await b.go("og.html");
  await b.sleep(1500); // web font
  await b.shot("og");
}, { width: 1200, height: 630 });

const out = `${root}app/opengraph-image.jpg`;
execFileSync("convert", [`${STATE}og.png`, "-strip", "-quality", "86", "-sampling-factor", "4:2:0", out]);
fs.copyFileSync(out, `${root}app/twitter-image.jpg`);
console.log(`${out}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
