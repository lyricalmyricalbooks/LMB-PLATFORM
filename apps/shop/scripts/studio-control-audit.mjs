// Studio control audit: does each Theme settings control actually change the preview?
// Opens the Studio fixture with the published design (`?live=1`), then for every STYLE_GROUPS
// control (and every per-section Style/Layout field on the home page's sections) sends the
// preview the same snapshot Studio would send after the change and compares what the shopper
// sees: the position/size/colours of every box and the type of every piece of text.
//   node scripts/studio-control-audit.mjs                 (starts its own Vite dev server)
//   AUDIT_ONLY=type,header node scripts/...               (only these Style categories)
//   AUDIT_OUT=file.json                                   (where the results go)
//   CHROMIUM_PATH=/path/to/chrome                         (use an installed Chromium)
//   AUDIT_CHECK=1                                         (CI: compare with scripts/studio-control-baseline/ and
//                                                          fail when a control that worked stops, or a new one isn't listed)
//   AUDIT_UPDATE=1                                        (rewrite the baseline from this run, keeping its reasons)
//   AUDIT_SHARD=2/4                                       (CI: this machine's share of the controls; each shard opens its
//                                                          own Studio, and every control and section device is in exactly one)
// Results: "visible" (something on the page moved or changed colour), "css-only" (the page's
// CSS changed but nothing drawn did: a hover/focus state, or a rule another rule beats),
// "dom-only" (markup changed, nothing drawn), "none" (nothing at all happened).
import { chromium } from "playwright";
import { createServer } from "vite";
import { writeFileSync } from "node:fs";
import { readBaseline, writeBaseline } from "./studioControlBaseline.mjs";

const baselineFile = (process.env.AUDIT_CHECK || process.env.AUDIT_UPDATE) ? { controls: readBaseline() } : null;
const RANK = { none: 0, "dom-only": 1, "css-only": 2, visible: 3 };
/** What the baseline expects of a control: its result, or "none" with the reason it can't show on the fixture. */
const expected = (id) => {
  const v = baselineFile?.controls?.[id];
  return v == null ? null : String(v).startsWith("none") ? "none" : v;
};

