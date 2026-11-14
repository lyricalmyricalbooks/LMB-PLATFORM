// The admin's Help page rules (HelpPage.tsx), pure: which answers come first, how a search and a topic narrow them, and
// which admin page a "Where to click" path opens. The answers themselves are the platform's (help/articles.js).
import { NAV, SETTINGS_ITEM_PREFIX } from "./riso/nav";
import { STOCKROOM_ITEM_PREFIX } from "./combined";

export interface HelpEntry { id: string; topic: string; question: string; answer: string[]; steps?: string[]; where?: string[] }

/** The answers most owners need in their first weeks, in order (missing ones are skipped). */
export const POPULAR = ["add-a-book", "shipping", "get-paid", "send-order", "open-shop", "fairs", "copy-of-everything"];

/** "All" first, then the topics that have at least one answer, in the help centre's order. */
export function topicsOf(topics: readonly string[], list: readonly HelpEntry[]): string[] {
  return ["All", ...topics.filter((t) => list.some((a) => a.topic === t))];
}

// ---- Search: plain questions in, the right answer out (Julian, 14 November 2026: "very good high quality answers,
// make it robust"). Words are cut to their stem, small words are dropped, everyday words map to the help's own words
// (refund → return, postage → shipping…), a near-miss spelling still counts, and a word in the question outweighs one
// deep in the answer. Pure and tested over the real answers (helpAnswers.test.ts).

const STOP = new Set(("a an the i me my mine we our you your it its is are was were be been am do does did doing can could " +
  "should would will shall may might must how what when where which who why whom to of in on at by for from with about " +
  "into onto up down out over off and or but if so not no yes there here this that these those get got have has had " +
  "want wanted need needed make let please help some any all just also still then than too very much many way thing " +
  "things one ones someone something anyone anything way go going work works working nothing everything").split(" "));

/** Everyday words and the words the answers use for them. Each group is one meaning. */
const SAME: string[][] = [
  ["ship", "shipping", "postage", "post", "delivery", "deliver", "mail", "courier", "parcel", "label", "canada post", "send", "dispatch", "fulfil", "fulfill"],
  ["pay", "paid", "payment", "payout", "money", "bank", "stripe", "square", "card", "deposit", "earning"],
  ["refund", "return", "money back", "cancel order", "chargeback"],
  ["tax", "gst", "hst", "pst", "qst", "vat", "sales tax"],
  ["discount", "coupon", "promo", "code", "sale", "voucher", "deal", "offer"],
  ["photo", "image", "picture", "pic", "cover"],
  ["look", "theme", "design", "colour", "color", "font", "template", "style", "logo"],
  ["word", "text", "wording", "label", "copy", "language"],
  ["address", "domain", "url", "website", "web address", "link"],
  ["customer", "buyer", "shopper", "client", "mailing list", "subscriber"],
  ["stock", "inventory", "count", "copies", "quantity", "sold out"],
  ["fair", "market", "stall", "pop up", "popup", "event", "till", "in person", "booth", "festival"],
  ["close", "cancel", "delete", "quit", "leave", "end", "stop"],
  ["team", "staff", "employee", "helper", "assistant", "partner", "accountant", "bookkeeper", "access"],
  ["preorder", "pre order", "advance", "upcoming", "not out yet", "release"],
  ["edition", "variant", "version", "format", "hardcover", "paperback", "size", "colour option"],
  ["import", "spreadsheet", "csv", "excel", "upload", "bulk", "bring", "move", "migrate", "transfer", "switch"],
  ["export", "backup", "download", "copy"],
  ["email", "mail", "inbox", "notification"],
  ["policy", "policies", "privacy", "terms", "returns policy"],
  ["open", "launch", "live", "go live", "publish", "public"],
  ["order", "purchase", "sale"],
  ["trial", "plan", "price", "billing", "subscription", "fee", "cost"],
  ["law", "legal", "rule", "regulation", "license", "licence", "allowed"],
  ["social", "instagram", "facebook", "pinterest", "tiktok"],
  ["google", "analytics", "search console", "seo"],
  ["test", "try", "practice", "pretend", "fake"],
  ["start", "begin", "first", "new", "setup", "set up"],
];

