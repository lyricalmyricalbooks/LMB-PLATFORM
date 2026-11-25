// Make it yours (round three phase 3, 25 November 2026, plan https://claude.ai/artifact/RAGCAzCvap1KAaXtWr1Jnj): right
// after a new shop picks its starter, Studio opens on four short steps beside the real preview: name and logo, colours,
// fonts, pages and homepage. Pure rules only; the panel is StudioMakeItYours.tsx.
//
// Nothing here is a second way of styling. Every choice is the starter itself in another of its styles (starterStyles),
// the same style wearing the logo's colour (guidedStart `withLogoColours`), a pair of fonts from FONT_CHOICES, or the
// starter's own home sections in another order, all written with Studio's usual keys as one undoable change each.
import { libraryLook, lookFeel, STARTER_SITES, type LibraryTheme, type LookFeel } from "../lookGallery";
import { withLogoColours } from "../guidedStart";
import { shopKind } from "../../../shared/shopSells";
import { applyPresetSections, presetSections, sampleSectionsLeft, type PresetSectionSpec, type StarterPhotos } from "./presetContent";
import { PRODUCT_SECTIONS, SERVICE_SECTIONS, starterForShop, type SectionMetaLookup } from "./starterDesign";
import { stylesFor, withStyle } from "./starterStyles";
import { themeLookKeys } from "./themeLook";
import { applyLook } from "./themeSwitch";
import { getSections, setSections, type SectionTarget } from "./studioModel";
import { isGroupSurface } from "../../features/site/sectionGroups";
import type { SetupItem } from "./setupChecklist";

export const MAKE_STEPS = [
  { id: "name", title: "Name and logo", hint: "Your shop's name shows in the header, at checkout and in every email." },
  { id: "colours", title: "Colours", hint: "Try a style. One click puts it on your whole shop, and Undo takes it back." },
  { id: "fonts", title: "Fonts", hint: "One font for titles, one for reading. Each pair is chosen to suit this starter." },
  { id: "pages", title: "Pages and homepage", hint: "Tick the pages you want, and pick how your homepage is laid out." },
] as const;
export type MakeStepId = (typeof MAKE_STEPS)[number]["id"];

/** The starter the design was made from (its `themeBase`), in the style it wears, or null for a look that isn't a starter. */
export function starterOf(design: any): { theme: LibraryTheme; style?: string } | null {
  const id = String(design?.themeBase?.id || "");
  const theme = STARTER_SITES.includes(id) ? libraryLook(id) : undefined;
  if (!theme) return null;
  const style = typeof design?.themeBase?.style === "string" && design.themeBase.style ? design.themeBase.style : undefined;
  return { theme, style };
}

// ---- Colours -------------------------------------------------------------------------------------------------------

export type ColourChoice = { id: string; name: string; swatches: [string, string, string]; style: string; theme: any; yours: boolean };

/**
 * The starter's own styles, then (when the logo's colour could be read) the same three styles in the logo's colour. A
 * logo colour only replaces the accent, made readable on each style's page, so every band of the style still reads.
 */
export function colourChoices(design: any, logoColours?: string[] | null): ColourChoice[] {
  const base = starterOf(design)?.theme;
  if (!base) return [];
  const styles = stylesFor(base.id);
  const own = styles.map((s) => ({ id: s.id, name: s.name, swatches: s.swatches, style: s.id, theme: withStyle(base, s.id), yours: false }));
  if (!logoColours?.length) return own;
  const yours = own.flatMap((c) => {
    const theme = withLogoColours(c.theme, logoColours);
    if (theme === c.theme) return [];
    const look = themeLookKeys(theme, {});
    return [{ ...c, id: `${c.style}+logo`, name: `${c.name} in your colour`, theme, yours: true, swatches: [c.swatches[0], c.swatches[1], String(look.primaryColor)] as [string, string, string] }];
  });
  return [...own, ...yours];
}

const FONT_KEYS = ["headingFont", "bodyFont", "headingWeight"] as const;