let server;
let base = process.env.STUDIO_URL;
if (!base) {
  server = await createServer({ server: { port: 0, strictPort: false }, logLevel: "error" });
  await server.listen();
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const only = (process.env.AUDIT_ONLY || "").split(",").filter(Boolean);
const [shardNo, shardCount] = (process.env.AUDIT_SHARD || "1/1").split("/").map(Number);
if (!(shardCount >= 1 && shardNo >= 1 && shardNo <= shardCount)) throw new Error(`AUDIT_SHARD must look like 2/4, not ${process.env.AUDIT_SHARD}`);
const inShard = (i) => i % shardCount === shardNo - 1;

const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
page.on("pageerror", e => console.warn("[studio error]", e.message));
await page.goto(`${base}/studio-fixture.html?live=1`).catch(() => {});
await page.waitForTimeout(6000); // first visit: Vite finishes bundling and may reload once
async function openStudio() {
  await page.goto(`${base}/studio-fixture.html?live=1`);
  await page.getByText("Preview connected").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
}
await openStudio();

const frame = () => page.frames().find(f => f !== page.mainFrame() && f.url().includes("preview=true"));

const fields = await page.evaluate(async () => {
  const { STYLE_GROUPS } = await import("/src/app/admin/studio/styleSchema.ts");
  const { CATEGORY_PAGES } = await import("/src/app/admin/studio/settingsMap.ts");
  return STYLE_GROUPS.flatMap(g => g.fields.map(f => ({
    group: g.id, groupTitle: g.title, key: f.key, label: f.label, kind: f.kind,
    min: f.min, max: f.max, step: f.step, defaultValue: f.defaultValue,
    options: (f.options || []).map(o => o.value), where: CATEGORY_PAGES[g.id] || null,
  })));
});
const sectionFields = await page.evaluate(async () => {
  const { sectionStyleFields } = await import("/src/app/admin/studio/sectionStyleSchema.ts");
  return sectionStyleFields([]).map(f => ({ key: f.key, label: f.label, kind: f.kind, tab: f.tab, group: f.group, min: f.min, max: f.max, options: (f.options || []).map(o => o.value) }));
});

const books = await frame().evaluate(() => window.__studioPreviewState?.books || []);
const product = books[0]?.slug || books[0]?.id;
const ROUTES = {
  heroPage: "/", storefront: "/?catalog=true", productPage: `/books/${product}`, cartPage: "/checkout",
  accountPage: "/account", page: "/page/about", wishlistPage: "/wishlist", trackingPage: "/track", page404: "/nope-404",
};
// Site-wide controls whose only drawing on the home page is a loading placeholder (gone once photos load,
// so the result depended on the network): check them where they are drawn at rest.
const KEY_ROUTES = { surfaceRaisedColor: ROUTES.cartPage }; // checkout's order summary panel
const pageFor = (f) => {
  if (KEY_ROUTES[f.key]) return { route: KEY_ROUTES[f.key] };
  const where = f.where || {};
  if (where.template) return { route: ROUTES[where.template] || "/", overlay: where.overlay };
  const k = f.group;
  if (/^(checkout|stripePayment)/.test(k)) return { route: ROUTES.cartPage };
  if (/^(productContent|productPage|productCard|labels|reviews)/.test(k)) return { route: ROUTES.productPage };
  if (/^(wishlist)/.test(k)) return { route: ROUTES.wishlistPage };
  if (/^(account)/.test(k)) return { route: ROUTES.accountPage };
  if (/^(tracking)/.test(k)) return { route: ROUTES.trackingPage };
  if (/^(recovery)/.test(k)) return { route: ROUTES.page404 };
  if (/^(catalog|products)/.test(k)) return { route: ROUTES.storefront };
  if (/^(customPages)/.test(k)) return { route: ROUTES.page };
  if (/^(search)/.test(k)) return { route: "/", overlay: "search" };
  if (/^(cartDrawer)/.test(k)) return { route: "/", overlay: "cart" };
  if (/^(popup)/.test(k)) return { route: "/", overlay: "popup" };
  return { route: "/", overlay: where.overlay };
};
const deviceFor = (key) => /Mobile|Phone|phone/.test(key) ? "mobile" : /Tablet/.test(key) ? "tablet" : "desktop";

// ── preview helpers ──────────────────────────────────────────────
let current = { route: null, overlay: null, device: "desktop" };
async function go(route, overlay, device) {
  if (device !== current.device) {
    await page.getByRole("button", { name: { desktop: "Computer preview", tablet: "Tablet preview", mobile: "Phone preview" }[device] }).click();
    await page.waitForTimeout(800);
  }
  if (route !== current.route || device !== current.device || overlay !== current.overlay) {
    await frame().goto(`${base}${route}${route.includes("?") ? "&" : "?"}preview=true`);
    // Wait for the shop to draw with the Studio snapshot (slower CI machines need more than a fixed pause).
    await frame().waitForFunction(() => window.__studioPreviewState && document.querySelector("[data-fm-store]"), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    if (overlay) {
      // Ask until the pop-over is on screen: the request is lost if it arrives before the page listens.
      const open = { cart: ".fm-bag", search: '[role="dialog"]', popup: '[role="dialog"]', cookie: '[role="dialog"]' }[overlay] || '[role="dialog"]';
      for (let i = 0; i < 10; i++) {
        await frame().evaluate(o => { window.__studioOpenOverlay = o; window.dispatchEvent(new CustomEvent("fm:studio-open-overlay", { detail: { overlay: o } })); }, overlay);
        await page.waitForTimeout(800);
        if (await frame().evaluate(sel => Boolean(document.querySelector(sel)), open)) break;
      }
      await page.waitForTimeout(600);
    }
    current = { route, overlay, device };
    await frame().evaluate(() => window.scrollTo(0, 0));
    baselineState = await frame().evaluate(() => JSON.parse(JSON.stringify({ ...window.__studioPreviewState, design: window.__studioPreviewDesign })));
    await baseline();
  }
}
let baselineState = null;

let settle = 350;
async function send(design) {
  const state = baselineState;
  const msg = { type: "STUDIO_PREVIEW_STATE", settings: { ...state.settings, design, draftDesign: design }, design, pages: state.pages, books: state.books };
  await frame().evaluate(m => window.dispatchEvent(new MessageEvent("message", { data: m, origin: location.origin, source: window.parent })), msg);
  await frame().evaluate(s => new Promise(r => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), s)), settle);
}

