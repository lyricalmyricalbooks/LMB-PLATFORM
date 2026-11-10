// The look a live press's website wears (control room; plan 6.3 "Choose your look", Studio › Themes). The shop keeps
// the published design in `settings/website` (`design.themeBase` {id, name}: the ready-made look it started from, and
// `designPublishedAt`), Studio's unpublished draft in `themes/workspace` (`draft.themeBase`), and the welcome's pick in
// `firstWeek/start` (`welcome` {theme, at, adminLook, skipped}). So the record can say which look shoppers see, whether
// a different one is waiting unpublished, and the Setting up page can count the looks live shops wear. Read only.
//
// Clients passed in:
//   registry  getShop(shopId); listShops()
//   shopData  get(shopId, path)
import { ControlError, adminOf, eachInTurn } from "./controlRoom.js";
import { PLANS } from "../setup/steps.js";

/** The full storefront templates (apps/shop features/site/templateStyles.ts TEMPLATE_STYLE_IDS; a test keeps them in step). */
export const TEMPLATES = Object.freeze(["marquee", "shelf", "atlas", "mosaic", "arch", "market", "index", "folio", "lantern", "gutter", "signal", "kiln", "almanac", "console", "picnic", "cutout", "reel"]);
/**
 * The looks Choose your look suggests for each sign-up answer to "What do you sell?" (apps/shop admin/lookGallery.ts
 * SUGGESTED; a test keeps them in step), to count how many live shops wear one of theirs.
 */
export const SUGGESTED = Object.freeze({
  books: ["press-imprint", "press-folio", "press-letterpress"],
  zines: ["press-zine", "press-gutter", "press-cutout"],
  comics: ["press-gutter", "press-market", "press-mosaic"],
  prints: ["press-signal", "press-index", "press-atlas"],
  mix: ["press-rows", "press-atlas", "press-market"],
  mixed: ["press-rows", "press-atlas", "press-shelf"],
  clothing: ["press-cutout", "press-atlas", "press-marquee"],
  shoes: ["press-atlas", "urban-streetwear", "press-marquee"],
  jewelry: ["press-kiln", "press-arch", "golden-noir"],
  music: ["press-reel", "night-neon", "press-console"],
  other: ["press-kiln", "press-atlas", "press-shelf"],
  general: ["press-riso-noir", "press-riso", "press-imprint"],
});
export const suggestedFor = (publishes) => SUGGESTED[typeof publishes === "string" && Object.hasOwn(SUGGESTED, publishes) ? publishes : "general"];
const templateOf = (design) => (TEMPLATES.includes(design?.themeStyle) ? design.themeStyle : null);

/**
 * The template details Studio can reset (apps/shop studio/templateNote.ts TEMPLATE_DETAIL_NAMES; a test keeps them in
 * step), by the words the shop uses. A press who changed them sees its template drawn differently from the look cards.
 */
export const TEMPLATE_DETAIL_NAMES = Object.freeze({
  templateHeadingCase: "heading capitals", templateOutlineColor: "outline colour", templateOutlineWidth: "outline width",
  templateShadowColor: "shadow colour", templateShadowOffset: "shadow distance", templateRuleWidth: "ruled lines",
  templateFrameWidth: "photo frames", templateCardTilt: "card tilt", templateFooterCurve: "footer curve",
});
const detailsOf = (design) => Object.keys(TEMPLATE_DETAIL_NAMES).filter((key) => design?.[key] != null && design[key] !== "").map((key) => TEMPLATE_DETAIL_NAMES[key]);

const base = (design) => (design?.themeBase?.id ? { id: String(design.themeBase.id), name: String(design.themeBase.name ?? design.themeBase.id) } : null);

/**
 * The look shoppers see, the draft's when it differs, and the welcome's pick. `waiting` is true when the welcome picked a
 * look but nothing has been published yet, so shoppers still see the plain starting design.
 */
