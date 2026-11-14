// The admin walkthrough (Julian, 14 November 2026): a guided tour of the whole admin, shown the first time an owner
// opens it and replayed any time from Help. Each stop opens the real page and points at its place in the menu, so the
// owner learns the admin by seeing it, not by reading about it. Pure: the steps, which ones a shop gets, the words.
//
// Words: plain, one or two short sentences, no code or tool names. Book shops read "books"; every other shop reads the
// same text through the admin's word swap (`goodsWords`), and a step with `books` text uses it only for book shops.

/** Where a stop points: a menu item by its first page (`data-nav`), or a fixed part of the admin's frame. */
export type TourTarget = { nav: string } | { part: "side" | "search" | "status" | "fair" | "help" };
export type TourChapter = "around" | "website" | "stockroom" | "fair";

export interface TourStep {
  id: string;
  chapter: TourChapter;
  title: string;
  text: string;
  /** The words for a shop that sells books, when they differ from `text`. */
  books?: string;
  target?: TourTarget;
  /** The menu page this stop opens before it points (defaults to the `nav` target's page). */
  open?: string;
  /** Only in the admin that has a stockroom (shop + stockroom). */
  combinedOnly?: boolean;
}

export const CHAPTERS: { id: TourChapter; label: string; combinedLabel?: string }[] = [
  { id: "around", label: "Getting around" },
  { id: "website", label: "Your shop", combinedLabel: "Website" },
  { id: "stockroom", label: "Stockroom" },
  { id: "fair", label: "Fairs and markets" },
];

export const TOUR_STEPS: TourStep[] = [
  // ── Getting around ──
  { id: "side", chapter: "around", combinedOnly: true, target: { part: "side" }, open: "overview",
    title: "Two sides, one admin",
    text: "Website runs your shop online. Stockroom keeps your stock, sales away from the website and your money. Switch here." },
  { id: "search", chapter: "around", target: { part: "search" }, open: "overview",
    title: "Find anything",
    text: "Type a page, an order number, a customer or a product. On a computer, Ctrl K (⌘ K on a Mac) opens it from anywhere.",
    books: "Type a page, an order number, a customer, a title or an ISBN. On a computer, Ctrl K (⌘ K on a Mac) opens it from anywhere." },
  { id: "status", chapter: "around", target: { part: "status" }, open: "overview",
    title: "Open or closed",
    text: "This says whether shoppers can buy right now. Tap it to close the shop for a while, or open it again." },

  // ── Website (the shop itself) ──
  { id: "home", chapter: "website", target: { nav: "overview" },
    title: "Home",
    text: "What needs you today: orders to pack, payments to chase, stock running low. Each tile opens the job itself." },
  { id: "orders", chapter: "website", target: { nav: "orders" },
    title: "Orders",
    text: "Every order lands here. Open one to pack it, print a label and mark it shipped; the customer hears from you at each step." },
  { id: "messages", chapter: "website", target: { nav: "messages" },
    title: "Messages",
    text: "Notes shoppers send from your contact form. Reply here and your answer goes by email." },
  { id: "products", chapter: "website", target: { nav: "catalog" },
    title: "Books",
    text: "Add a product with a title, a price and a photo, then Publish. Until then it's a draft only you can see.",
    books: "Add a book with a title, a price and a cover, then Publish. Until then it's a draft only you can see." },
  { id: "marketing", chapter: "website", target: { nav: "discounts" },
    title: "Marketing",
    text: "Discount codes, gift cards, posts to social media and listings on places like Google." },
  { id: "analytics", chapter: "website", target: { nav: "analytics" },
    title: "Analytics",
    text: "Sales, visitors and best sellers, for any dates you pick." },
  { id: "design", chapter: "website", target: { nav: "design" },
    title: "Online store",
    text: "How your shop looks. Open Studio to change colours, words and pages; shoppers see nothing until you Publish." },
  { id: "settings", chapter: "website", target: { nav: "settings/general" },
    title: "Settings",
    text: "Your details, shipping, payments, taxes, your team and your plan. Shipping and payments come first, before you open." },

  // ── Stockroom ──
  { id: "inventory", chapter: "stockroom", combinedOnly: true, target: { nav: "stockroom/dashboard" },
    title: "Inventory",
    text: "How much you have of everything, where it is, and what to reorder before it runs out.",
    books: "How many copies you have of every title, where they are, and what to reprint before it runs out." },
  { id: "sales", chapter: "stockroom", combinedOnly: true, target: { nav: "stockroom/history" },
    title: "Sales",
    text: "Sales away from the website: fairs, shops and sales you type in. Website orders join them by themselves." },
  { id: "stockists", chapter: "stockroom", combinedOnly: true, target: { nav: "stockroom/consignment" },
    title: "Stockists",
    text: "Shops that sell for you: what you left with them, what they owe, and settling up.",
    books: "Bookshops that sell for you: copies left with them, what they owe, and settling up." },
  { id: "invoices", chapter: "stockroom", combinedOnly: true, target: { nav: "stockroom/invoices" },
    title: "Invoices",
    text: "Bill shops and wholesale buyers, send quotes, and see what's still unpaid." },
  { id: "tax", chapter: "stockroom", combinedOnly: true, target: { nav: "stockroom/taxcenter" },
    title: "Tax centre",
    text: "The sales tax you collected, what's due, and when to file it." },
  { id: "bookkeeping", chapter: "stockroom", combinedOnly: true, target: { nav: "stockroom/books" },
    title: "Bookkeeping",
    text: "Money in and out, expenses and receipts, and reports ready for tax time.",
    books: "Money in and out, expenses and receipts, what you owe your artists, and reports ready for tax time." },
  { id: "backups", chapter: "stockroom", combinedOnly: true, target: { nav: "stockroom/backups" },
    title: "Backups",
    text: "A copy of everything is made every night. Download all your data whenever you like." },

  // ── Fairs and markets ──
  { id: "fair", chapter: "fair", combinedOnly: true, target: { part: "fair" },
    title: "Selling at a fair",
    text: "Fair mode is a till, QR codes and a stock check. It keeps selling with no signal. Open it once at home first." },
  { id: "help", chapter: "fair", target: { part: "help" },
    title: "Help is always here",
    text: "Answers to common questions, this tour again, and a person to ask." },
];