/** The section settings the starter's styles change (a band's own colour or colour scheme), by section type. */
function styledSectionKeys(baseId: string): Record<string, Set<string>> {
  const keys: Record<string, Set<string>> = {};
  for (const style of stylesFor(baseId)) {
    for (const [type, patch] of Object.entries(style.sections || {})) {
      keys[type] ||= new Set();
      for (const k of Object.keys(patch)) keys[type].add(k);
    }
  }
  return keys;
}

/** Every section list of the design that the starter shapes (home, the sign-up band on every page…). */
const surfacesOf = (theme: any) => Object.keys(presetSections(theme));
const targetOf = (id: string): SectionTarget => (isGroupSurface(id) ? { kind: "global", group: id } : { kind: "template", id });

/**
 * A colour choice on the design: the style's look (applyLook, which also records it as the design's starter and style),
 * and the band colours that style gives its sections, laid over the bands the starter brought. A band setting no style
 * changes is left alone, so the owner's own band edits stay. `keepFonts` keeps a font pair the owner already picked.
 */
export function applyColours(design: any, choice: ColourChoice, meta: SectionMetaLookup, keepFonts = false): any {
  let next = applyLook(design, choice.theme);
  if (keepFonts) for (const k of FONT_KEYS) { if (design?.[k] !== undefined) next = { ...next, [k]: design[k] }; }
  const base = starterOf(design)?.theme || libraryLook(choice.theme.id);
  if (!base) return next;
  const keys = styledSectionKeys(base.id);
  const styled = presetSections(choice.theme);
  for (const surface of surfacesOf(base)) {
    const target = targetOf(surface);
    const list = getSections(next, target);
    if (!list.length) continue;
    let changed = false;
    const updated = list.map((section: any) => {
      const own = keys[section?.type];
      if (!own) return section;
      const spec = styled[surface]?.find((s) => s.type === section.type)?.settings || {};
      const defaults = meta(section.type)?.defaults || {};
      const settings = { ...(section.settings || {}) };
      for (const k of own) {
        const value = k in spec ? spec[k] : defaults[k];
        if (value === undefined) delete settings[k]; else settings[k] = value;
      }
      changed = true;
      return { ...section, settings };
    });
    if (changed) next = setSections(next, target, updated);
  }
  return next;
}

/** The colour choice the design wears now (its page, words and accent match), or "". */
export function currentColour(design: any, choices: ColourChoice[]): string {
  const same = (a: unknown, b: unknown) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
  const hit = choices.find((c) => {
    const look = themeLookKeys(c.theme, {});
    return same(look.backgroundColor, design?.backgroundColor) && same(look.textColor, design?.textColor) && same(look.primaryColor, design?.primaryColor);
  });
  return hit?.id || "";
}

// ---- Fonts ---------------------------------------------------------------------------------------------------------

export type FontPairing = { id: string; label: string; heading: string; body: string; headingWeight: number; feels: LookFeel[] };

/** Font pairs from FONT_CHOICES, each heading weight one Google serves (themeFonts.test.ts checks them). */
export const FONT_PAIRINGS: FontPairing[] = [
  { id: "editorial", label: "Editorial", heading: "Cormorant Garamond", body: "Manrope", headingWeight: 500, feels: ["quiet", "warm"] },
  { id: "modern-serif", label: "Modern serif", heading: "Instrument Serif", body: "Inter", headingWeight: 400, feels: ["quiet"] },
  { id: "bookish", label: "Bookish", heading: "Playfair Display", body: "Libre Baskerville", headingWeight: 600, feels: ["warm", "quiet"] },
  { id: "soft-serif", label: "Soft serif", heading: "DM Serif Display", body: "DM Sans", headingWeight: 400, feels: ["warm"] },
  { id: "journal", label: "Journal", heading: "Newsreader", body: "Manrope", headingWeight: 500, feels: ["quiet", "warm"] },
  { id: "clean", label: "Clean", heading: "Space Grotesk", body: "Inter", headingWeight: 600, feels: ["quiet", "bold"] },
  { id: "friendly", label: "Friendly", heading: "Fredoka", body: "Nunito", headingWeight: 600, feels: ["warm", "bold"] },
  { id: "poster", label: "Poster", heading: "Anton", body: "Archivo", headingWeight: 400, feels: ["bold", "dark"] },
  { id: "tall", label: "Tall and strong", heading: "Big Shoulders Display", body: "Archivo", headingWeight: 800, feels: ["bold", "dark"] },
  { id: "studio", label: "Studio", heading: "Syne", body: "Work Sans", headingWeight: 700, feels: ["bold", "dark"] },
];

