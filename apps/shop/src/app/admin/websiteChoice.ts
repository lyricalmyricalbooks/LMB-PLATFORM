// The rules behind Online store's website picker (plan "One website picker: starters and their colours", 26 November 2026). Online store is the one
// place a shop chooses its website. It lists the whole-website starters, each with its colour versions, shown in the shop's
// own kind (products, services or both), and keeps the design from before a change for 30 days so the owner can switch
// back. The pictures are real screenshots of each starter (public/starters/thumbs, scripts/starter-thumbs.mjs), never a
// drawing. Nothing here publishes: a new website goes into Studio's draft, and the shop changes when the owner publishes.

import { libraryLook, offeredStarters, offeredStyles, STARTER_SITES, type StarterChoice } from "./lookGallery";
import { stylesFor, withStyle } from "./studio/starterStyles";
import type { LeadSide, StarterKind } from "./studio/starterDesign";
import type { SavedTheme } from "./studio/savedThemes";

/** One line per starter, what it is like and who it suits, in plain words. */
export const STARTER_BLURB: Record<string, string> = {
  "aurel-editorial": "A big serif headline, a staggered shop and your name huge in the footer. Made for clothing and design objects.",
  "juniper-slow-season": "A full photo in bold capitals, then calm colour bands. Made for seasonal collections.",
  "juniper-catalogue": "A numbered catalogue, a list shop page and a Menu button. Made for books, prints and small ranges.",
  "starter-gallery": "A photo that fills the screen and products shown large. Made for makers with a few pieces.",
  "starter-warehouse": "A search bar up top, a huge headline and framed products in a dense grid. Made for a big range.",
  "starter-larder": "A warm photo banner, a running line and quick add. Made for food and drink.",
  "starter-salon": "A side menu, a soft blush page and your prices up front. Made for appointments.",
  "starter-workshop": "A giant headline, a photo mosaic and class times. Made for classes and workshops.",
  "starter-commission": "A side menu, past work shown large and an enquiry form. Made for work made to order.",
};

/** Which kinds of shop each starter was made for, best first. The rest suit products and both. */
const MADE_FOR: Record<string, StarterKind[]> = {
  "starter-salon": ["services", "both"],
  "starter-workshop": ["services", "both"],
  "starter-commission": ["both", "services", "products"],
};
const suits = (id: string, kind: StarterKind) => (MADE_FOR[id] || ["products", "both"]).includes(kind);

/** The starters a shop is offered, those made for its kind first, otherwise in the control room's order. */
export function startersForKind(kind: StarterKind, choice?: StarterChoice): string[] {
  const offered = offeredStarters(choice);
  return [...offered.filter((id) => suits(id, kind)), ...offered.filter((id) => !suits(id, kind))];
}

export const KIND_WORDS: Record<StarterKind, string> = { products: "Products", services: "Services", both: "Products and services" };

/** The website a design is built on: a starter (with its colour version) or an older look kept as it is. */
export type CurrentWebsite = { id: string | null; style: string | null; name: string };
export function currentWebsite(design: any): CurrentWebsite {
  const base = design?.themeBase;
  const id = typeof base?.id === "string" && STARTER_SITES.includes(base.id) ? base.id : null;
  if (!id) {
    const name = typeof base?.name === "string" && base.name.trim() ? base.name.trim() : "Your own design";
    return { id: null, style: null, name };
  }
  const styles = stylesFor(id);
  const style = styles.some((s) => s.id === base.style) ? base.style : styles[0]?.id || null;
  return { id, style, name: libraryLook(id)?.name || id };
}

/** The starter with one of its colour versions applied (its own colours when the version is unknown). */
export function starterTheme(id: string, style?: string | null): any {
  const theme = libraryLook(id);
  return theme ? withStyle(theme, style) : null;
}

/** The colour versions a shop is offered for a starter (the control room can hide some; the starter's own always shows). */
export const coloursOf = (id: string, choice?: StarterChoice) => offeredStyles(id, choice);

/** A real screenshot of the starter in that colour version (720 × 450). */
export function thumbUrl(id: string, style: string | null | undefined, base: string = import.meta.env.BASE_URL || "/"): string {
  const s = style || stylesFor(id)[0]?.id || "";
  return `${base.replace(/\/?$/, "/")}starters/thumbs/${id}-${s}.jpg`;
}

/** The kind a Preview shows the starter as, and which half of a Both shop comes first. */
export type ShowAs = { kind: StarterKind; lead?: LeadSide };

// ---- Switch back ------------------------------------------------------------------------------------------------------

/** The design from before the last website change sits with the saved designs under this id, for 30 days. */
export const SWITCH_BACK_ID = "switch-back";
export const SWITCH_BACK_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export type SwitchBack = SavedTheme & { from: string; to: string };

/** Keeps `design` (the website called `from`) so the owner can come back to it after changing to `to`. */
export function switchBackEntry(design: any, from: string, to: string, now = new Date()): SwitchBack {
  return { id: SWITCH_BACK_ID, name: `Your website before ${to}`, savedAt: now.toISOString(), design: JSON.parse(JSON.stringify(design ?? {})), from, to };
}

/** The saved designs with `entry` as the one design to switch back to (an older one is replaced, never added to). */
export const withSwitchBack = (list: SavedTheme[] | undefined, entry: SwitchBack): SavedTheme[] => [entry, ...(list || []).filter((t) => t.id !== SWITCH_BACK_ID)];

/** The design to switch back to, while it is younger than 30 days. */
export function switchBackOffer(list: SavedTheme[] | undefined, now = new Date()): SwitchBack | null {
  const entry = (list || []).find((t) => t.id === SWITCH_BACK_ID) as SwitchBack | undefined;
  if (!entry?.design || !entry.savedAt) return null;
  const age = now.getTime() - new Date(entry.savedAt).getTime();
  return age >= 0 && age <= SWITCH_BACK_DAYS * DAY ? entry : null;
}

/** "until 26 December": the last day the owner can switch back. */
export function switchBackUntil(entry: SwitchBack): string {
  const end = new Date(new Date(entry.savedAt).getTime() + SWITCH_BACK_DAYS * DAY);
  return end.toLocaleDateString("en-CA", { month: "long", day: "numeric" });
}

/** The designs the owner saved themselves (never the switch-back copy). */
export const ownSavedDesigns = (list: SavedTheme[] | undefined) => (list || []).filter((t) => t.id !== SWITCH_BACK_ID);
