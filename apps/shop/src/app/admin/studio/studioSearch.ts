// Pure, UI-free "Find anything" index for the Studio. It lists every Style control, every piece of
// shopper-facing text, the Menus panels, each page, the sections on each page and the main actions,
// and ranks them against what a (non-developer) shop owner types — "price colour", "footer words",
// "phone", "publish". Studio turns a chosen result into navigation (see StudioEditor `goToResult`).
//
// How a query is understood (all pure, nothing here touches the design):
//   1. spelling is unified (colour/color, pop-up/popup), filler words ("where do I change the") are dropped;
//   2. plain-word phrases are rewritten ("out of stock" → "sold out", "add to cart" → "add to bag");
//   3. a word the index has never seen is corrected when it is one or two letters away from one it has;
//   4. every remaining word must match (title > place > hidden words); synonyms count a little less;
//   5. if nothing has every word, soft verbs ("add", "new", "show") are dropped, and as a last resort the
//      entries matching most of the words are offered, labelled "closest matches".
// Ranking prefers a whole-word title match, then a category ("Buttons") over its single controls, and puts
// the very many fine-tune "single element" controls last unless the query names that element.

import type { Section } from "./studioModel";
import { regionFieldDevice } from "../../features/site/storefrontRegions";
import { SHORTCUTS, type ShortcutAction } from "./shortcuts";
import { MORE_SETTINGS, STYLE_SUBSECTIONS, THEME_HEADINGS, TEXT_HEADINGS, textSubsectionsFor } from "./settingsMap";

export type StudioTab = "sections" | "style" | "text" | "menus" | "pages" | "media" | "themes";
export type StudioActionId =
  | "save" | "publish" | "discard" | "history" | "schedule" | "check" | "preview-tab" | "undo" | "redo"
  | "device-desktop" | "device-tablet" | "device-mobile" | "mode-toggle" | "autofit-page" | "add-section" | "fill-page-seo"
  | "workbench-health" | "workbench-changes" | "workbench-setup" | "brand-kit" | "site-health" | "ai-draft";

export type SearchTarget =
  | { type: "style"; groupId: string; key?: string }
  | { type: "copy"; group: string; key?: string }
  | { type: "tab"; tab: StudioTab }
  | { type: "menus"; panel: string }
  | { type: "template"; id: string }
  | { type: "section"; templateId: string; sectionId: string }
  | { type: "page"; slug: string }
  | { type: "action"; id: StudioActionId }
  | { type: "element"; key: string }
  | { type: "book"; slug: string }
  | { type: "context"; id: ContextCommandId };

/** Commands about what is selected right now (offered first in Find anything). */
export type ContextCommandId =
  | "section-duplicate" | "section-delete" | "section-up" | "section-down" | "section-hide" | "section-show"
  | "section-copy" | "section-copy-style" | "section-paste-style" | "section-move-page" | "section-save"
  | "block-add" | "block-copy" | "block-paste"
  | "element-theme" | "element-close";

export type SearchKind = "action" | "page" | "section" | "style" | "text" | "menu" | "area" | "element" | "book";
export type SearchEntry = {
  id: string;
  kind: SearchKind;
  title: string;
  /** Where it lives, in the words used on screen: "Theme settings › Product page". */
  where: string;
  /** The click path shown under the title ("Theme settings › Header, menu & footer › Header & announcement bar › Announcement bar"); falls back to `where`. */
  trail?: string;
  /** Extra words that should find this entry but aren't shown. */
  keywords: string;
  /** Low-weight hidden text (current default wording, hints): finds an entry by what it says today. */
  detail?: string;
  /** Ranking nudge: categories are lifted, the many fine-tune element controls sink. */
  bias?: number;
  target: SearchTarget;
  /** Keyboard shortcut shown beside the result ("Ctrl/⌘ S"). */
  keys?: string;
};

export const KIND_LABEL: Record<SearchKind, string> = {
  action: "Do", page: "Page", section: "Section", style: "Look", text: "Words", menu: "Menu", area: "Go to",
  element: "On the page", book: "Book",
};

type StyleGroupLike = { id: string; title: string; hint?: string; fields: { key: string; label: string }[] };
type CopyGroupLike = { group: string; fields: { key: string; label: string; default?: string; hint?: string }[] };
type TemplateLike = { id: string; label: string; pageSlug?: string };

export type IndexInput = {
  styleGroups: StyleGroupLike[];
  copySchema: CopyGroupLike[];
  templates: TemplateLike[];
  pages: { slug?: string; title?: string; status?: string }[];
  /** Sections per template id; the global (header/footer) stack is under "__global". */
  sectionsByTemplate: Record<string, Section[]>;
  sectionLabel: (type: string) => string;
  /** Built-in parts of the page being previewed (from the preview's structure scan). */
  elements?: { key: string; label: string; where: string; target?: string }[];
  /** Books, to open their product page in the preview. */
  books?: { slug?: string; title?: string; author?: string }[];
};

// ── Words ───────────────────────────────────────────────────────────────────

// British spellings an owner may type → the spelling the index is compared in.
const SPELLINGS: [RegExp, string][] = [
  [/colour/g, "color"], [/centre/g, "center"], [/\bgrey/g, "gray"], [/catalogue/g, "catalog"],
  [/favour/g, "favor"], [/behaviour/g, "behavior"], [/\b(custom|personal|organ|optim|minim|maxim|styl|summar|categor|final|recogn)ise/g, "$1ize"],
];
// Two words that are really one ("pop-up" / "pop up" / "popup").
const COMPOUNDS: [RegExp, string][] = [
  [/\bpop up\b/g, "popup"], [/\bcheck out\b/g, "checkout"], [/\bnews letter\b/g, "newsletter"], [/\be mail\b/g, "email"],
  [/\bdrop down\b/g, "dropdown"], [/\bwish list\b/g, "wishlist"], [/\bsub menu\b/g, "submenu"], [/\bsign up\b/g, "signup"],
  [/\bfav icon\b/g, "favicon"], [/\bweb site\b/g, "website"], [/\bpre order\b/g, "preorder"], [/\be book\b/g, "ebook"],
  [/\bside bar\b/g, "sidebar"], [/\bnav bar\b/g, "navbar"], [/\bsoldout\b/g, "sold out"],
];

