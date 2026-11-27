// Starter designs (plan "Editable starter websites", step 1, 23 November 2026). A starter is a whole website a new shop
// starts from, the way a Squarespace template or a Shopify theme is: its look (themeLook.ts), the section lists of every
// page it shapes (presetContent.ts: home, shop page, product pages…) and its starter pages. It is made only of what
// Studio edits, so the owner can change every part afterwards (themeCheck.ts `themeProblems`, run on every library
// entry by starterDesign.test.ts).
//
// Where it applies whole: the first pick of a new shop (Choose your look, chooseLook.ts) and the design-before-store
// Studio (designFirst/beforeShop.ts). The shop is new, so there is nothing of the owner's to replace. A later switch in
// Studio › Designs still changes only the look, then offers the layouts as a separate, undoable step (StudioEditor
// `applyLibraryTheme`), because by then the sections are the owner's own work.
import { applyPresetSections, presetPagesToAdd, presetSections, presetStarterPages, type StarterPhotos } from "./presetContent";
import { applyLook } from "./themeSwitch";
import { shopKind } from "../../../shared/shopSells";

/** Section metadata lookup (ThemeEditorExtensions `getSectionMeta`), passed in so this file stays pure. */
export type SectionMetaLookup = (type: string) => any;

/**
 * The whole starter on `design`: its look, then its section lists in place of those pages' sections, in the shop's own
 * words (`w`, shared/shopSells `wordsFor`). Pages without a section list in the starter keep theirs. Pure: the same
 * design and starter always give the same result, so applying a starter twice is the same as once.
 */
export function applyStarter(design: any, theme: any, meta: SectionMetaLookup, w: (text: string) => string = (t) => t, samples?: StarterPhotos): any {
  return applyPresetSections(applyLook(design || {}, theme), theme, meta, w, samples);
}

/** What a starter sets up, for the picker card and the control room: page names and starter page titles. */
export function starterContents(theme: any): { pages: string[]; starterPages: string[] } {
  return {
    pages: Object.keys(presetSections(theme)),
    starterPages: presetStarterPages(theme).map((s) => s.title),
  };
}

/** The starter pages to add to a shop that has `pages`, as drafts (an address already in use is skipped). */
export const starterPagesToAdd = presetPagesToAdd;

/** Sections that show products: a services shop's version of a starter replaces them (`starterForShop`). */
export const PRODUCT_SECTIONS = new Set([
  "CollectionListSection", "FeaturedProductSection", "ProductGridHeaderSection", "ProductCoverCarouselSection",
  "ProductShowcaseGridSection", "StaffNotesTableSection", "FeaturedCollectionSection", "BookSpotlightSection",
  "EphemeraRowSection", "StickyAddToBagSection",
]);

/** Sections that book appointments or classes: a product shop's version of a services starter replaces them. */
export const SERVICE_SECTIONS = new Set(["ServiceMenuSection", "BookTimeSection", "BookingTeamSection", "BookingHoursSection"]);

/**
 * A product or books shop's version of a starter made for appointments or classes (Salon, Workshop; round three,
 * 25 November 2026): the first price list or Book a time row becomes the product grid, keeping its eyebrow and title,
 * and the other booking rows (team, hours, a second booking row) are dropped; a button to Book a time goes to the shop.
 * A starter with none comes back unchanged.
 */
/** A button that sent shoppers to Book a time sends them to the shop instead (a product shop has no bookings). */
/** Points an opening's button (and each slide's) from one destination to another, with the words that go with it. */
function retarget(section: any, from: string, to: string, words: string) {
  const swap = (item: any) => (item?.ctaUrl === from ? { ...item, ctaText: words, ctaUrl: to } : item);
  const settings = section?.settings;
  if (!settings) return section;
  const slides = Array.isArray(settings.slides) ? settings.slides.map(swap) : settings.slides;
  const next = swap(settings);
  return next === settings && slides === settings.slides ? section : { ...section, settings: { ...next, ...(slides ? { slides } : {}) } };
}
const toShop = (section: any) => retarget(section, "/book", "/collections/all", "See the collection");
function goodsVersion<T>(theme: T): T {
  const all = presetSections(theme as any);
  if (!Object.values(all).some((list) => list.some((s) => SERVICE_SECTIONS.has(s.type)))) return theme;
  const sections: Record<string, unknown[]> = {};
  for (const [id, list] of Object.entries(all)) {
    let swapped = false;
    const next: any[] = [];
    for (const section of list) {
      if (!SERVICE_SECTIONS.has(section.type)) { next.push(toShop(section)); continue; }
      if (!swapped && (section.type === "ServiceMenuSection" || section.type === "BookTimeSection")) {
        const { eyebrow, title } = (section.settings || {}) as Record<string, unknown>;
        next.push({ type: "ProductShowcaseGridSection", settings: { ...(eyebrow ? { eyebrow } : {}), ...(title ? { title } : {}) } });
        swapped = true;
      }
    }
    sections[id] = next;
  }
  const t = theme as any;
  return { ...t, content: { ...(t.content || {}), sections } } as T;
}