const FINGERPRINT = () => {
  const BOX = ["display", "visibility", "opacity", "background-color", "background-image", "border-top-color", "border-top-width",
    "border-top-style", "border-bottom-color", "border-bottom-width", "border-left-width", "border-right-width", "border-top-left-radius",
    "box-shadow", "transform", "backdrop-filter", "outline-color", "outline-width", "filter", "clip-path", "object-fit", "object-position", "fill", "stroke", "mix-blend-mode"];
  const TEXT = ["color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-transform",
    "text-align", "text-decoration-line", "text-decoration-color", "text-shadow", "word-spacing", "-webkit-text-fill-color"];
  const PSEUDO = ["content", "display", "background-color", "background-image", "border-top-color", "border-top-width", "width", "height", "opacity", "color"];
  // Endless animations (skeleton pulse, spinners) ignore reduced motion: hold them at their start so
  // two looks at the page compare what the control did, not where a loop happened to be.
  for (const a of document.getAnimations()) if (a.effect?.getComputedTiming?.().iterations === Infinity) { a.pause(); a.currentTime = 0; }
  const out = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("[data-studio-bridge],[data-studio-ui]") || ["SCRIPT", "STYLE", "LINK", "META"].includes(el.tagName)) { out.push(""); continue; }
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    let s = el.tagName + ":" + [r.x, r.y, r.width, r.height].map(n => Math.round(n)).join(",") + "|";
    for (const p of BOX) s += cs.getPropertyValue(p) + "|";
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own || el.matches("input,textarea,select,button,svg,img")) for (const p of TEXT) s += cs.getPropertyValue(p) + "|";
    if (own) s += [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(" ");
    for (const pe of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pe);
      if (ps.content && ps.content !== "none" && ps.content !== "normal") for (const p of PSEUDO) s += ps.getPropertyValue(p) + "|";
    }
    out.push(s);
  }
  const css = [...document.querySelectorAll("style")].map(s => s.textContent).join("\n");
  const html = document.body.innerHTML.replace(/\s(data-studio-[a-z-]+|style)="[^"]*"/g, "");
  return { out, css, html };
};

async function baseline() {
  await frame().evaluate(fp => {
    const f = eval("(" + fp + ")");
    const a = f(); return new Promise(r => setTimeout(() => { const b = f(); window.__auditBase = b; window.__auditNoisy = new Set(a.out.map((s, i) => s !== b.out[i] ? i : -1).filter(i => i >= 0)); r(); }, 400));
  }, FINGERPRINT.toString());
}
async function compare() {
  return frame().evaluate(fp => {
    const f = eval("(" + fp + ")");
    const now = f(), base = window.__auditBase, noisy = window.__auditNoisy;
    let changed = 0; const samples = [];
    const n = Math.max(now.out.length, base.out.length);
    if (now.out.length !== base.out.length) changed += Math.abs(now.out.length - base.out.length);
    else for (let i = 0; i < n; i++) if (!noisy.has(i) && now.out[i] !== base.out[i]) { changed++; if (samples.length < 2) samples.push([base.out[i].slice(0, 160), now.out[i].slice(0, 160)]); }
    return { changed, css: now.css !== base.css, dom: now.html !== base.html, samples };
  }, FINGERPRINT.toString());
}

// ── values to try ────────────────────────────────────────────────
const get = (o, path) => path.split(".").reduce((a, k) => a?.[k], o);
function trialValues(f, cur) {
  const eff = cur ?? f.defaultValue;
  switch (f.kind) {
    case "color": return [String(eff || "").toLowerCase() === "#13a37f" ? "#a31357" : "#13a37f"];
    case "toggle": return eff == null ? [false, true] : [!eff];  // unset: the storefront may treat it as on or off
    case "range": case "number": {
      const lo = f.min ?? 0, hi = f.max ?? (Number(eff || 0) + 20), now = Number(eff ?? lo);
      const vals = [hi, lo, Math.round(((lo + hi) / 2) / (f.step || 1)) * (f.step || 1)].filter(v => v !== now);
      return [...new Set(vals)].slice(0, 2);
    }
    case "select": return f.options.filter(v => v !== (eff ?? "")).slice(-3);
    case "text": case "textarea": return [/url|link|href|image|^social\./i.test(f.key) ? "https://example.com/a.png" : "Audit 123"];
    case "image": return ["https://picsum.photos/seed/audit/600/400"];
    case "link": return ["/page/about"];
    default: return [];
  }
}
function setRoot(design, path, value) {
  const [top, ...rest] = path.split(".");
  const next = { ...design };
  if (rest.length) next[top] = { ...(design[top] || {}), [rest.join(".")]: value };
  else next[top] = value;
  // "All pages": clear page-surface copies of the same key, like writeDesignValue.
  for (const k of Object.keys(next)) {
    const v = next[k];
    if (k === top || !v || typeof v !== "object" || Array.isArray(v) || !(top in v)) continue;
    if (["storefront", "productPage", "cartPage", "heroPage", "accountPage", "wishlistPage", "trackingPage", "collectionPage", "page", "page404"].includes(k) || k.startsWith("page:") || k.includes("~")) {
      const copy = { ...v }; delete copy[top]; next[k] = copy;
    }
  }
  return next;
}

