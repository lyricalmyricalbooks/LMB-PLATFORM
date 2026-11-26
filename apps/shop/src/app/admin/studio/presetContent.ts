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
import { isGroupSurface } from "../../features/site/sectionGroups";
import { getSections, makeSection, setSections, type SectionTarget } from "./studioModel";

export type PresetSectionSpec = { type: string; settings?: Record<string, any> };

export type PresetContent = {
  /** Section lists by Studio page template (heroPage = Home, productPage = book page…). */
  sections?: Record<string, PresetSectionSpec[]>;
  /** Studio › Pages starters this look comes with, by starter id (about, shipping, contact…). */
  starterPages?: string[];
  /** The book page's buy box, top to bottom (Page › Buy box blocks); built-in and custom block types only. */
  productBlocks?: { type: string; hidden?: boolean; settings?: Record<string, any> }[];
  /** A starter's own sample shop: products with their own photos, shown whenever the starter is previewed. */
  sampleProducts?: { title: string; maker?: string; price: number; photo: string }[];
};

const sampleSlug = (title: string) => title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * A starter's sample products as the shop's pages read books, so previewing a starter shows its own finished sample
 * shop instead of the press's real products. Never saved anywhere. Empty for a look without samples.
 */
export function starterSampleBooks(preset: any): any[] {
  const list: NonNullable<PresetContent["sampleProducts"]> = preset?.content?.sampleProducts || [];
  return list.map((p, i) => ({
    id: `starter-sample-${i + 1}`, slug: sampleSlug(p.title), title: p.title, authorName: p.maker || "", author: p.maker || "",
    retailPrice: p.price, stockLevel: 8, status: "published", isFeatured: i < 4, featured: i < 4,
    categories: [p.maker || "Featured"], photos: [{ id: `s${i + 1}`, url: p.photo, alt: p.title }],
    description: "A sample product. Your own products take its place once you add them.",
    createdAt: new Date(Date.UTC(2026, 10, 20 - i)).toISOString(), sample: true,
  }));
}

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
  bookingsPage: "Book a time",
  eventsPage: "Events",
  classesPage: "Classes",
  supportPage: "Support",
  membershipPage: "Membership",
  rentalsPage: "Rentals",
  // Every-page section groups (starter websites step 3): what sits under the header and above the footer on every page.
  headerSections: "Under the header (every page)",
  globalSections: "Above the footer (every page)",
};

/** Where a preset's section list goes: a section group is a root list, any other id is a page template. */
const targetOf = (id: string): SectionTarget =>
  isGroupSurface(id) ? { kind: "global", group: id } : { kind: "template", id };

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
  return Object.keys(presetSections(preset)).length > 0 || presetStarterPages(preset).length > 0 || !!preset?.content?.productBlocks?.length;
}

// Settings that hold an address, a picture or an id, never words: the shop's words leave them alone, so a link such as
// /collections/books keeps working.
const NOT_WORDS = /url|href|link|image|src|slug|handle|collection|icon|video|(?:^|[a-z])Id$|^id$/i;

/**
 * A section's starter settings in the shop's words (code plan 12.18): a shop that doesn't sell books gets "New products"
 * instead of "New books" in the layouts it picks. Only the words change; addresses, pictures and ids are kept.
 */
export function wordedSettings(settings: Record<string, any>, w: (text: string) => string): Record<string, any> {
  const word = (key: string, value: any): any => {
    if (typeof value === "string") return NOT_WORDS.test(key) || /^(?:\/|https?:|#)/.test(value) ? value : w(value);
    if (Array.isArray(value)) return value.map((v) => word(key, v));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, word(k, v)]));
    return value;
  };
  return word("", settings);
}

/** Sections whose words are already a services shop's (Book a time, price list, team, hours, reviews). */
const SERVICES_WORDED = new Set(["BookTimeSection", "ServiceMenuSection", "BookingTeamSection", "BookCallSection", "BookingHoursSection", "ClientReviewsSection"]);

/** A sample photo for a starter's empty picture spots (starterSamples.ts `samplePhotosFor`). */
export type SamplePhoto = { url: string; alt: string };
/** The sample photos and, per section type, the picture fields they may fill (`starterPhotos.ts`). */
export type StarterPhotos = { photos: SamplePhoto[]; imageKeys: (type: string) => string[] };