/** "pdpCardBg" → "pdp card bg", "Colour" → "color": the form both index and query are compared in. */
export function normalizeSearchText(text: string): string {
  let s = String(text || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._:/›·|-]+/g, " ")
    .toLowerCase();
  for (const [re, to] of SPELLINGS) s = s.replace(re, to);
  s = s.replace(/[^a-z0-9£$€% ]+/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, to] of COMPOUNDS) s = s.replace(re, to);
  return s;
}

// Owner-friendly alternates: any word on the left also matches the words on the right (a little lower than the word itself).
const SYNONYMS: Record<string, string[]> = {
  phone: ["mobile"], phones: ["mobile"], mobile: ["phone"], tablet: ["ipad"], ipad: ["tablet"],
  bg: ["background"], background: ["bg"], backdrop: ["background"],
  heading: ["title", "headline"], headline: ["title", "heading"], title: ["heading", "headline"], headings: ["heading"], titles: ["title"],
  font: ["typeface", "typography"], fonts: ["font", "typeface"], typeface: ["font"], typography: ["font"], lettering: ["font"], letters: ["font"],
  words: ["text", "label", "copy"], wording: ["text", "label", "copy"], text: ["words", "label"], copy: ["words", "text"], sentence: ["text", "words"], message: ["text", "words"],
  cart: ["bag", "basket"], bag: ["cart"], basket: ["cart", "bag"], trolley: ["bag", "cart"],
  buy: ["add to bag", "cta"], purchase: ["buy", "checkout"], pay: ["payment", "checkout"], payment: ["pay"],
  save: ["draft"], live: ["publish"], online: ["publish"], undo: ["revert"], revert: ["undo"],
  menu: ["nav", "navigation"], menus: ["menu"], nav: ["menu"], navbar: ["menu", "navigation"], navigation: ["menu"], dropdown: ["menu", "submenu"],
  link: ["links"], links: ["link"], url: ["link"], address: ["link"],
  image: ["photo", "picture"], images: ["photo", "image"], photo: ["image"], photos: ["photo", "image"], picture: ["image"], pictures: ["image", "photo"], pic: ["image"], pics: ["image"],
  cover: ["photo", "image"], covers: ["photo", "image"], thumbnail: ["photo", "image"],
  shipping: ["delivery", "postage"], delivery: ["shipping"], postage: ["shipping"], freight: ["shipping"],
  search: ["find"], button: ["buttons", "cta"], buttons: ["button", "cta"], cta: ["button"],
  // "make it bigger" → a size control; "rounded corners" → a corner radius
  bigger: ["size", "height", "width"], larger: ["size", "height", "width"], big: ["size"], large: ["size"], huge: ["size"], increase: ["size"],
  smaller: ["size", "height", "width"], small: ["size"], tiny: ["size"], shrink: ["size"], decrease: ["size"], resize: ["size"], scale: ["size"],
  size: ["height", "width", "scale"], height: ["size"], width: ["size"], wider: ["width"], narrower: ["width"], taller: ["height"],
  rounded: ["radius", "corner", "round"], round: ["radius", "corner", "rounded"], roundness: ["radius", "corner"], curved: ["radius", "corner"], corners: ["corner", "radius"], corner: ["radius", "corners"], radius: ["corner", "rounded"], square: ["corner", "radius"],
  colors: ["color"], tint: ["color"], shade: ["color"], paint: ["color"],
  dark: ["night", "noir"], night: ["dark"], noir: ["dark"], light: ["bright"],
  banner: ["hero", "announcement"], announcement: [], ticker: ["announcement"], notice: ["announcement", "message"],
  slideshow: ["carousel", "slider"], slider: ["carousel", "slideshow"], carousel: ["slideshow", "slider"], gallery: ["carousel", "photo"],
  signup: ["newsletter", "subscribe"], subscribe: ["newsletter", "signup"], subscribers: ["newsletter"], mailing: ["newsletter"], email: ["newsletter", "mail"],
  popup: ["modal", "window"], modal: ["popup"], overlay: ["popup"],
  stock: ["inventory"], inventory: ["stock"],
  sale: ["discount"], discount: ["sale", "coupon"], coupon: ["discount"], promo: ["discount", "sale"], offer: ["discount", "sale"],
  review: ["reviews", "rating"], reviews: ["review", "rating"], ratings: ["reviews"], stars: ["rating", "reviews"],
  social: ["instagram", "facebook", "twitter", "tiktok"], twitter: ["x"], x: ["twitter"], insta: ["instagram"], ig: ["instagram"], fb: ["facebook"],
  icon: ["icons"], icons: ["icon"],
  description: ["text", "words"],
  site: ["shop", "store"], store: ["shop", "site"], shop: ["store", "site"], website: ["site", "shop"],
  author: ["contributor", "creator"], book: ["product", "books"], books: ["book", "product"], product: ["book"], products: ["book", "books"],
  login: ["sign in", "account"], signin: ["sign in", "login"], account: ["login", "customer"], customer: ["account"],
  contact: ["email"], padding: ["space", "spacing"], margin: ["space", "spacing"], gap: ["space", "spacing"], spacing: ["space", "gap"], space: ["spacing", "gap"],
  hide: ["show", "turn off"], show: ["hide", "display"], remove: ["delete", "hide"], delete: ["remove"], trash: ["delete", "remove"], duplicate: ["copy", "clone"], clone: ["duplicate"], reorder: ["move"], move: ["reorder"],
  animation: ["motion", "effect"], animations: ["animation", "motion"], motion: ["animation"], hover: ["mouse"], shadow: ["shadows"], border: ["outline", "borders", "line"], outline: ["border"], line: ["border", "divider"],
  bold: ["weight"], thick: ["weight"], thin: ["weight"], italic: ["style"], uppercase: ["case", "caps"], lowercase: ["case"], caps: ["uppercase", "case"],
  language: ["translate"], money: ["price", "currency"], price: ["cost"], cost: ["price"],
  newsletters: ["newsletter"], cookies: ["cookie"], cookie: ["consent", "privacy"],
};

