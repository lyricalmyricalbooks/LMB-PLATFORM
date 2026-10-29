// `node walkthrough/site/build.js <out folder>`: the walkthrough as a web site that needs no server (for GitHub Pages).
// Starts the walkthrough, expects `npm run demo` to be running too, opens every stop on the start page in Chromium (signing in
// as the made-up person it names) and saves a picture of each, then writes index.html: the same sections, with the picture
// and what to try under each stop. Pretend data only; requests to any other address are refused.
// Needs Playwright (CHROMIUM_PATH to reuse an installed Chromium).
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startWalkthrough } from "../server.js";
import { START_SECTIONS } from "../startPage.js";
import { PORTS, url } from "../../demo/config.js";

const out = process.argv[2];
if (!out) {
  console.error("Usage: node walkthrough/site/build.js <out folder>");
  process.exit(1);
}
const { chromium } = createRequire(import.meta.url)("playwright");
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

mkdirSync(join(out, "img"), { recursive: true });
const walk = await startWalkthrough({ sweepEveryMs: 50 });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const local = (address) => address.startsWith(walk.url) || address.startsWith("http://127.0.0.1:") || address.startsWith("http://localhost:");
// Fonts and the sign-in libraries come from the internet; everything else stays on this computer.
await context.route("**/*", (route) => (local(route.request().url()) || /(fonts\.googleapis|fonts\.gstatic|apis\.google|www\.gstatic|www\.googleapis)\.com|unpkg\.com/.test(route.request().url()) ? route.continue() : route.abort()));

/** Signs in through the practice sign-in window if the page is asking for it. */
async function signInIfAsked(page) {
  const button = page.getByRole("button", { name: /Sign in (with|w\/) Google|Continue with Google/i }).first();
  if (!(await button.isVisible().catch(() => false))) return;
  const popup = page.waitForEvent("popup", { timeout: 4000 }).catch(() => null);
  await button.click().catch(() => {});
  const win = await popup;
  if (!win) return;
  await win.waitForLoadState();
  await win.getByText("owner@example.com").first().click().catch(() => {});
  await page.waitForTimeout(5000);
}

const shown = [];
const taken = new Map();
for (const section of START_SECTIONS) {
  for (const item of section.links) {
    if (/\.csv$/.test(item.href)) continue; // downloads, not pages
    const address = item.href.startsWith("/") ? `${walk.url}${item.href}` : item.href;
    const file = `${slug(item.name)}.png`;
    let note = "";
    if (taken.has(address)) {
      taken.get(address).push(item.name);
      shown.push({ item, file: taken.get(address).file });
      continue;
    }
    const page = await context.newPage();
    try {
      await page.goto(address, { waitUntil: "load", timeout: 30_000 });
      await page.waitForTimeout(1500);
      await signInIfAsked(page);
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(3500);
      await page.screenshot({ path: join(out, "img", file), fullPage: false });
      console.log(`✓ ${item.name}`);
    } catch (error) {
      note = String(error?.message ?? error).split("\n")[0];
      console.log(`✗ ${item.name}: ${note}`);
    }
    await page.close();
    const entry = Object.assign([], { file });
    taken.set(address, entry);
    shown.push({ item, file: note ? null : file });
  }
}
await browser.close();
await walk.close();

const card = ({ item, file }) => `<li class="card">${file ? `<a href="img/${esc(file)}"><img src="img/${esc(file)}" loading="lazy" alt="Picture of: ${esc(item.name)}"></a>` : ""}
<h3>${esc(item.name)}</h3><p class="who">${item.who ? `Signed in as ${esc(item.who)}` : "No sign-in"}</p><p>${esc(item.try)}</p></li>`;
const pages = START_SECTIONS.map((section) => {
  const mine = shown.filter(({ item }) => section.links.includes(item));
  return `<section id="${esc(section.id)}"><h2>${esc(section.title)}</h2><p class="intro">${esc(section.intro.replace(/These come from npm run demo[^.]*\./, "").replace(/Start the demo with npm run demo -- --new-press: /, ""))}</p><ul>${mine.map(card).join("")}</ul></section>`;
}).join("\n");
writeFileSync(join(out, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Colophon walkthrough</title><meta name="robots" content="noindex">
<style>
body{margin:0;font:17px/1.55 system-ui,sans-serif;background:#faf5e8;color:#111}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:2.4rem;margin:.2em 0}h2{margin:2em 0 .2em;border-top:2px solid #111;padding-top:.6em}
.note{border:2px solid #111;background:#ffe800;padding:12px 16px;margin:16px 0}
nav a{display:inline-block;margin:0 12px 8px 0;color:#111;font-weight:600}
ul{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:20px}
.card{border:2px solid #111;background:#fff;padding:0 0 12px;box-shadow:4px 4px 0 #111}
.card img{display:block;width:100%;height:auto;border-bottom:2px solid #111}
.card h3,.card p{margin:8px 14px}.who{font:13px ui-monospace,monospace;color:#555}.intro{max-width:70ch}
</style></head><body><main>
<h1>Walk through the platform</h1>
<p>Every stop of the walkthrough as a picture, with what to look at and who it is signed in as: as a shopper, as a press, and as the platform owner. Click a picture to see it full size.</p>
<div class="note"><b>Nothing here is real.</b> These are pictures taken of the walkthrough running on made-up data: made-up presses, made-up people, pretend money. No shop, account or payment is behind this page. (Pictures taken ${new Date().toISOString().slice(0, 10)}.)</div>
<nav>${START_SECTIONS.map((s) => `<a href="#${esc(s.id)}">${esc(s.title)}</a>`).join("")}</nav>
${pages}
</main></body></html>
`);
console.log(`\nWrote ${join(out, "index.html")}`);