/** A word cut to its stem: "shipping", "ships", "shipped" → "ship". Plurals and -ing/-ed only. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length > 5 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) { w = w.slice(0, -3); if (/(.)\1$/.test(w)) w = w.slice(0, -1); return w; }
  if (w.length > 4 && w.endsWith("ed")) { w = w.slice(0, -2); if (/(.)\1$/.test(w)) w = w.slice(0, -1); return w; }
  if (w.length > 4 && w.endsWith("es") && /(sh|ch|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

const words = (text: string) => text.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter(Boolean);

/** The meaningful stems someone typed (small words dropped; all of them kept if nothing else is left). */
export function queryStems(text: string): string[] {
  const all = words(text);
  const kept = all.filter((w) => !STOP.has(w));
  return [...new Set((kept.length ? kept : all).map(stem))];
}

// Each stem → every stem that means the same (itself included). Phrases in SAME count by their words.
const SAME_OF = new Map<string, Set<string>>();
for (const group of SAME) {
  const stems = new Set(group.flatMap((g) => words(g).filter((w) => !STOP.has(w)).map(stem)));
  for (const s of stems) { const had = SAME_OF.get(s) ?? new Set<string>(); for (const t of stems) had.add(t); SAME_OF.set(s, had); }
}

/** One letter off (a swap, a missing, extra or wrong letter), for words of five letters or more. */
function nearMiss(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * What owners call each answer in their own words, read like the question. Kept here, beside the search, so the help
 * centre's answers stay as written. An answer with none is found by its own words only.
 */
export const ALSO_ASKED: Record<string, string> = {
  "add-a-book": "add new product item listing create",
  "shipping": "postage rates delivery prices cost ship send",
  "get-paid": "money payouts payout bank stripe square deposit when paid",
  "taxes": "gst hst pst qst vat sales tax charge collect",
  "discounts": "coupon promo code voucher sale percent off",
  "look": "theme colours colors fonts template design logo",
  "words": "text wording copy edit site page labels",
  "own-address": "domain custom url web address godaddy",
  "import-spreadsheet": "csv excel spreadsheet upload bulk import",
  "bring-books": "move migrate switch transfer from shopify squarespace woocommerce etsy big cartel old shop products",
  "bring-customers": "mailing list subscribers newsletter customers import",
  "old-links": "links redirect break old urls",
  "editions": "hardcover paperback signed format edition variant",
  "sizes-and-colours": "sizes colours colors shirt tshirt t-shirt clothing options variants",
  "pre-orders": "preorder pre-order before release upcoming not out yet advance",
  "new-order": "order placed received notification what happens",
  "send-order": "ship mark shipped tracking number fulfil dispatch label",
  "fairs": "fair craft market festival event pop up till in person booth",
  "stock-places": "market stall consignment shop location stock somewhere else",
  "team": "assistant staff employee helper accountant bookkeeper access invite",
  "copy-of-everything": "backup download export copy data customers orders",
  "close-shop": "cancel subscription delete account close quit leave",
  "trial-ends": "free trial ending ends expire billing",
  "policies": "privacy policy refund policy returns terms shipping policy",
  "open-shop": "go live launch public open publish shop",
  "test-order": "test order practice try pretend fake",
  "sell-on-social": "instagram facebook pinterest tiktok social post shop",
  "isbn": "isbn barcode number",
  "photos": "photos pictures images cover upload",
  "first-week": "start begin first steps where to start setup",
  "selling-legally": "law legal licence license business number rules allowed",
  "email-sender": "email address receipts order emails from sender reply",
  "size-guide": "size chart size guide measurements fit",
  "publish": "put on sale publish draft visible",
  "share": "tell people announce promote share marketing",
  "what-help": "support contact help person",
};

type Indexed = { entry: HelpEntry; question: Set<string>; also: Set<string>; steps: Set<string>; answer: Set<string> };
const INDEX = new WeakMap<HelpEntry, Indexed>();
const stemsOf = (text: string) => new Set(words(text).map(stem));
function indexed(entry: HelpEntry): Indexed {
  let got = INDEX.get(entry);
  if (!got) {
    got = { entry, question: stemsOf(entry.question), also: stemsOf(ALSO_ASKED[entry.id] || ""), steps: stemsOf([...(entry.steps || []), ...(entry.where || [])].join(" ")), answer: stemsOf(entry.answer.join(" ")) };
    INDEX.set(entry, got);
  }
  return got;
}

/** How well one typed stem fits a set of stems: 1 exact, 0.8 same meaning, 0.6 one letter off, else 0. */
function fit(stemTyped: string, bag: Set<string>): number {
  if (bag.has(stemTyped)) return 1;
  const same = SAME_OF.get(stemTyped);
  if (same) for (const s of same) if (bag.has(s)) return 0.8;
  for (const s of bag) if (nearMiss(stemTyped, s)) return 0.6;
  return 0;
}

/** A score for one answer, or 0 when it doesn't fit enough of what was typed. */
export function scoreAnswer(entry: HelpEntry, stems: readonly string[]): number {
  if (!stems.length) return 0;
  const x = indexed(entry);
  let total = 0; let hit = 0;
  for (const s of stems) {
    const best = Math.max(fit(s, x.question) * 5, fit(s, x.also) * 5, fit(s, x.steps) * 1.5, fit(s, x.answer) * 1);
    if (best > 0) hit++;
    total += best;
  }
  // Most of what was typed should fit: one word in two (one alone for one or two words).
  if (hit < Math.max(1, Math.ceil(stems.length / 2))) return 0;
  return total * (hit / stems.length);
}

/** Every word typed must appear (kept for callers that want a strict yes/no). */
export function matches(entry: HelpEntry, text: string): boolean {
  const stems = queryStems(text);
  return !stems.length || scoreAnswer(entry, stems) > 0;
}

/**
 * What the page lists: with nothing typed and no topic, the popular answers; otherwise the answers in the topic that fit
 * what was typed, best first.
 */
export function helpList(list: readonly HelpEntry[], { text, topic }: { text: string; topic: string }): { heading: "popular" | "results"; items: HelpEntry[] } {
  const typed = text.trim();
  if (!typed && topic === "All") {
    const byId = new Map(list.map((a) => [a.id, a]));
    return { heading: "popular", items: POPULAR.flatMap((id) => byId.get(id) ?? []) };
  }
  const inTopic = list.filter((a) => topic === "All" || a.topic === topic);
  if (!typed) return { heading: "results", items: inTopic };
  const stems = queryStems(typed);
  const scored = inTopic.map((a) => ({ a, s: scoreAnswer(a, stems) })).filter((r) => r.s > 0);
  scored.sort((p, q) => q.s - p.s);
  return { heading: "results", items: scored.map((r) => r.a) };
}

// Where-to-click paths name the menu ("Settings › Shipping", "Books › Add book"). Their first part names a page.
const FIRST: Record<string, string> = {
  overview: "overview", home: "overview", orders: "orders", customers: "customers", books: "catalog", products: "catalog",
  discounts: "discounts", "gift cards": "giftCards", inventory: "inventory", "sales channels": "channels",
  "social posts": "socialPosts", messages: "messages", analytics: "analytics", reviews: "reviews",
};
const STOCKROOM: Record<string, string> = { stockroom: "dashboard", "tax centre": "taxcenter", bookkeeping: "books", invoices: "invoices", stockists: "consignment", backups: "backups" };

/** The menu page a path opens (a page id, `settings/<page>` or `stockroom/<page>`), or null when it names none. */
export function wherePage(path: string, { combined }: { combined: boolean }): string | null {
  const [first = "", second = ""] = path.split("›").map((p) => p.trim().toLowerCase());
  if (first === "settings") {
    // Settings › Design is the Online store page (it opens Studio from there).
    if (second === "design") return "design";
    const child = NAV.find((n) => n.id === "settings")?.children?.find((c) => c.label.toLowerCase() === second || c.id.toLowerCase() === second);
    return SETTINGS_ITEM_PREFIX + (child?.id ?? "general");
  }
  if (FIRST[first]) return FIRST[first];
  if (combined && STOCKROOM[first]) return STOCKROOM_ITEM_PREFIX + STOCKROOM[first];
  return null;
}