/** Words that carry no meaning for finding a setting ("where do I change the …"). */
const FILLER = new Set(("a an the to of for in on at my our your me i we you it its is are be do does did can could would should will shall where what how which who " +
  "want wanna need like please some any with and or from into this that these those there here am im ive so just also really very " +
  "change changes changing make makes making set edit update adjust modify fix alter").split(" "));
/** Verbs that help only when a query otherwise finds nothing ("add a link to the menu" → "link menu"). */
const SOFT_WORDS = new Set("add new create put get use show hide remove delete move turn switch want let allow display see find open go take".split(" "));

// Plain phrases that mean a known thing, applied to the normalized query.
const PHRASES: [RegExp, string][] = [
  [/\bout of stock\b|\bnot in stock\b|\bunavailable\b|\bno stock\b|\bsold out\b/g, "sold out"],
  [/\badd(ing)? to (the )?(cart|basket|trolley|bag)\b/g, "add to bag"],
  [/\b(top|header) (banner|bar|strip|message)\b|\b(banner|bar|strip|message) (at |on )?(the )?(very )?top\b|\bbanner at top\b/g, "announcement"],
  [/\b(dark|night|light) (mode|theme|version)\b|\bdarkmode\b/g, "dark"],
  [/\bhome ?page\b|\bfront page\b|\blanding page\b|\bmain page\b|\bfirst page\b/g, "home"],
  [/\bget in touch\b|\bcontact us\b/g, "contact"],
  [/\bfree shipping\b|\bfree delivery\b/g, "free shipping"],
  [/\bshop name\b|\bstore name\b|\bsite name\b|\bwebsite name\b/g, "site name"],
  [/\btext size\b|\bfont size\b|\bletter size\b/g, "text size"],
];

// ── Static entries ──────────────────────────────────────────────────────────

const staticEntry = (id: string, kind: SearchKind, title: string, where: string, keywords: string, target: SearchTarget, keys?: string, extra: Partial<SearchEntry> = {}): SearchEntry =>
  ({ id, kind, title, where, keywords: normalizeSearchText(keywords), target, ...(keys ? { keys } : {}), ...extra });

// The shortcut a command shares with the keyboard handler (shortcuts.ts is the one table of keys).
const keysFor = (action?: ShortcutAction) => action ? SHORTCUTS.find(s => s.action === action)?.keys.split("  ·  ")[0] : undefined;
const ACTION_KEYS: Partial<Record<StudioActionId, ShortcutAction>> = {
  save: "save", undo: "undo", redo: "redo", "device-desktop": "desktop", "device-tablet": "tablet", "device-mobile": "mobile", "mode-toggle": "toggleMode",
  "add-section": "addSection", "workbench-changes": "workbench",
};

const ACTIONS: { id: StudioActionId; title: string; keywords: string }[] = [
  { id: "save", title: "Save draft", keywords: "keep store changes ctrl s save my work" },
  { id: "publish", title: "Publish to the live shop", keywords: "go live release push shoppers make live put online save changes live customers see" },
  { id: "discard", title: "Discard draft", keywords: "throw away reset revert to live start over cancel changes" },
  { id: "history", title: "Version history", keywords: "restore previous older versions checkpoint save compare differences pin undo published go back" },
  { id: "schedule", title: "Schedule publishing or a campaign", keywords: "schedule later timer date time campaign sale seasonal switch back automatically launch black friday christmas" },
  { id: "check", title: "Studio Health (check before publishing)", keywords: "review accessibility problems warnings contrast alt text tap targets broken links speed seo pre-publish check errors mistakes" },
  { id: "preview-tab", title: "View website (your draft, in a new tab)", keywords: "preview in new tab full screen window open see my shop before publish draft" },
  { id: "undo", title: "Undo", keywords: "step back ctrl z mistake oops" },
  { id: "redo", title: "Redo", keywords: "step forward" },
  { id: "device-desktop", title: "Desktop preview", keywords: "computer wide screen size laptop" },
  { id: "device-tablet", title: "Tablet preview", keywords: "ipad medium size" },
  { id: "device-mobile", title: "Phone preview", keywords: "mobile small screen size iphone android" },
  { id: "mode-toggle", title: "Switch Edit / Browse mode", keywords: "click links navigate storefront try out" },
  { id: "autofit-page", title: "Auto-fit this page for phones", keywords: "responsive mobile layout generate stack small screen" },
  { id: "add-section", title: "Add a section", keywords: "new block library insert hero banner slideshow carousel gallery video text columns faq testimonial pricing new section on the page" },
  { id: "ai-draft", title: "Draft a section with AI", keywords: "ai gemini write generate draft section words copy assistant magic" },
  { id: "workbench-changes", title: "Show this session's changes (undo history)", keywords: "workbench history steps go back undo several timeline what did i change edits list" },
  { id: "workbench-setup", title: "Setup checklist (get the shop ready)", keywords: "workbench launch onboarding getting started to do progress logo fonts colours share image" },
  { id: "brand-kit", title: "Brand kit (logo, colours, type and Home page in one go)", keywords: "brand kit wizard setup logo palette colours personality fonts starter home page onboarding" },
  { id: "site-health", title: "Check every page (Studio Health for the whole shop)", keywords: "site wide all pages health audit speed scan every route whole shop crawl check everything problems" },
  { id: "workbench-health", title: "Open Studio Health in the Workbench", keywords: "workbench docked panel accessibility check problems" },
  { id: "fill-page-seo", title: "Fill in missing search listings (pages)", keywords: "seo auto fill autofill meta description search title google listing pages blank" },
];

