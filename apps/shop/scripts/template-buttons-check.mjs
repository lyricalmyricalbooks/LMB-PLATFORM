// Template buttons follow Studio (4 November 2026): under every storefront template, the header's bag
// button, Add to bag, the newsletter sign-up button (on a collection page) and the home page's newsletter and
// pop-up sign-up sections' buttons must take the press's template outline and hard shadow, since
// each of them draws its own border or shadow that a template's stylesheet alone cannot beat. Runs the real storefront
// in Chromium through a11y-fixture.html, with sample books and no shop data read. CI job `shop-accessibility` runs it.
//
//   node scripts/template-buttons-check.mjs        every template
//   CHROMIUM_PATH=/path/to/chrome …                use an installed Chromium
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const origin = new URL(base).origin;
const { THEME_LIBRARY } = await server.ssrLoadModule("/src/app/admin/studio/themeLibrary.ts");
const { TEMPLATE_STYLE_IDS } = await server.ssrLoadModule("/src/app/features/site/templateStyles.ts");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

// One library look per template, and the settings a press would change.
const looks = TEMPLATE_STYLE_IDS.map((id) => [id, THEME_LIBRARY.find((t) => t.global?.themeStyle === id)?.id]);
const SET = { templateOutlineColor: "#123456", templateOutlineWidth: 3, templateShadowOffset: 5, buttonShadow: true };
// Where each button is: the newsletter sign-up sits under every page but the home page and book pages.
const PAGES = [
  ["/books/night-songs", ".fm-pdp-title", { "bag button": ".fm-hdr-cart", "Add to bag": "button.custom-btn" }],
  ["/collections/zines", ".fm-newsletter-btn", { "newsletter button": ".fm-newsletter-btn" }],
  // The home page with a newsletter section and a pop-up sign-up section, as a press adds them in Studio.
  ["/", "form .fm-newsletter-btn", { "home newsletter section button": ["form .fm-newsletter-btn", 0], "pop-up sign-up button": ["form .fm-newsletter-btn", 1] },
    { homepageSections: [{ id: "nl", type: "NewsletterSection", settings: {} }, { id: "pop", type: "NewsletterPopupSection", settings: {} }] }],
];

const failures = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await page.route("**/*", (route) => (new URL(route.request().url()).origin === origin || route.request().url().startsWith("data:") ? route.continue() : undefined));
await page.goto(`${base}/a11y-fixture.html`).catch(() => {}); // warm Vite's dependency cache
await page.waitForTimeout(3000);

for (const [id, theme] of looks) {
  if (!theme) { failures.push(`${id}: no theme-library look uses it`); continue; }
  for (const [path, ready, buttons, extra] of PAGES) {
    await page.goto(`${base}/a11y-fixture.html?theme=${theme}&path=${encodeURIComponent(path)}&design=${encodeURIComponent(JSON.stringify({ ...SET, ...extra }))}`);
    if (!(await page.waitForSelector(ready, { timeout: 60000 }).catch(() => null))) { failures.push(`${id}: ${path} did not open`); continue; }
    await page.waitForTimeout(600);
    for (const [name, sel] of Object.entries(buttons)) {
      const [selector, nth] = Array.isArray(sel) ? sel : [sel, 0];
      const got = await page.$$eval(selector, (els, i) => { const e = els[i]; if (!e) return null; const c = getComputedStyle(e); return { width: c.borderTopWidth, colour: c.borderTopColor, shadow: c.boxShadow }; }, nth).catch(() => null);
      if (!got) { failures.push(`${id}: no ${name} on ${path}`); continue; }
      const line = `${id} ${name}: border ${got.width} ${got.colour}, shadow ${got.shadow}`;
      console.log(line);
      if (got.width !== "3px" || got.colour !== "rgb(18, 52, 86)") failures.push(`${line} (wanted the 3px outline the press set)`);
      if (!/\b5px\b/.test(got.shadow)) failures.push(`${line} (wanted the 5px hard shadow the press set)`);
    }
  }
}

await browser.close();
await server.close();
if (failures.length) {
  console.error(`\n${failures.length} template button(s) ignore the press's settings:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`\nEvery template's buttons follow the outline and shadow settings (${looks.length} templates).`);
