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

/** Every word typed must appear in the question, the answer, a step or a path. */
export function matches(entry: HelpEntry, text: string): boolean {
  const words = text.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 1);
  if (!words.length) return true;
  const hay = [entry.question, ...entry.answer, ...(entry.steps || []), ...(entry.where || [])].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * What the page lists: with nothing typed and no topic, the popular answers; otherwise every answer in the topic that
 * matches the words, questions that match first.
 */
export function helpList(list: readonly HelpEntry[], { text, topic }: { text: string; topic: string }): { heading: "popular" | "results"; items: HelpEntry[] } {
  const typed = text.trim();
  if (!typed && topic === "All") {
    const byId = new Map(list.map((a) => [a.id, a]));
    return { heading: "popular", items: POPULAR.flatMap((id) => byId.get(id) ?? []) };
  }
  const inTopic = list.filter((a) => (topic === "All" || a.topic === topic) && matches(a, typed));
  const lower = typed.toLowerCase();
  const inQuestion = (a: HelpEntry) => (lower && a.question.toLowerCase().includes(lower) ? 0 : 1);
  return { heading: "results", items: [...inTopic].sort((a, b) => inQuestion(a) - inQuestion(b)) };
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