const TABS: { tab: StudioTab; title: string; keywords: string }[] = [
  { tab: "sections", title: "Page layout", keywords: "page structure sections blocks homepage outline header footer announcement pop-ups pop-overs shared global" },
  { tab: "style", title: "Theme settings", keywords: "style colors fonts spacing look design theme" },
  { tab: "text", title: "Text & labels", keywords: "words wording copy messages" },
  { tab: "menus", title: "Navigation", keywords: "menus navigation header footer categories links" },
  { tab: "pages", title: "Pages", keywords: "about journal custom page content" },
  { tab: "media", title: "Media", keywords: "media library images pictures photos uploads files alt text description srcset replace delete unused" },
  { tab: "themes", title: "Themes", keywords: "my themes saved themes presets theme library looks share preview link private download import duplicate publish" },
];

const MENU_PANELS: { panel: string; title: string; keywords: string }[] = [
  { panel: "menus:categories", title: "Shop categories", keywords: "category bar sits under sub drop-down publications books zines add category new category" },
  { panel: "menus:header-order", title: "Header order (pages & categories)", keywords: "reorder navigation top bar menu order which links first" },
  { panel: "menus:links", title: "Header & footer links", keywords: "menu items mega menu social add a link new link menu item header menu footer menu navigation edit links remove link rename link" },
];

// Plain-English "where do I…?" answers that are not a single setting. They open the right workspace and say what to click.
const HOW_TO: { id: string; title: string; where: string; keywords: string; target: SearchTarget }[] = [
  { id: "howto:section-tools", title: "Delete, move or duplicate a section", where: "Page layout › click a section › Move up · Move down · Duplicate · Delete", keywords: "delete remove trash move reorder up down duplicate copy clone section sections rearrange order on the page", target: { type: "tab", tab: "sections" } },
  { id: "howto:new-page", title: "Add a new page (About, Journal…)", where: "Pages › New page", keywords: "new page create page add page custom page about contact journal policy blank page write a page", target: { type: "tab", tab: "pages" } },
  { id: "howto:site-name", title: "Change the shop's name and what Google shows", where: "Text & labels › Site & sharing", keywords: "site name shop name store name seo google title description search results meta browser tab", target: { type: "copy", group: "Site & sharing" } },
];

// What an owner might call a whole category. Matches the category card, which then outranks its single controls.
const STYLE_GROUP_WORDS: Record<string, string> = {
  themeLook: "dark mode light night noir presets themes templates looks styles saved download import start from",
  colors: "colour palette dark mode light night background page text accent theme brand shade",
  schemes: "palette sets dark light section colours",
  buttons: "colour round rounded corners radius shape hover cta call to action",
  type: "font fonts text size bigger smaller typeface typography heading body letters weight lettering",
  smallPrint: "tiny text captions labels size small",
  accounts: "customer login sign in account",
  layout: "width margin spacing space padding wide narrow full screen container gap",
  tokens: "scale size spacing corners radius rounded",
  customPages: "about page journal custom page title",
  products: "book cards grid shop columns cover covers price title photo images",
  header: "top announcement logo search icons sticky transparent",
  popup: "popup modal window overlay",
  toasts: "notice messages notifications snackbar",
  footer: "bottom links social instagram twitter facebook tiktok icons copyright address newsletter",
  logo: "brand name wordmark favicon share image social preview icon size",
  catalog: "shop page heading filters search sort categories chips",
  catalogLayout: "shop masthead layout covers",
  navlinks: "menu links navigation dropdown categories",
  productPage: "book page product page photo gallery zoom video",
  productCard: "book page product page buy box price title tabs description details",
  labels: "badges sale new preorder labels stickers tags",
  effects: "animation motion hover spacing shadows",
  checkout: "payment fields form address pay",
  cartDrawer: "bag basket drawer slide in free shipping bar checkout button",
  riso: "print texture grain look noir paper halftone",
  elements: "cookie banner breadcrumbs under construction coming soon switch on off features",
  code: "css javascript script html head tracking pixel analytics custom code",
  paymentIcons: "visa mastercard paypal cards badges footer",
};
const COPY_GROUP_WORDS: Record<string, string> = {
  "Site & sharing": "seo google search title description meta share image social preview link browser tab site name shop name",
  Header: "labels top",
  Footer: "bottom links policies copyright",
  Newsletter: "email signup subscribe mailing list join",
  "Cookie banner": "consent privacy accept cookies",
  Cart: "bag basket drawer",
  "Product page": "book page stock description tabs",
  Checkout: "payment shipping address pay buy errors",
  "Catalog & empty states": "shop page heading empty nothing found",
  "Search & filters": "find sort filter in stock",
  "Customer account": "login sign in profile",
  Reviews: "ratings stars comments",
};