/** Six pairs for this starter: its own fonts first, then the pairs that suit its feel, then the rest. */
export function fontChoices(design: any): FontPairing[] {
  const base = starterOf(design);
  const look = base ? themeLookKeys(withStyle(base.theme, base.style), {}) : {};
  const ownPair: FontPairing | null = base && look.headingFont && look.bodyFont
    ? { id: "starter", label: "As designed", heading: String(look.headingFont), body: String(look.bodyFont), headingWeight: Number(look.headingWeight) || 400, feels: [] }
    : null;
  const feel = base ? lookFeel(base.theme) : "quiet";
  const others = FONT_PAIRINGS.filter((p) => !ownPair || p.heading !== ownPair.heading || p.body !== ownPair.body);
  const ranked = [...others.filter((p) => p.feels.includes(feel)), ...others.filter((p) => !p.feels.includes(feel))];
  return [...(ownPair ? [ownPair] : []), ...ranked].slice(0, 6);
}

export const applyFonts = (design: any, pair: FontPairing) => ({ ...design, headingFont: pair.heading, bodyFont: pair.body, headingWeight: pair.headingWeight });
export const currentFonts = (design: any, pairs: FontPairing[]) => pairs.find((p) => p.heading === design?.headingFont && p.body === design?.bodyFont)?.id || "";

// ---- Pages ---------------------------------------------------------------------------------------------------------

/** The page starters (pageStarters.ts) offered as ticks: shipping only for shops that post things. */
export function pageChoices(sells?: string | null): string[] {
  return shopKind(sells) === "services" ? ["about", "faq", "contact", "journal"] : ["about", "shipping", "faq", "contact", "journal"];
}

/** Whether a page made from a starter can be taken away again: still a draft with the starter's words, untouched. */
export const untouchedStarterPage = (page: any, starterBody: string) => page?.status === "draft" && String(page?.body || "") === starterBody;

// ---- Homepage ------------------------------------------------------------------------------------------------------

export type HomeShape = { id: "designed" | "selling-first" | "short"; label: string; hint: string; sections: PresetSectionSpec[] };

const selling = (s: PresetSectionSpec) => PRODUCT_SECTIONS.has(s.type) || SERVICE_SECTIONS.has(s.type);

/** The starter's home sections in this shop's version and style (services shops get their service sections). */
function homeSpecs(design: any, sells?: string | null): PresetSectionSpec[] {
  const base = starterOf(design);
  if (!base) return [];
  return presetSections(starterForShop(withStyle(base.theme as any, base.style), sells)).heroPage || [];
}

/**
 * Three ways to lay out the homepage, all made of the starter's own sections: as designed, what you sell straight after
 * the opening, and a short page (the opening, what you sell, and the last band). A shape that would equal another is
 * left out, so every card shows a real difference.
 */
export function homeShapes(design: any, sells?: string | null): HomeShape[] {
  const all = homeSpecs(design, sells);
  if (!all.length) return [];
  const services = shopKind(sells) === "services";
  const sell = all.filter(selling);
  const out: HomeShape[] = [{ id: "designed", label: "As designed", hint: `${all.length} sections, in the starter's order`, sections: all }];
  const first = [all[0], ...sell.filter((s) => s !== all[0]), ...all.slice(1).filter((s) => !selling(s))];
  if (sell.length && first.some((s, i) => s !== all[i])) {
    out.push({ id: "selling-first", label: services ? "Services first" : "Products first", hint: `${services ? "Your services" : "Your products"} straight after the opening`, sections: first });
  }
  const last = all[all.length - 1];
  const short = [all[0], ...(sell[0] && sell[0] !== all[0] ? [sell[0]] : []), ...(last !== all[0] && !selling(last) ? [last] : [])];
  if (short.length >= 2 && short.length < all.length) out.push({ id: "short", label: "Short and simple", hint: `Just ${short.length} sections`, sections: short });
  return out;
}