/** The three designs every starter comes in (one website picker, 26 November 2026, Julian). */
export type StarterKind = "products" | "services" | "both";
/** In a Both design, which half comes first: what most customers come for. */
export type LeadSide = "products" | "services";

/**
 * A starter's kind from what the caller knows: "products", "services" or "both" as they are (admin/servicesSetup.ts
 * `shopKindOf`), or a sign-up answer (shared/shopSells: a services answer is services, anything else products).
 */
export function starterKind(sellsOrKind?: string | null): StarterKind {
  if (sellsOrKind === "both" || sellsOrKind === "products" || sellsOrKind === "services") return sellsOrKind;
  return shopKind(sellsOrKind) === "services" ? "services" : "products";
}

/** An opening button that sent visitors to the shop sends them to Book a time instead. */
const toBooking = (section: any) => retarget(section, "/collections/all", "/book", "Book a time");

/**
 * How each starter's Both design is put together (shop types plan, "Every starter in three versions"): which half leads
 * when the shop hasn't said, and the words of the row the other half brings. A starter not listed leads with products.
 */
const BOTH: Record<string, { lead: LeadSide; services?: { eyebrow?: string; title: string }; products?: { eyebrow?: string; title: string }; time?: boolean }> = {
  "aurel-editorial": { lead: "products", services: { eyebrow: "Book", title: "Your services" } },
  "juniper-slow-season": { lead: "products", services: { eyebrow: "Visit us", title: "Book a class" }, time: true },
  "juniper-catalogue": { lead: "products", services: { eyebrow: "Index, part two", title: "Services and classes" } },
  "starter-gallery": { lead: "products", services: { eyebrow: "Sessions", title: "Book a session" } },
  "starter-warehouse": { lead: "products", services: { eyebrow: "Services", title: "The price list" } },
  "starter-larder": { lead: "products", services: { eyebrow: "At the table", title: "Book a tasting" }, time: true },
  "starter-salon": { lead: "services", products: { eyebrow: "At home", title: "Shop the aftercare" } },
  "starter-workshop": { lead: "services", products: { eyebrow: "Kits and materials", title: "Take it home" } },
  "starter-commission": { lead: "products", services: { eyebrow: "How it works", title: "Book a consult" } },
};

/** The services design: product rows become the price list and the time picker, and hours go before the sign-up band. */
function servicesVersion<T>(theme: T): T {
  const sections: Record<string, unknown[]> = {};
  for (const [id, list] of Object.entries(presetSections(theme as any))) {
    let swapped = 0;
    const next: any[] = [];
    for (const section of list) {
      if (!PRODUCT_SECTIONS.has(section.type)) { next.push(swapped || id !== "heroPage" ? section : toBooking(section)); continue; }
      if (swapped === 0) next.push({ type: "ServiceMenuSection" });
      else if (swapped === 1) next.push({ type: "BookTimeSection" });
      swapped++;
    }
    // Every services home page has a time picker: one product row gives the price list, so the picker follows it.
    if (swapped === 1 && !next.some((s) => s.type === "BookTimeSection")) next.splice(next.findIndex((s) => s.type === "ServiceMenuSection") + 1, 0, { type: "BookTimeSection" });
    if (swapped && !next.some((s) => s.type === "BookingHoursSection")) {
      const signUp = next.findIndex((s) => s.type === "NewsletterSection");
      next.splice(signUp < 0 ? next.length : signUp, 0, { type: "BookingHoursSection" });
    }
    sections[id] = next;
  }
  const t = theme as any;
  // Nothing to buy: the header starts without a bag (Studio › Style › Header shows it again), and nothing ships, so the
  // starter's Shipping & returns page stays out (About and Contact still come).
  const pages = Array.isArray(t.content?.starterPages) ? { starterPages: t.content.starterPages.filter((p: string) => p !== "shipping") } : {};
  return { ...t, global: { ...(t.global || {}), hideCartButton: true }, content: { ...(t.content || {}), sections, ...pages } } as T;
}