/** Every searchable thing. Cheap enough to rebuild when the design changes (a few thousand rows). */
export function buildStudioIndex(input: IndexInput): SearchEntry[] {
  const out: SearchEntry[] = [];

  for (const a of ACTIONS) out.push(staticEntry(`action:${a.id}`, "action", a.title, "Studio", a.keywords, { type: "action", id: a.id }, keysFor(ACTION_KEYS[a.id])));
  for (const t of TABS) out.push(staticEntry(`tab:${t.tab}`, "area", t.title, "Studio", t.keywords, { type: "tab", tab: t.tab }, keysFor(`go:${t.tab}` as ShortcutAction), { bias: 1 }));
  for (const m of MENU_PANELS) out.push(staticEntry(m.panel, "menu", m.title, "Navigation", m.keywords, { type: "menus", panel: m.panel }, undefined, { trail: `Navigation › ${m.title}`, bias: 3 }));
  for (const h of HOW_TO) out.push(staticEntry(h.id, "area", h.title, h.where.split(" › ")[0], h.keywords, h.target, undefined, { trail: h.where, bias: 2 }));

  for (const t of input.templates) {
    out.push(staticEntry(`template:${t.id}`, "page", t.label, "Pages you can design", `edit sections ${t.pageSlug || ""}`, { type: "template", id: t.id }, undefined, { trail: `Page layout › ${t.label}` }));
  }
  const seenSlug = new Set<string>();
  for (const p of input.pages) {
    if (!p.slug || seenSlug.has(p.slug)) continue;
    seenSlug.add(p.slug);
    out.push(staticEntry(`page:${p.slug}`, "page", p.title || p.slug, `Pages › ${p.status === "published" ? "Published" : "Draft"}`, `write edit content custom page ${p.slug}`, { type: "page", slug: p.slug }));
  }

  for (const el of input.elements || []) {
    out.push(staticEntry(`element:${el.key}`, "element", el.label, el.where, `part of the page ${el.target || ""}`, { type: "element", key: el.key }));
  }
  const seenBook = new Set<string>();
  for (const b of input.books || []) {
    if (!b.slug || seenBook.has(b.slug)) continue;
    seenBook.add(b.slug);
    out.push(staticEntry(`book:${b.slug}`, "book", b.title || b.slug, "Book pages", `product page ${b.author || ""} ${b.slug}`, { type: "book", slug: b.slug }, undefined, { bias: -1 }));
  }

  const nameOf = (id: string) => id === "__global" ? "Header / footer sections" : input.templates.find(t => t.id === id)?.label || id;
  for (const [templateId, list] of Object.entries(input.sectionsByTemplate)) {
    (list || []).forEach((s, i) => {
      const label = input.sectionLabel(s.type);
      const st = s.settings || {};
      const snippet = [st.title, st.heading, st.headline, st.text].find(v => typeof v === "string" && v.trim());
      out.push(staticEntry(`section:${s.id}`, "section", snippet ? `${label} — ${String(snippet).slice(0, 48)}` : label,
        `${nameOf(templateId)} › section ${i + 1}${s.visible === false ? " (hidden)" : ""}`, `${label} ${s.type}`, { type: "section", templateId, sectionId: s.id }));
    });
  }

  for (const g of input.styleGroups) {
    const heading = THEME_HEADINGS.find(h => h.groups.includes(g.id))?.title || "";
    const base = ["Theme settings", heading].filter(Boolean).join(" › ");
    const subs = STYLE_SUBSECTIONS[g.id];
    const subOf = (key: string) => subs ? (subs.find(s => s.keys.includes(key))?.title ?? MORE_SETTINGS) : "";
    out.push(staticEntry(`style-group:${g.id}`, "style", g.title, "Theme settings", `${STYLE_GROUP_WORDS[g.id] || ""} all settings group`, { type: "style", groupId: g.id }, undefined, { trail: base, bias: 5, detail: normalizeSearchText(g.hint || "") }));
    for (const f of g.fields) {
      // An element setting exists once per screen size; index it once (the desktop field) and let
      // "tablet"/"phone" match it — the element's controls follow the previewed size anyway.
      const region = f.key.startsWith("regions.");
      if (region && regionFieldDevice(f.key) !== "desktop") continue;
      const sub = subOf(f.key);
      out.push(staticEntry(`style:${g.id}:${f.key}`, "style", f.label, `Theme settings › ${g.title}`,
        `${f.key} ${g.title}${sub && sub !== MORE_SETTINGS ? ` ${sub}` : ""}${region ? " tablet phone mobile" : ""}`, { type: "style", groupId: g.id, key: f.key }, undefined,
        { trail: [base, g.title, sub].filter(Boolean).join(" › "), ...(region ? { bias: -5 } : {}) }));
    }
  }

  for (const g of input.copySchema) {
    const heading = TEXT_HEADINGS.find(h => h.groups.includes(g.group))?.title || "";
    const base = ["Text & labels", heading].filter(Boolean).join(" › ");
    const subOf = new Map<string, string>();
    for (const s of textSubsectionsFor(g)) if (s.title) for (const f of s.fields) subOf.set(f.key, s.title);
    out.push(staticEntry(`copy-group:${g.group}`, "text", g.group, "Text & labels", `words wording group ${COPY_GROUP_WORDS[g.group] || ""}`, { type: "copy", group: g.group }, undefined, { trail: base, bias: 5 }));
    for (const f of g.fields) {
      const sub = subOf.get(f.key) || "";
      out.push(staticEntry(`copy:${f.key}`, "text", f.label, `Text & labels › ${g.group}`, `${f.key}${sub ? ` ${sub}` : ""}`, { type: "copy", group: g.group, key: f.key }, undefined,
        { trail: [base, g.group, sub].filter(Boolean).join(" › "), detail: normalizeSearchText(`${f.default || ""} ${f.hint || ""}`) }));
    }
  }
  return out;
}

const KIND_ORDER: Record<SearchKind, number> = { action: 0, area: 1, element: 2, page: 3, section: 4, book: 5, menu: 6, style: 7, text: 8 };

// ── Matching ────────────────────────────────────────────────────────────────