/**
 * Fills a new section's empty pictures with the shop's sample photos, in turn (24 November 2026, rethink step 2): the
 * section type's own picture fields (`imageKeys`) and the `imageUrl` of each item in its lists (columns, slides,
 * cards). A picture the starter brings is kept, and alt text is set only where it is empty. No photos = unchanged.
 */
export function samplePhotoFiller(samples?: StarterPhotos): (type: string, settings: Record<string, any>) => Record<string, any> {
  const photos = samples?.photos || [];
  let turn = 0;
  const next = () => photos[turn++ % photos.length];
  const fillKey = (item: Record<string, any>, key: string) => {
    if (item[key]) return item;
    const photo = next();
    const alt = key.replace(/Url$/, "Alt");
    return { ...item, [key]: photo.url, ...(alt !== key && !item[alt] ? { [alt]: photo.alt } : {}) };
  };
  return (type, settings) => {
    if (!photos.length || !settings || typeof settings !== "object") return settings;
    let out: Record<string, any> = settings;
    for (const key of samples!.imageKeys(type)) out = fillKey(out, key);
    for (const [key, value] of Object.entries(out)) {
      if (Array.isArray(value) && value.some(v => v && typeof v === "object" && "imageUrl" in v)) {
        out = { ...out, [key]: value.map(v => (v && typeof v === "object" && "imageUrl" in v ? fillKey(v, "imageUrl") : v)) };
      }
    }
    return out;
  };
}

/**
 * The draft with the preset's section lists in place of those templates' sections. Everything else is kept. `w` is the
 * shop's words (useShopWords): a books shop's layouts come in exactly as written.
 */
export function applyPresetSections(design: any, preset: PresetLike, meta: (type: string) => any, w: (text: string) => string = (t) => t, samples?: StarterPhotos): any {
  let next = design;
  const fill = samplePhotoFiller(samples);
  for (const [id, specs] of Object.entries(presetSections(preset))) {
    // Marked as the starter's sample until the owner edits it (Studio's Sample badge).
    // Booking sections are written in services words already ("Book" is the verb there), so they are never re-worded.
    const sections = specs.map(s => {
      const settings = { ...(meta(s.type)?.defaults || {}), ...(s.settings || {}) };
      return { ...makeSection(s.type, fill(s.type, SERVICES_WORDED.has(s.type) ? settings : wordedSettings(settings, w))), sample: true };
    });
    next = setSections(next, targetOf(id), sections);
  }
  const blocks = preset?.content?.productBlocks;
  if (Array.isArray(blocks) && blocks.length) {
    const productInfoBlocks = blocks.map((b, i) => ({ id: `${b.type}-${i}`, type: b.type, ...(b.hidden ? { hidden: true } : {}), ...(b.settings ? { settings: wordedSettings(b.settings, w) } : {}) }));
    next = { ...next, productPage: { ...(next.productPage || {}), productInfoBlocks } };
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
    const now = getSections(design, targetOf(id)).length;
    return `${PRESET_SECTION_TEMPLATES[id]}: its ${specs.length} sections replace ${now ? `your ${now} current section${now === 1 ? "" : "s"}` : "the default ones"}`;
  });
  if (preset?.content?.productBlocks?.length) lines.push("Book pages: its buy box layout replaces yours");
  const adding = presetPagesToAdd(preset, pages);
  const kept = presetStarterPages(preset).filter(s => pages.some(p => p.slug === s.slug));
  if (adding.length) lines.push(`Pages added as drafts (not shown to shoppers until you publish them): ${adding.map(p => p.title).join(", ")}`);
  if (kept.length) lines.push(`Kept as they are: your own ${kept.map(s => s.title).join(", ")} page${kept.length === 1 ? "" : "s"}`);
  return lines;
}

/**
 * How many sections in the draft still carry a starter's sample words and pictures (`sample: true`, dropped on the
 * owner's first edit). Publish warns about them so a shop never goes live with sample content by accident.
 */
export function sampleSectionsLeft(design: unknown): number {
  let count = 0;
  const seen = new Set<unknown>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const item = value as Record<string, unknown>;
    if (item.sample === true && typeof item.type === "string" && item.settings && typeof item.settings === "object") { count++; return; }
    Object.values(item).forEach(walk);
  };
  walk(design);
  return count;
}
