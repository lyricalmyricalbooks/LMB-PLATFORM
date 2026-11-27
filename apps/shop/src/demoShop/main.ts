// Live demo shops (next starters plan phase 3): every starter as a sample shop anyone can click around before signing up,
// served by the platform site at /demo/ (vite.demo.config.ts, site/build.js). The front page links to each one.
//
//   /demo/?starter=aurel-editorial&style=sand&sells=clothing
//
// The starter is applied the way Choose your look applies it (applyStarter, in the style, with its sample photos and
// sample products) and handed to the shop's own pages through the preview snapshot, like Studio's preview and the
// accessibility fixture. The address then becomes the shop's page with ?preview=true, so the shop never reads or writes a
// database. The choice is kept for the tab, so a link inside the shop (or a reload) stays in the same starter.
//
// The starter library (/demo/starters/ and /demo/starters/<id>, round three phase 2b) is served by the same page: it
// draws itself (libraryPage.ts) and opens sample shops in frames, which leave out the sample bar (`frame=1`).
import { demoDesign, demoChoice, demoShopName, demoShipping, DEMO_KEY } from "./demoShop";
import { libraryRoute } from "./starterLibrary";

const route = libraryRoute(location.pathname, import.meta.env.BASE_URL);
if (route) await (await import("./libraryPage")).showLibrary(route);
else await showShop();

async function showShop() {
  const params = new URLSearchParams(location.search);
  // Sign-up's live preview (join/, 25 November 2026) shows a starter inside "Your new store" with the brand name being
  // typed: ?name= is that name and ?embed=1 leaves out the sample bar. An embedded demo never keeps its choice for the
  // tab, so the visitor's own /demo/ visits aren't changed by it.
  const embedded = params.get("embed") === "1";
  const shopName = demoShopName(params.get("name"));
  let saved: Record<string, string> | null = null;
  try { saved = JSON.parse(sessionStorage.getItem(DEMO_KEY) || "null"); } catch { saved = null; }
  const choice = demoChoice({ starter: params.get("starter") || saved?.starter, style: params.get("style") || saved?.style, sells: params.get("sells") || saved?.sells, kind: params.get("kind") || saved?.kind, lead: params.get("lead") || saved?.lead });
  if (!embedded) try { sessionStorage.setItem(DEMO_KEY, JSON.stringify(choice)); } catch { /* the starter is still shown */ }

  const { design, books, pages, name, sells, shopName: shownName, bookingSamples } = demoDesign(choice, import.meta.env.BASE_URL, shopName);
  document.title = `${name}: a sample shop`;
  const win = window as any;
  win.__studioPreviewDesign = design;
  // `sells` makes the shop read as that kind of shop (its words, menu and banner), as a real shop's settings do. No draft
  // status is set, so the shop shows no "your live shop" banner: there is no Studio behind a demo.
  // The snapshot is the whole shop: nothing is read from a database (features/site/useSiteData.ts readSiteData).
  win.__studioPreviewOnly = true;
  // A shop with services takes bookings, so its header, phone menu and footer show "Book a time" as a live one's do.
  const takesBookings = bookingSamples.starterServices.length > 0 && choice.kind !== "products";
  win.__studioPreviewState = { settings: { design, sells, ...(choice.kind === "both" ? { sellsProducts: true } : {}), ...(takesBookings ? { bookingsLive: true } : {}), info: { name: shownName } }, books, pages, ...bookingSamples, shippingProfiles: demoShipping(books) };

  if (params.get("preview") !== "true") {
    const url = new URL(location.href);
    for (const key of ["starter", "style", "sells", "kind", "lead", "frame", "name", "embed"]) url.searchParams.delete(key);
    url.searchParams.set("preview", "true");
    history.replaceState(null, "", url);
  }
  await import("../main");
  if (!embedded && params.get("frame") !== "1" && window.top === window) showSampleBar(name, choice);
}

/**
 * The one thing on the page that isn't the shop: a small black pill saying it's a sample, with the way to start one.
 * Drawn outside the shop's own page (it isn't part of any shop), in the Colophon look.
 */
function showSampleBar(starterName: string, picked: { starter: string; style: string; sells?: string }) {
  const bar = document.createElement("aside");
  bar.setAttribute("aria-label", "Sample shop");
  bar.dataset.demoBar = "";
  // Centred by its margins, not a shift: a shifted box only gets half the screen to grow into, so the words cut off.
  bar.style.cssText = "position:fixed;left:0;right:0;bottom:16px;margin:0 auto;width:max-content;z-index:2147483000;display:flex;align-items:center;gap:14px;"
    + "max-width:calc(100vw - 32px);box-sizing:border-box;padding:8px 8px 8px 18px;border-radius:999px;background:#111;color:#f6f1e7;"
    + "font:500 14px/1.3 Inter,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25)";
  const words = document.createElement("span");
  words.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  // On a phone the starter's name is left out, so the line never cuts off.
  words.textContent = window.matchMedia("(max-width: 480px)").matches ? "A sample shop" : `A sample shop in ${starterName}`;
  const start = document.createElement("a");
  // Use this starter (round three phase 1): sign-up opens with this starter, in this style, already picked.
  const join = new URLSearchParams({ starter: picked.starter, style: picked.style, name: starterName });
  start.href = `/join/?${join}`;
  start.dataset.useStarter = picked.starter;
  start.textContent = "Use this starter";
  start.style.cssText = "flex:none;padding:8px 16px;border-radius:999px;background:#a9e8c6;color:#111;text-decoration:none;font-weight:600";
  bar.append(words, start);
  document.body.append(bar);
}