type Prep = { t: string; tw: string[]; w: string; k: string; d: string; ts: string; ws: string; ks: string; bias: number; kw: number; field: boolean };
const PREP = new WeakMap<SearchEntry, Prep>();
const squish = (s: string) => s.replace(/ /g, "");
function prepare(e: SearchEntry): Prep {
  let p = PREP.get(e);
  if (!p) {
    const t = normalizeSearchText(e.title), w = normalizeSearchText(e.where), k = e.keywords;
    const field = e.id.startsWith("style:") || e.id.startsWith("copy:");
    // Words written by hand for a category, action or page are worth more than the words derived from a control's key.
    // Text read aloud to screen-reader users is rarely what an owner is looking for.
    const quiet = field && /read aloud/.test(e.title) ? -2 : 0;
    p = { t, tw: t.split(" "), w, k, d: e.detail || "", ts: squish(t), ws: squish(w), ks: squish(k), kw: field ? 1.5 : 3, field,
      bias: (e.bias || 0) + quiet - Math.min(t.split(" ").length, 14) * 0.12 };
    PREP.set(e, p);
  }
  return p;
}

type Alt = { words: string[]; phrase: string; weight: number };
const SYN_WEIGHT = 0.85;

const altsFor = (token: string): Alt[] => [
  { words: token.split(" "), phrase: token, weight: 1 },
  ...(SYNONYMS[token] || []).map(normalizeSearchText).filter(Boolean).map(s => ({ words: s.split(" "), phrase: s, weight: SYN_WEIGHT })),
];

/** A short word only counts at the start of a word ("up" must not find "group"). */
const hasWord = (hay: string, w: string) => (w.length <= 2 ? (" " + hay).includes(" " + w) : hay.includes(w));
const hasPhrase = (hay: string, alt: Alt) => alt.words.length === 1 ? hasWord(hay, alt.words[0]) : hay.includes(alt.phrase);

/** Score one alternative against one entry (0 = no match). Title beats place beats hidden words beats default wording. */
function altScore(p: Prep, a: Alt): number {
  let s = 0;
  const w0 = a.words[0];
  if (a.words.length === 1) {
    if (p.tw.includes(w0)) s = 5;
    else if (p.tw.includes(w0 + "s")) s = 4.8;
    else if (p.tw.some(x => x.startsWith(w0))) s = 4;
    else if (w0.length > 2 && p.t.includes(w0)) s = 3;
  } else if (p.t.includes(a.phrase)) s = 4;
  if (!s && hasPhrase(p.w, a)) s = 2;
  if (!s && hasPhrase(p.k, a)) s = p.kw;
  if (!s && p.d && hasPhrase(p.d, a)) s = 0.8;
  if (!s && a.words.length === 1 && w0.length >= 5) {
    // "popup" for "pop up", "newsletter" for "news letter": compare with the spaces taken out
    if (p.ts.includes(w0)) s = 2.5; else if (p.ws.includes(w0)) s = 1.5; else if (p.ks.includes(w0)) s = 1.2;
  }
  return s * a.weight;
}

/** The best score among a word and its synonyms, and whether the word itself (not a synonym) earned it. */
const tokenScore = (p: Prep, alts: Alt[]): [number, boolean] => {
  let best = 0, literal = false;
  for (const a of alts) { const s = altScore(p, a); if (s > best) { best = s; literal = a.weight === 1; } }
  return [best, literal];
};

// ── Spelling help ───────────────────────────────────────────────────────────

const VOCAB = new WeakMap<SearchEntry[], Map<string, number>>();
function vocabFor(index: SearchEntry[]): Map<string, number> {
  let v = VOCAB.get(index);
  if (!v) {
    v = new Map();
    for (const e of index) {
      const p = prepare(e);
      for (const hay of [p.t, p.w, p.k]) for (const w of hay.split(" ")) if (w.length >= 3 && !/\d/.test(w)) v.set(w, (v.get(w) || 0) + (hay === p.t ? 3 : 1));
    }
    VOCAB.set(index, v);
  }
  return v;
}

/** Edit distance counting a swapped pair of neighbouring letters as one slip; gives up above `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) { rows.push(new Array(b.length + 1).fill(0)); rows[i][0] = i; }
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2][j - 2] + 1);
      rows[i][j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length][b.length];
}

const isKnownWord = (token: string, vocab: Map<string, number>): boolean => {
  if (SYNONYMS[token] || FILLER.has(token) || SOFT_WORDS.has(token) || vocab.has(token)) return true;
  for (const w of vocab.keys()) if (w.includes(token)) return true;
  return false;
};

/** The index word one or two slips away from a word nothing in the index contains ("annoucement" → "announcement"), if any. */
function correctWord(token: string, vocab: Map<string, number>): string | null {
  if (token.length < 4 || /\d| /.test(token) || isKnownWord(token, vocab)) return null;
  const max = token.length >= 8 ? 2 : 1;
  let best: string | null = null, bestD = max + 1, bestFreq = 0;
  for (const [w, freq] of vocab) {
    // Never "correct" into a tiny word ("pink" → "pin"); a 4-letter word may only swap a letter ("fnot" → "font").
    if (w.length < 4 || (token.length === 4 && (w[0] !== token[0] || w.length !== 4))) continue;
    const d = editDistance(token, w, max);
    if (d < bestD || (d === bestD && d <= max && freq > bestFreq)) { best = w; bestD = d; bestFreq = freq; }
  }
  return best && bestD <= max ? best : null;
}

/** Do the one-off work (normalising every entry, listing the index's words) ahead of the first keystroke. */
export function warmSearchIndex(index: SearchEntry[]): void {
  for (const e of index) prepare(e);
  vocabFor(index);
}

// ── Reading a query ─────────────────────────────────────────────────────────

export type QueryPlan = {
  /** Every one of these must match. */
  words: string[];
  /** The same without soft verbs ("add", "new", "show"): tried when nothing has every word. */
  relaxed: string[];
  /** The query with spelling fixed, only when a word was corrected ("announcement" for "annoucement"). */
  corrected: string | null;
};