const results = [];
const sectionId = (type, key, device) => `section:${type}:${key}@${device}`;
// Region controls (Fine-tune one element at a time) share one CSS writer: AUDIT_REGIONS=1 samples
// their desktop text/box controls; whether each region is on its page is a separate check.
const REGION_SAMPLE = /(?:Padding|Background|Color|Size|LineHeight|LetterSpacing|Visible)$/;
const todo = fields.filter(f => (!only.length || only.includes(f.group))
  && (!f.key.startsWith("regions.") || (process.env.AUDIT_REGIONS && !/Mobile|Tablet/.test(f.key) && REGION_SAMPLE.test(f.key))))
  .filter((_, i) => inShard(i));
console.log(`Auditing ${todo.length} Theme settings controls and ${sectionFields.length} section fields`);
const t0 = Date.now();
for (const [i, f] of todo.entries()) {
  const where = pageFor(f);
  const device = f.key.startsWith("regions.") ? (f.key.includes("Mobile") ? "mobile" : f.key.includes("Tablet") ? "tablet" : "desktop") : deviceFor(f.key);
  // A preview reload mid-check ("Frame was detached") says nothing about the control: reopen and try it once more.
  for (let attempt = 1; attempt <= 2; attempt++) try {
    await go(where.route, where.overlay, device);
    const design = baselineState.design;
    const cur = get(design, f.key);
    let best = { status: "none", value: null };
    const want = expected(f.key);
    // A result below the baseline gets one slower second try before it counts (CI machines vary).
    for (const wait of want ? [350, 1200] : [350]) {
      settle = wait;
      for (const value of trialValues(f, cur)) {
        await send(setRoot(design, f.key, value));
        const r = await compare();
        const status = r.changed ? "visible" : r.css ? "css-only" : r.dom ? "dom-only" : "none";
        if (RANK[status] > RANK[best.status]) best = { status, value, changed: r.changed, samples: r.samples };
        if (status === "visible") break;
      }
      if (!want || RANK[best.status] >= RANK[want]) break;
      await send(design); await baseline();
    }
    settle = 350;
    await send(design);
    results.push({ ...f, options: undefined, route: where.route, overlay: where.overlay || null, device, current: cur ?? null, ...best });
    break;
  } catch (e) {
    if (attempt === 2) results.push({ ...f, options: undefined, route: where.route, device, status: "error", error: String(e.message || e).split("\n")[0] });
    // The preview frame went away (a reload): open Studio again so one hiccup doesn't fail every later control.
    if (!frame()) await openStudio().catch(() => {});
    current = { route: null, overlay: null, device: "desktop" };
  }
  if (i % 25 === 0) console.log(`${i}/${todo.length}  ${Math.round((Date.now() - t0) / 1000)}s`);
}