export function lookOf(settings, workspace, start) {
  const live = base(settings?.design);
  const draft = base(workspace?.draft);
  const welcome = start?.welcome?.theme ? { theme: String(start.welcome.theme), at: start.welcome.at ?? null, skipped: start.welcome.skipped === true, adminLook: start.welcome.adminLook ?? null } : null;
  return {
    live,
    // The template shoppers see (the design's `themeStyle`), null for the plain look or one switched off in Print style.
    template: templateOf(settings?.design),
    // The template details the press changed in Studio (Reset template details clears them), as the shop names them.
    templateDetails: detailsOf(settings?.design),
    publishedAt: settings?.designPublishedAt ?? null,
    draft: draft && draft.id !== live?.id ? draft : null,
    welcome,
    waiting: Boolean(welcome && !live),
    // Whether the look shoppers see is one suggested for what the press sells (null with no ready-made look).
    suggested: live ? suggestedFor(start?.publishes).includes(live.id) : null,
  };
}

/** How many live shops wear each look ("" = their own design, not from a ready-made look), most worn first. */
export function lookTally(looks) {
  const counts = new Map();
  for (const look of looks) {
    const key = look.live?.id ?? "";
    const row = counts.get(key) ?? { id: key, name: look.live?.name ?? "", count: 0 };
    row.count += 1;
    counts.set(key, row);
  }
  return [...counts.values()].sort((a, b) => (a.id === "") - (b.id === "") || b.count - a.count || a.id.localeCompare(b.id));
}

/** How many live shops show each full template ("" = none), most shown first. */
export function templateTally(looks) {
  const counts = new Map();
  for (const look of looks) counts.set(look.template ?? "", (counts.get(look.template ?? "") ?? 0) + 1);
  return [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => (a.id === "") - (b.id === "") || b.count - a.count || a.id.localeCompare(b.id));
}

const hasWebsite = (row) => (PLANS[row.plan] ?? { shop: true }).shop;
const liveShops = (rows) => rows.filter((row) => row.status === "live" && !row.closure && row.testShop !== true && hasWebsite(row));

export function createShopLooks({ admins, registry, shopData, now = () => new Date() }) {
  const read = async (shopId) => lookOf(await shopData.get(shopId, "settings/website"), await shopData.get(shopId, "themes/workspace"), await shopData.get(shopId, "firstWeek/start"));
  return {
    /** One live shop's look, for its record (null words when it has no website). */
    async forShop(claims, { shopId } = {}) {
      adminOf(claims, admins, now().getTime());
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      if (row.status !== "live") return { shopId, look: null, words: "Not live yet." };
      if (!hasWebsite(row)) return { shopId, look: null, words: "This plan has no website." };
      if (!shopData?.get) throw new ControlError(503, "The control room can't read the shop's own records yet.");
      try {
        return { shopId, look: await read(shopId) };
      } catch (failure) {
        throw new ControlError(502, `Couldn't read the shop's records: ${failure.message}`);
      }
    },

    /** The looks every live website wears; a shop that can't be read is named, not fatal. */
    async acrossPresses(claims) {
      adminOf(claims, admins, now().getTime());
      if (!shopData?.get) throw new ControlError(503, "The control room can't read the shops' own records yet.");
      const looks = [];
      const unread = [];
      await eachInTurn(liveShops(await registry.listShops()), 4, async (row) => {
        try {
          looks.push(await read(row.shopId));
        } catch (failure) {
          unread.push({ shopId: row.shopId, pressName: row.pressName ?? row.shopId, error: failure.message });
        }
      });
      return { looks: lookTally(looks), templates: templateTally(looks), shops: looks.length, waiting: looks.filter((l) => l.waiting).length,
        // Choose your look on the admin's first visit: picked one, or pressed Skip (which takes the first suggestion).
        welcome: { picked: looks.filter((l) => l.welcome && !l.welcome.skipped).length, skipped: looks.filter((l) => l.welcome?.skipped).length },
        // Of the shops wearing a ready-made look, how many wear one suggested for what they sell.
        suggested: { took: looks.filter((l) => l.suggested === true).length, of: looks.filter((l) => l.suggested !== null).length }, unread };
    },
  };
}

//   POST /api/control/shop-look   { shopId }: the look a live shop's website wears (read only)
//   GET  /api/control/live-looks  the looks every live website wears, counted (read only)
export function shopLooksRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "POST /api/control/shop-look": (claims, request) => desk.forShop(claims, body(request)),
    "GET /api/control/live-looks": (claims) => desk.acrossPresses(claims),
  };
}