// Phrases searched as a unit ("add to bag" must not lose its "to").
const KEEP = ["add to bag", "sold out"];
function tokenize(q: string): string[] {
  const words = q.split(" ").filter(Boolean), out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const unit = KEEP.find(k => words.slice(i, i + k.split(" ").length).join(" ") === k);
    if (unit) { out.push(unit); i += unit.split(" ").length - 1; } else out.push(words[i]);
  }
  return out;
}

/** Understand what was typed: spelling unified, filler dropped, phrases rewritten, typos fixed. */
export function planQuery(index: SearchEntry[], raw: string): QueryPlan {
  let q = normalizeSearchText(raw);
  for (const [re, to] of PHRASES) q = q.replace(re, to);
  const all = tokenize(q);
  const content = all.filter(w => !FILLER.has(w));
  let words = content.length ? content : all;
  let corrected: string | null = null;
  if (index.length && words.length) {
    const vocab = vocabFor(index);
    const fixed = words.map(w => correctWord(w, vocab) ?? w);
    if (fixed.some((w, i) => w !== words[i])) { corrected = fixed.join(" "); words = fixed; }
  }
  const relaxed = words.filter(w => !SOFT_WORDS.has(w));
  return { words, relaxed: relaxed.length ? relaxed : words, corrected };
}

export type SearchOptions = {
  limit?: number;
  /** Commands about the current selection (`contextCommands`): offered first. */
  context?: SearchEntry[];
  /** Ids of recently opened results, newest first. */
  recent?: string[];
  /** Require every typed word (no dropping soft verbs, no "closest matches"). */
  strict?: boolean;
};

const isCommand = (e: SearchEntry) => e.kind === "action" || e.kind === "area" || e.target.type === "context";

function rank(entries: SearchEntry[], words: string[], boost: (e: SearchEntry) => number, partial = false): SearchEntry[] {
  const alts = words.map(altsFor);
  const joined = words.join(" ");
  const need = partial ? Math.max(1, Math.ceil(words.length / 2)) : words.length;
  const scored: { e: SearchEntry; score: number; hits: number }[] = [];
  for (const e of entries) {
    const p = prepare(e);
    let score = 0, hits = 0, literal = true, weakest = Infinity;
    for (let i = 0; i < alts.length; i++) {
      const [s, lit] = tokenScore(p, alts[i]);
      if (s) { score += s; hits++; if (!lit) literal = false; if (s < weakest) weakest = s; }
      else if (!partial) { hits = -1; break; }
    }
    if (hits < need) continue;
    // A whole title typed exactly is a strong sign; less so for a control whose name is one generic word ("Font", "Background").
    if (p.t === joined) score += p.field ? 0 : 12;
    else if (p.t.startsWith(joined)) score += p.field ? 0.5 : 6;
    else if (p.t.includes(joined)) score += p.field ? 0.3 : 3;
    // A category is lifted by what it is called (its title or the words written for it), not by a look-alike word
    // or a passing mention in its description.
    const bias = p.bias > 0 ? p.bias * Math.min(1, weakest / 3) * (literal ? 1 : 0.4) : p.bias;
    scored.push({ e, score: score + bias + boost(e), hits });
  }
  scored.sort((a, b) => b.hits - a.hits || b.score - a.score || KIND_ORDER[a.e.kind] - KIND_ORDER[b.e.kind] || a.e.title.localeCompare(b.e.title));
  return scored.map(s => s.e);
}

export type PaletteGroup = {
  title: string;
  entries: SearchEntry[];
  /** A line to show above the results when they are not a plain match ("Showing results for …", "Closest matches"). */
  note?: string;
};

/**
 * What Find anything shows, in titled groups. Before typing: commands for the selection, recent
 * results, then shortcuts. A query starting with ">" searches commands only. Otherwise every typed
 * word must match (typos are fixed, filler words ignored); when nothing has every word the closest
 * matches are offered instead of a blank list. Selection commands and recent results get a small lift.
 */
export function paletteGroups(index: SearchEntry[], query: string, { limit = 24, context = [], recent = [], strict = false }: SearchOptions = {}): PaletteGroup[] {
  const commandsOnly = query.trimStart().startsWith(">");
  const raw = commandsOnly ? query.trimStart().slice(1) : query;
  const byId = new Map(index.map(e => [e.id, e]));
  const recentEntries = recent.map(id => byId.get(id)).filter((e): e is SearchEntry => Boolean(e));
  if (!normalizeSearchText(raw)) {
    const groups: PaletteGroup[] = [];
    if (context.length) groups.push({ title: "For what you selected", entries: context });
    if (commandsOnly) {
      groups.push({ title: "Commands", entries: index.filter(e => isCommand(e)) });
    } else {
      if (recentEntries.length) groups.push({ title: "Recent", entries: recentEntries.slice(0, 5) });
      const shown = new Set(groups.flatMap(g => g.entries.map(e => e.id)));
      groups.push({ title: "Shortcuts", entries: index.filter(e => (e.kind === "action" || e.kind === "area" || e.kind === "page") && !shown.has(e.id) && !e.id.startsWith("howto:")) });
    }
    return trim(groups, limit);
  }
  const pool = commandsOnly ? [...context, ...index.filter(isCommand)] : [...context, ...index];
  const recentSet = new Set(recent);
  const boost = (e: SearchEntry) => (e.target.type === "context" ? 3 : 0) + (recentSet.has(e.id) ? 2 : 0);
  const plan = planQuery(index, raw);
  let ranked = plan.words.length ? rank(pool, plan.words, boost) : [];
  let note: string | undefined;
  if (!ranked.length && !strict) {
    if (plan.relaxed.length < plan.words.length) ranked = rank(pool, plan.relaxed, boost);
    if (!ranked.length && plan.relaxed.length > 1) {
      ranked = rank(pool, plan.relaxed, boost, true);
      if (ranked.length) note = "Closest matches — nothing has every word you typed";
    }
  }
  if (!note && plan.corrected && ranked.length) note = `Showing results for “${plan.corrected}”`;
  const title = commandsOnly ? "Commands" : "Results";
  return trim([{ title: ranked.length > limit ? `${title} · best ${limit} of ${ranked.length}, type more words to narrow` : title, entries: ranked, ...(note ? { note } : {}) }], limit);
}

