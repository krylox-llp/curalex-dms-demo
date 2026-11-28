// Minimal Chrome DevTools Protocol driver (headless Google Chrome) used by the e2e tests.
import { spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const STATE = fileURLToPath(new URL("./.state/", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withBrowser(baseUrl, fn, { scale = 1, width = 1440, height = 900 } = {}) {
  fs.mkdirSync(STATE, { recursive: true });
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(process.env.CHROME_BIN || "google-chrome",
    ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${STATE}chrome-profile`, "about:blank"],
    { stdio: "ignore" });
  try {
    let pages;
    for (let i = 0; i < 75; i++) {
      try { pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (pages.some((p) => p.type === "page")) break; } catch {}
      await sleep(200);
    }
    const ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map(), listeners = [];
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else listeners.forEach((l) => l(m)); };
    const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
    await send("Page.enable"); await send("Network.enable"); await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
    const sessions = JSON.parse(fs.readFileSync(`${STATE}sessions.json`, "utf8"));

    const b = {
      sleep,
      async as(who) { await send("Network.clearBrowserCookies"); if (who && sessions[who]) for (const c of sessions[who].cookies) await send("Network.setCookie", { ...c, url: baseUrl }); },
      async go(path) {
        const loaded = new Promise((r) => listeners.push(function l(m) { if (m.method === "Page.loadEventFired") { listeners.splice(listeners.indexOf(l), 1); r(); } }));
        await send("Page.navigate", { url: baseUrl + path }); await loaded; await sleep(1200); return b.url();
      },
      async url() { return (await send("Runtime.evaluate", { expression: "location.pathname + location.search", returnByValue: true })).result.value; },
      async eval(expression) { return (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value; },
      async shot(name) { const { data } = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`${STATE}${name}.png`, Buffer.from(data, "base64")); },
      async key(key) {
        const vk = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, Tab: 9, Home: 36, End: 35 }[key] ?? 0;
        const base = { key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: key === "Enter" ? "\r" : undefined };
        await send("Input.dispatchKeyEvent", { type: "keyDown", ...base }); await send("Input.dispatchKeyEvent", { type: "keyUp", ...base }); await sleep(250);
      },
      async mouse(x, y) { for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: type === "mouseMoved" ? 0 : 1 }); await sleep(350); },
      /** Real mouse click in the middle of the element returned by `expr`. */
      async click(expr) {
        const r = await b.eval(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: "center" }); const x = el.getBoundingClientRect(); return [x.x + x.width / 2, x.y + x.height / 2]; })()`);
        if (!r) throw new Error(`element not found: ${expr}`);
        await b.mouse(r[0], r[1]);
      },
    };
    await fn(b);
    ws.close();
  } finally {
    chrome.kill();
  }
}

/** Visible element whose text starts with `text` (Next keeps hidden copies of recent pages mounted). */
export const visible = (selector, text) =>
  `[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.offsetParent !== null)${text ? `.find(e => e.textContent.trim().startsWith(${JSON.stringify(text)}))` : "[0]"}`;
