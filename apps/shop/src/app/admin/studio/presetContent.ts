// What a theme preset brings besides its look (plan 1.23): section lists for Studio's page templates and starter
// pages. Applying a preset still changes only the look; Studio then offers its content as a separate, undoable step
// that the owner confirms (StudioEditor › applyLibraryTheme).
//
// - Section lists replace the sections of the templates the preset names (the home page, a book page…) in the draft,
//   so nothing reaches shoppers before Publish, and Undo brings the old sections back.
// - Starter pages come from Studio › Pages' starters (pageStarters.ts). Each is added as a draft page, and only when
//   no page already uses its address, so a press's own pages are never replaced or doubled.
import { HOME_LAYOUT_TEMPLATES } from "./homeLayouts";
import { PAGE_STARTERS, pageFromStarter, type PageStarter } from "./pageStarters";
import { getSections, makeSection, setSections } from "./studioModel";

export type PresetSectionSpec = { type: string; settings?: Record<string, any> };

export type PresetContent = {
  /** Section lists by Studio page template (heroPage = Home, productPage = book page…). */
  sections?: Record<string, PresetSectionSpec[]>;
  /** Studio › Pages starters this look comes with, by starter id (about, shipping, contact…). */
  starterPages?: string[];
};

/** The page templates a preset may hold sections for, with the name the owner sees. */
export const PRESET_SECTION_TEMPLATES: Record<string, string> = {
  heroPage: "Home",
  storefront: "Shop page",
  productPage: "Book pages",
  collectionPage: "Category pages",
  cartPage: "Bag page",
  page404: "Missing-page page",
  wishlistPage: "Wishlist",
  accountPage: "Customer account",
  trackingPage: "Order tracking",
};

type PresetLike = { homeLayoutTemplate?: string; content?: PresetContent };

/** Every section list the preset holds: its own, plus its home layout (homeLayoutTemplate) for Home unless it gives one. */
export function presetSections(preset: PresetLike): Record<string, PresetSectionSpec[]> {
  const out: Record<string, PresetSectionSpec[]> = {};
  const home = HOME_LAYOUT_TEMPLATES.find(t => t.id === preset?.homeLayoutTemplate);
  if (home) out.heroPage = home.sections;
  for (const [id, list] of Object.entries(preset?.content?.sections || {})) {
    if (id in PRESET_SECTION_TEMPLATES && Array.isArray(list) && list.length) out[id] = list;
  }
  return out;
}

/** The starter pages the preset comes with (unknown ids and the blank page are ignored). */
export function presetStarterPages(preset: PresetLike): PageStarter[] {
  const ids = new Set(preset?.content?.starterPages || []);
  return PAGE_STARTERS.filter(s => s.id !== "blank" && ids.has(s.id));
}

export function hasPresetContent(preset: PresetLike): boolean {
  return Object.keys(presetSections(preset)).length > 0 || presetStarterPages(preset).length > 0;
}

/** The draft with the preset's section lists in place of those templates' sections. Everything else is kept. */
export function applyPresetSections(design: any, preset: PresetLike, meta: (type: string) => any): any {
  let next = design;
  for (const [id, specs] of Object.entries(presetSections(preset))) {
    const sections = specs.map(s => makeSection(s.type, { ...(meta(s.type)?.defaults || {}), ...(s.settings || {}) }));
    next = setSections(next, { kind: "template", id }, sections);
  }
  return next;
}

/** The draft pages to add for the preset's starters: one per starter whose address no page uses yet. */
export function presetPagesToAdd(preset: PresetLike, pages: { slug?: string }[]) {
  const used = new Set(pages.map(p => p.slug));
  const added: ReturnType<typeof pageFromStarter>[] = [];
  for (const starter of presetStarterPages(preset)) {
    if (used.has(starter.slug)) continue;
    const page = { ...pageFromStarter(starter, [...pages, ...added]), status: "draft" as const };
    added.push(page);
    used.add(page.slug);
  }
  return added;
}

/** Plain lines for the confirm step: what would be replaced and added. */
export function presetContentSummary(design: any, preset: PresetLike, pages: { slug?: string; title?: string }[]): string[] {
  const lines = Object.entries(presetSections(preset)).map(([id, specs]) => {
    const now = getSections(design, { kind: "template", id }).length;
    return `${PRESET_SECTION_TEMPLATES[id]}: its ${specs.length} sections replace ${now ? `your ${now} current section${now === 1 ? "" : "s"}` : "the default ones"}`;
  });
  const adding = presetPagesToAdd(preset, pages);
  const kept = presetStarterPages(preset).filter(s => pages.some(p => p.slug === s.slug));
  if (adding.length) lines.push(`Pages added as drafts (not shown to shoppers until you publish them): ${adding.map(p => p.title).join(", ")}`);
  if (kept.length) lines.push(`Kept as they are: your own ${kept.map(s => s.title).join(", ")} page${kept.length === 1 ? "" : "s"}`);
  return lines;
}