function trim(groups: PaletteGroup[], limit: number): PaletteGroup[] {
  let left = limit;
  const out: PaletteGroup[] = [];
  for (const g of groups) {
    if (left <= 0) break;
    const entries = g.entries.slice(0, left);
    if (entries.length) { out.push({ ...g, entries }); left -= entries.length; }
  }
  return out;
}

/**
 * Ranks the index for a query (a flat list; see `paletteGroups` for the grouped palette). Every
 * typed word must match somewhere; titles that start with the query rank first, then more title
 * hits, then the area. An empty query returns the shortcuts worth showing before anyone types.
 */
export function searchStudio(index: SearchEntry[], query: string, options: SearchOptions = {}): SearchEntry[] {
  return paletteGroups(index, query, { limit: 24, ...options }).flatMap(g => g.entries);
}

// Searches worth suggesting when nothing matched: each is a plain thing an owner wants and finds something.
const SUGGESTIONS = ["logo", "button colour", "announcement bar", "footer links", "fonts", "sold out badge", "newsletter", "phone", "price colour", "menu", "background colour", "publish"];

/** Up to `count` searches to offer when a query finds nothing: the closest-sounding first, then the usual starting points. */
export function suggestSearches(query: string, count = 3): string[] {
  const typed = normalizeSearchText(query).split(" ").filter(w => w.length >= 3 && !FILLER.has(w));
  const scored = SUGGESTIONS.map((s, i) => {
    let score = 0;
    for (const sw of normalizeSearchText(s).split(" ")) for (const tw of typed) {
      if (sw === tw) score += 4;
      else if (sw.startsWith(tw.slice(0, 3)) || tw.startsWith(sw.slice(0, 3))) score += 2;
      else if (editDistance(sw, tw, 2) <= 2) score += 1;
    }
    return { s, score, i };
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).slice(0, count).map(x => x.s);
}

/** Selection-aware commands: what can be done to the selected section or page part right now. */
export function contextCommands(ctx: {
  section?: { id: string; label: string; visible: boolean; first: boolean; last: boolean };
  element?: { label: string; hasTheme: boolean };
  canPasteStyle?: boolean;
  /** Block library 3.0: the selected section takes blocks / a block is selected / the copied block fits here. */
  blocks?: { takesBlocks: boolean; blockLabel?: string; canPaste: boolean };
}): SearchEntry[] {
  const out: SearchEntry[] = [];
  const cmd = (id: ContextCommandId, title: string, where: string, keywords: string, keys?: ShortcutAction) =>
    out.push(staticEntry(`context:${id}`, "action", title, where, keywords, { type: "context", id }, keysFor(keys)));
  if (ctx.section) {
    const s = ctx.section, where = `Selected section › ${s.label}`;
    cmd("section-duplicate", "Duplicate this section", where, "copy clone again", "duplicate");
    if (!s.first) cmd("section-up", "Move this section up", where, "reorder higher earlier", "moveUp");
    if (!s.last) cmd("section-down", "Move this section down", where, "reorder lower later", "moveDown");
    if (s.visible) cmd("section-hide", "Hide this section", where, "invisible turn off");
    else cmd("section-show", "Show this section", where, "visible turn on unhide");
    cmd("section-copy", "Copy this section", where, "clipboard paste later another page");
    cmd("section-copy-style", "Copy this section's style", where, "look colours fonts spacing");
    if (ctx.canPasteStyle) cmd("section-paste-style", "Paste style onto this section", where, "apply copied look");
    cmd("section-move-page", "Move this section to another page", where, "transfer relocate");
    cmd("section-save", "Save this section for reuse", where, "preset library saved sections");
    cmd("section-delete", "Delete this section", where, "remove trash", "delete");
    if (ctx.blocks?.takesBlocks) {
      cmd("block-add", "Add a block to this section", where, "block picker new insert content");
      if (ctx.blocks.blockLabel) cmd("block-copy", `Copy the selected block (${ctx.blocks.blockLabel})`, where, "clipboard block duplicate another section");
      if (ctx.blocks.canPaste) cmd("block-paste", "Paste the copied block here", where, "clipboard block insert");
    }
  }
  if (ctx.element) {
    const where = `Selected part › ${ctx.element.label}`;
    if (ctx.element.hasTheme) cmd("element-theme", `Open ${ctx.element.label} in Theme settings`, where, "all style settings category");
    cmd("element-close", `Close ${ctx.element.label}`, where, "deselect done", "deselect");
  }
  return out;
}

/** Remember a picked result: newest first, no repeats, at most `max`. */
export function pushRecent(list: string[], id: string, max = 8): string[] {
  return [id, ...list.filter(x => x !== id)].slice(0, max);
}

/** The screen size a query names ("button phone padding" → mobile), if any. */
export function searchedDevice(query: string): "mobile" | "tablet" | "desktop" | null {
  const words = normalizeSearchText(query).split(" ");
  if (words.some(w => w === "phone" || w === "mobile" || w === "phones")) return "mobile";
  if (words.some(w => w === "tablet" || w === "ipad" || w === "tablets")) return "tablet";
  if (words.some(w => w === "desktop" || w === "computer")) return "desktop";
  return null;
}