/** The Both design: the lead half as its own design, with one row from the other half after its last row. */
function bothVersion<T>(theme: T, lead?: LeadSide | null): T {
  const t = theme as any;
  const recipe = BOTH[t?.id] || { lead: "products" as LeadSide };
  const side = lead === "products" || lead === "services" ? lead : recipe.lead;
  const base: any = side === "services" ? servicesVersion(theme) : goodsVersion(theme);
  const sections: Record<string, unknown[]> = {};
  for (const [id, list] of Object.entries(presetSections(base))) {
    const next: any[] = [...list];
    if (id === "heroPage") {
      const own = side === "services" ? (s: any) => SERVICE_SECTIONS.has(s.type) && s.type !== "BookingHoursSection" : (s: any) => PRODUCT_SECTIONS.has(s.type);
      let at = -1;
      next.forEach((s, i) => { if (own(s)) at = i; });
      const signUp = next.findIndex((s) => s.type === "NewsletterSection");
      if (at < 0) at = (signUp < 0 ? next.length : signUp) - 1;
      const words = side === "services" ? recipe.products : recipe.services;
      const settings = words ? { ...(words.eyebrow ? { eyebrow: words.eyebrow } : {}), title: words.title } : undefined;
      const extra: any[] = side === "services"
        ? [{ type: "ProductShowcaseGridSection", ...(settings ? { settings } : {}) }]
        : [{ type: "ServiceMenuSection", ...(settings ? { settings } : {}) }, ...(recipe.time ? [{ type: "BookTimeSection" }] : [])];
      next.splice(at + 1, 0, ...extra);
      if (!next.some((s) => s.type === "BookingHoursSection")) {
        const end = next.findIndex((s) => s.type === "NewsletterSection");
        next.splice(end < 0 ? next.length : end, 0, { type: "BookingHoursSection" });
      }
    }
    sections[id] = next;
  }
  // Both sells things, so the bag stays (the services half's header setting is not carried over).
  const global = { ...(base.global || {}) };
  if (side === "services") { if ((t.global || {}).hideCartButton === undefined) delete global.hideCartButton; else global.hideCartButton = t.global.hideCartButton; }
  // …and so does its Shipping & returns page.
  const pages = t.content?.starterPages ? { starterPages: t.content.starterPages } : {};
  return { ...base, global, content: { ...(base.content || {}), sections, ...pages } } as T;
}

/**
 * The starter in the design for a kind of shop (24 November 2026; Both added 26 November 2026, Julian: "all the
 * starter websites have to have a product design, service design, and a design that can do both"). `sellsOrKind` is a
 * kind ("products", "services", "both") or a sign-up answer (`starterKind`); `lead` picks which half comes first in
 * Both, and when it is missing the starter's own character decides (`BOTH`).
 *
 * - Products: the starter as it is, or for a starter made for appointments or classes its product version (`goodsVersion`).
 * - Services: the first product row becomes the price list, the second the Book a time cards (a lone row gets both),
 *   any other product row goes, opening hours come before the sign-up band, an opening that pointed to the shop points
 *   to Book a time, and the header starts without a bag.
 * - Both: the lead half's design, then the other half's row (the price list, or "Shop the aftercare" and the like).
 *
 * Every other part of the design is kept, and a product or books shop gets a product starter back unchanged.
 */
export function starterForShop<T>(theme: T, sellsOrKind?: string | null, lead?: LeadSide | null): T {
  if (!theme) return theme;
  const kind = starterKind(sellsOrKind);
  if (kind === "both") return bothVersion(theme, lead);
  if (kind === "services") return servicesVersion(theme);
  return goodsVersion(theme);
}
