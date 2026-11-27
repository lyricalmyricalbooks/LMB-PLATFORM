// The starter websites, page by page, in a real browser (plan "Starters on par", step 9). Every starter in the demo
// shop (demo.html, sample products, nothing read or written) at desktop and phone width: home, the shop page, one
// product page, About, Contact and the missing page. A page fails on:
//   - a page error;
//   - sideways scroll (the page is wider than the screen);
//   - words left for the owner to replace ("Your headline", "Example …", "Say what …"), template braces, "undefined";
//   - a heading not drawn in the starter's own heading font, or body text not in its body font;
//   - a picture that didn't load.
//
//   node scripts/starter-check.mjs                    every starter (CI job `shop-speed` runs it)
//   STARTERS=aurel-editorial,starter-salon …          only these
//   CHROMIUM_PATH=/path/to/chrome …                   use an installed Chromium
import { chromium } from "playwright";
import { createServer } from "vite";

const LEFTOVER = [
  /\bYour (headline|press|shop name|story|collection)\b/i,
  /\bExample (product|item|title|text|heading)\b/i,
  /\bSay what (makes|you)\b/i,
  /\bTell shoppers\b/i,
  /\bIntroduce (your|this)\b/i,
  /\bLorem ipsum\b/i,
  /@example\.(com|org)\b/i,
  /\{\{|\}\}/,
  /\bundefined\b|\bNaN\b|\[object Object\]/,
];
const PAGES = [
  { name: "home", path: "/" },
  { name: "shop", path: "/collections/all" },
  { name: "product", path: null },
  { name: "about", path: "/page/about" },
  { name: "contact", path: "/page/contact" },
  { name: "missing", path: "/no-such-page" },
];
const SIZES = [{ tag: "desktop", width: 1440, height: 900 }, { tag: "phone", width: 390, height: 844 }];

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const origin = new URL(base).origin;
const { THEME_LIBRARY } = await server.ssrLoadModule("/src/app/admin/studio/themeLibrary.ts");
const { STARTER_INFO } = await server.ssrLoadModule("/src/demoShop/starterLibrary.ts");
const only = (process.env.STARTERS || "").split(",").map((s) => s.trim()).filter(Boolean);
const starters = THEME_LIBRARY.filter((t) => t.content?.sampleBrand && (!only.length || only.includes(t.id)));
if (!starters.length) throw new Error("no starters to check");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const problems = [];
const family = (css) => (css || "").split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();

for (const starter of starters) {
  const heading = family(starter.global?.headingFont);
  // The Website font (`font`) wins over Body font on the shop, as in resolveTypography.
  const body = family(starter.global?.font || starter.font || starter.global?.bodyFont);
  const sells = (starter.content?.sampleProducts || []).length > 0;
  for (const size of SIZES) {
    // Reduced motion: sections that fade in on scroll are on screen at once.
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, reducedMotion: "reduce", locale: "en-CA" });
    const page = await context.newPage();
    // Only the local server answers; fonts are judged by the family the page asks for, not by the download.
    await page.route("**/*", (r) => (new URL(r.request().url()).origin === origin || r.request().url().startsWith("data:") ? r.continue() : r.abort()));
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // A starter made only for services opens its demo as a services shop, which sells nothing: when it has sample
    // products (Salon, Workshop), check it as Both so its shop and product pages are walked too.
    const servicesOnly = !(STARTER_INFO[starter.id]?.kinds || ["products"]).includes("products");
    await page.goto(`${base}/demo.html?starter=${starter.id}&frame=1${sells && servicesOnly ? "&kind=both" : ""}`);
    await page.waitForSelector("header", { timeout: 60000 });
    let productPath = null;
    for (const p of PAGES) {
      if (p.name === "product" && !sells) continue; // a services starter has nothing for sale
      const path = p.path ?? productPath;
      const where = `${starter.id} ${size.tag} ${p.name}`;
      if (!path) { problems.push(`${where}: no product link on the shop page`); continue; }
      errors.length = 0;
      await page.evaluate((to) => { history.pushState(null, "", to); dispatchEvent(new PopStateEvent("popstate")); scrollTo(0, 0); }, path);
      await page.waitForTimeout(1500);
      // Scroll to the end so pictures that wait for the screen load, then come back.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += innerHeight * 0.8) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
        scrollTo(0, 0);
      });
      await page.waitForTimeout(800);
      const seen = await page.evaluate(() => {
        const main = document.querySelector("main") || document.body;
        const shown = (el) => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && el.getClientRects().length > 0; };
        const headings = [...main.querySelectorAll("h1,h2")].filter(shown).filter((h) => h.innerText.trim());
        const paragraphs = [...main.querySelectorAll("p")].filter(shown).filter((p) => p.innerText.trim().length > 30);
        return {
          wide: document.documentElement.scrollWidth - innerWidth,
          text: document.body.innerText,
          headingFonts: headings.map((h) => [h.innerText.trim().slice(0, 40), getComputedStyle(h).fontFamily]),
          bodyFonts: paragraphs.map((p) => [p.innerText.trim().slice(0, 40), getComputedStyle(p).fontFamily]),
          broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc && !i.currentSrc.startsWith("data:") && new URL(i.currentSrc).origin === location.origin).map((i) => i.currentSrc),
          product: [...document.querySelectorAll('main a[href*="/products/"], main a[href*="/books/"]')].map((a) => new URL(a.href).pathname)[0] || null,
        };
      });
      if (p.name === "shop") productPath = seen.product;
      for (const e of errors) problems.push(`${where}: page error: ${e}`);
      if (seen.wide > 1) problems.push(`${where}: ${seen.wide}px wider than the screen`);
      for (const re of LEFTOVER) { const m = re.exec(seen.text); if (m) problems.push(`${where}: words to replace: "${seen.text.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, " ")}"`); }
      for (const [words, css] of seen.headingFonts) if (heading && family(css) !== heading) problems.push(`${where}: heading "${words}" in ${family(css)}, not ${heading}`);
      for (const [words, css] of seen.bodyFonts) if (body && family(css) !== body && family(css) !== heading) problems.push(`${where}: text "${words}" in ${family(css)}, not ${body}`);
      for (const src of seen.broken) problems.push(`${where}: picture didn't load: ${src}`);
    }
    await context.close();
  }
  console.log(`${starter.id}: checked`);
}

await browser.close();
await server.close();
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} on the starter websites:`);
  for (const p of [...new Set(problems)]) console.log(`- ${p}`);
  process.exit(1);
}
console.log(`Starters OK: ${starters.length} starters × ${PAGES.length} pages × desktop and phone.`);