/** The homepage in one shape: its sections replace Home's in the draft (in the shop's words, with sample photos). */
export function applyHomeShape(design: any, shape: HomeShape, meta: SectionMetaLookup, w: (t: string) => string = (t) => t, samples?: StarterPhotos): any {
  return applyPresetSections(design, { content: { sections: { heroPage: shape.sections } } }, meta, w, samples);
}

/** The shape Home has now (same section types in the same order), or "". */
export function currentHomeShape(design: any, shapes: HomeShape[]): string {
  const types = getSections(design, { kind: "template", id: "heroPage" }).map((s: any) => s.type).join(",");
  return shapes.find((s) => s.sections.map((x) => x.type).join(",") === types)?.id || "";
}

// ---- Write my words ------------------------------------------------------------------------------------------------

const OPENING = /Opening|Hero|Banner/;

/** Where the homepage's opening keeps its headline and its line under it. */
function openingAt(design: any): { index: number; title: string; body: string } | null {
  const list = getSections(design, { kind: "template", id: "heroPage" });
  const index = list.findIndex((s: any, i: number) => i < 3 && OPENING.test(String(s?.type)));
  if (index < 0) return null;
  const settings = list[index]?.settings || {};
  const body = ["body", "subtitle", "description"].find((k) => typeof settings[k] === "string") || "body";
  return { index, title: "title", body };
}

/**
 * The owner's own words on the homepage's opening: the headline and the line under it. Used by Write my words, from
 * the owner's sentence alone or from the AI's draft of it. An empty headline keeps the one there.
 */
export function withOpeningWords(design: any, words: { headline?: string; intro: string }): any {
  const at = openingAt(design);
  if (!at || !words.intro.trim()) return design;
  const target = { kind: "template" as const, id: "heroPage" };
  const list = getSections(design, target).map((s: any, i: number) => {
    if (i !== at.index) return s;
    const settings = { ...(s.settings || {}), [at.body]: words.intro.trim() };
    if (words.headline?.trim()) { settings[at.title] = words.headline.trim(); if ("accentWord" in settings) settings.accentWord = ""; }
    return { ...s, settings };
  });
  return setSections(design, target, list);
}

export const hasOpening = (design: any) => openingAt(design) !== null;

// ---- The four things left ------------------------------------------------------------------------------------------

/**
 * The set-up checklist narrowed to the four things a new starter still needs: real photos, real products (or services),
 * a look on a phone and publishing. Each says where Studio takes the owner (the same "Show me" as Workbench › To-dos).
 */
export function nextFour(i: { design: any; sells?: string | null; hasOwnProducts: boolean; phoneChecked: boolean; published: boolean }): SetupItem[] {
  const services = shopKind(i.sells) === "services";
  const samples = sampleSectionsLeft(i.design);
  return [
    { id: "photos", title: "Replace the sample photos", detail: samples ? `${samples} ${samples === 1 ? "section still shows" : "sections still show"} sample photos or words. Click one in the preview to change it.` : "Every section shows your own photos and words.",
      done: samples === 0, go: { kind: "tab", tab: "sections" } },
    { id: "products", title: services ? "Add your services" : "Add your own products", detail: services ? "Your services and prices take the place of the examples." : "Your products take the place of the examples, which are never sold.",
      done: i.hasOwnProducts, go: { kind: "admin", hash: services ? "#bookings" : "#catalog" } },
    { id: "phone", title: "Check it on a phone", detail: "Most shoppers visit on a phone. Switch the preview to phone size.",
      done: i.phoneChecked, go: { kind: "device", device: "mobile" } },
    { id: "publish", title: "Publish", detail: "Shoppers see your site once you publish it.", done: i.published, go: { kind: "publish" } },
  ];
}