/** The chapter's name in this admin. */
export function chapterLabel(chapter: TourChapter, combined: boolean): string {
  const c = CHAPTERS.find((x) => x.id === chapter)!;
  // A shop without a stockroom ends on Help, so its last chapter is "Help" rather than fairs.
  if (chapter === "fair" && !combined) return "Help";
  return (combined && c.combinedLabel) || c.label;
}

/**
 * The stops this admin gets: stockroom stops only with a stockroom, and a menu stop only when its item is in the menu
 * (`menuItems`: each item's first page, as the rail's `data-nav` names it). A stop's words come in the shop's words.
 */
export function tourFor({ combined, books, menuItems }: { combined: boolean; books: boolean; menuItems: ReadonlySet<string> }): TourStep[] {
  return TOUR_STEPS
    .filter((s) => (combined || !s.combinedOnly) && (!s.target || !("nav" in s.target) || menuItems.has(s.target.nav)))
    .map((s) => ({ ...s, text: books && s.books ? s.books : s.text }));
}

/** The chapters a tour has, in order, with the index of each chapter's first stop. */
export function chaptersOf(steps: TourStep[], combined: boolean): { id: TourChapter; label: string; start: number; count: number }[] {
  return CHAPTERS.flatMap((c) => {
    const start = steps.findIndex((s) => s.chapter === c.id);
    return start < 0 ? [] : [{ id: c.id, label: chapterLabel(c.id, combined), start, count: steps.filter((s) => s.chapter === c.id).length }];
  });
}

/** The page a stop opens, if any. */
export function pageOf(step: TourStep): string | undefined {
  return step.open ?? (step.target && "nav" in step.target ? step.target.nav : undefined);
}

/**
 * Where the card goes beside the highlighted spot: to its right when the spot is in the menu down the left side,
 * otherwise below it, or above when there is no room below. Kept inside the window with a margin.
 */
export function placeCard(spot: { left: number; top: number; right: number; bottom: number } | null,
  card: { width: number; height: number }, view: { width: number; height: number }, margin = 16): { left: number; top: number } {
  const clampX = (x: number) => Math.max(margin, Math.min(x, view.width - card.width - margin));
  const clampY = (y: number) => Math.max(margin, Math.min(y, view.height - card.height - margin));
  if (!spot) return { left: clampX((view.width - card.width) / 2), top: clampY((view.height - card.height) / 2) };
  const roomRight = view.width - spot.right - margin * 2;
  if (spot.right < view.width / 3 && roomRight >= card.width) return { left: spot.right + margin, top: clampY(spot.top - 8) };
  const below = spot.bottom + margin;
  if (below + card.height + margin <= view.height) return { left: clampX(spot.left), top: below };
  return { left: clampX(spot.left), top: clampY(spot.top - margin - card.height) };
}

// ── Remembering the tour ──
// Seen or skipped is kept on the device and on the shop's account (combinedTourStore.ts), so it's offered once.
const KEY = "lm:admin-tour";
export const TOUR_SEEN_VALUE = "tour-2";
function safeStorage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}
export function tourSeen(store: Pick<Storage, "getItem"> | null = safeStorage()): boolean {
  try { return store?.getItem(KEY) === TOUR_SEEN_VALUE; } catch { return false; }
}
export function markTourSeen(store: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try { store?.setItem(KEY, TOUR_SEEN_VALUE); } catch { /* private window: the welcome may show again */ }
}