// Per-section fields: the published design may have no sections, so add a few common ones to Home
// (registry defaults) and change each Style/Layout/Visibility field on each of them.
if (!only.length || only.includes("sections")) {
  const TYPES = (process.env.AUDIT_SECTION_TYPES || "ImageWithTextSection,RichTextSection,FeatureGridSection,NewsletterSection").split(",");
  const registry = await page.evaluate(async types => {
    const { SECTION_REGISTRY } = await import("/src/app/admin/ThemeEditorExtensions.tsx");
    return types.map(t => ({ type: t, defaults: (SECTION_REGISTRY.find(r => r.type === t) || {}).defaults || {} }));
  }, TYPES);
  const sections = registry.map((r, i) => ({ id: "audit-" + i, type: r.type, settings: JSON.parse(JSON.stringify(r.defaults)) }));
  const rank = { none: 0, "dom-only": 1, "css-only": 2, visible: 3 };
  // Section fields are dealt out one by one across the shards (all devices together), so no shard gets a whole device.
  let sectionNo = 0;
  for (const dev of ["desktop", "tablet", "mobile"]) {
    const fields = sectionFields.filter(f => f.kind !== "date" && f.key !== "customClass"
      && (/^mobile/.test(f.key) || f.key === "hideOnMobile" ? "mobile" : f.key === "hideOnTablet" ? "tablet" : "desktop") === dev);
    const mine = new Set(sections.flatMap(s => fields.map(f => s.id + "|" + f.key)).filter(() => inShard(sectionNo++)));
    if (!mine.size) continue;
    const list = fields;
    await go("/", null, dev);
    const d = { ...baselineState.design, showHero: true, heroPage: { ...(baselineState.design.heroPage || {}), sections } };
    await send(d);
    await page.waitForTimeout(1500);
    await baseline();
    for (const s of sections) for (const f of list) {
      if (!mine.has(s.id + "|" + f.key)) continue;
      let best = { status: "none", value: null };
      const id = sectionId(s.type, f.key, dev), want = expected(id);
      for (const wait of want ? [350, 1200] : [350]) {
        settle = wait;
        for (const value of f.key === "customCss" ? ["& { outline: 5px solid red; }"] : trialValues(f, s.settings?.[f.key])) {
          const next = { ...d, heroPage: { ...d.heroPage, sections: sections.map(x => x.id === s.id ? { ...x, settings: { ...x.settings, [f.key]: value } } : x) } };
          await send(next);
          const r = await compare();
          const status = r.changed ? "visible" : r.css ? "css-only" : r.dom ? "dom-only" : "none";
          if (rank[status] > rank[best.status]) best = { status, value, changed: r.changed, samples: r.samples };
          if (status === "visible") break;
        }
        if (!want || RANK[best.status] >= RANK[want]) break;
        await send(d); await baseline();
      }
      settle = 350;
      await send(d);
      results.push({ id, group: "section:" + s.type, groupTitle: "Section · " + s.type, key: f.key, label: f.label, kind: f.kind, route: "/", device: dev, ...best });
    }
    current = { route: null, overlay: null, device: dev };
  }
}

writeFileSync(process.env.AUDIT_OUT || "studio-control-audit.json", JSON.stringify(results, null, 1));
const tally = results.reduce((t, r) => ((t[r.status] = (t[r.status] || 0) + 1), t), {});
console.log(tally);
await browser.close();
await server?.close();

const idOf = (r) => r.id || r.key;
if (process.env.AUDIT_UPDATE) {
  // Keep each "none" control's written reason; a new one gets TODO, which studioControlBaseline.test.ts refuses.
  // A partial run (AUDIT_ONLY) keeps every other entry; studioControlBaseline.test.ts catches stale ones.
  const controls = { ...baselineFile.controls };
  for (const r of results) {
    if (r.status === "error") continue;
    const old = baselineFile.controls[idOf(r)];
    controls[idOf(r)] = r.status !== "none" ? r.status : (old && String(old).startsWith("none: ") ? old : "none: TODO say why this control can't show on the fixture page");
  }
  writeBaseline(controls);
  console.log(`Baseline updated: ${Object.keys(controls).length} controls`);
}
if (process.env.AUDIT_CHECK) {
  const problems = [];
  for (const r of results) {
    const want = expected(idOf(r));
    const name = `${r.groupTitle} › ${r.label} (${idOf(r)})`;
    if (r.status === "error") problems.push(`${name}: the check itself failed: ${r.error}`);
    else if (want == null) problems.push(`${name}: new control with no entry in scripts/studio-control-baseline/ (run with AUDIT_UPDATE=1, then give a reason if it shows nothing)`);
    else if (RANK[r.status] < RANK[want]) problems.push(`${name}: used to change the preview (${want}), now ${r.status}`);
  }
  const better = results.filter(r => expected(idOf(r)) === "none" && r.status !== "none").map(r => idOf(r));
  if (better.length) console.log(`These now change the preview; record it with AUDIT_UPDATE=1: ${better.join(", ")}`);
  if (problems.length) {
    console.error(`\n${problems.length} Studio control(s) no longer reach the preview:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log("Every Studio control still reaches the preview as recorded.");
}
