import { hasStockroom, shopProfile, type ShopProfile } from "../../lib/shopProfile";

// The combined admin (shop + stockroom plan, design: docs/combined-admin.md). A press with both apps gets one admin:
// one menu holding the website's pages and the stockroom's, and no "Website · Inventory" switcher. The stockroom's
// pages open inside this admin's content area, from the shop's own address (`/stockroom/app`), so one sign-in covers
// both. Shop-only presses keep the website admin's own menu (riso/nav.ts MENU); stockroom-only presses never open it.
// Pure; the frame is StockroomFrame.tsx and the stockroom's side is apps/stockroom/src/lib/inside-admin.js.

/** Both apps on: the website admin becomes the one admin. */
export function combinedAdmin(profile: ShopProfile = shopProfile): boolean {
  return profile.apps.shop === true && hasStockroom(profile);
}

/** The admin route of a stockroom page: `#stockroom/<page>`, tab "stockroom" with the page as its sub tab. */
export const STOCKROOM_TAB = "stockroom";
/** Menu id of a stockroom page: `stockroom/<page>`. */
export const STOCKROOM_ITEM_PREFIX = "stockroom/";
/** Where the shop's Hosting serves the stockroom (apps/shop/firebase.json rewrite; clients/deploy.js copies it in). */
export const STOCKROOM_FRAME_PATH = "/stockroom/app";
/** The combined admin's own page with every sale in one list (Orders › All sales, AllSales.tsx): `#sales`. */
export const SALES_TAB = "sales";
/** Stock › Reorder list (ReorderList.tsx): products about to run out, `#reorder`. */
export const REORDER_TAB = "reorder";
/** The combined admin's own pages (not stockroom pages, not in the website-only admin). */
export const isCombinedTab = (tab: string) => tab === SALES_TAB || tab === REORDER_TAB;
/** Pages only the combined admin has, besides the stockroom's: menu id, label and the line under the title. */
export const COMBINED_PAGES: StockroomPage[] = [
  { id: REORDER_TAB, label: "Reorder", description: "Products about to run out, most urgent first, with how many to order." },
  { id: SALES_TAB, label: "All sales", description: "Website orders beside the stockroom's own sales, counted once." },
];

/** Message senders; the same names as the stockroom's lib/inside-admin.js. */
export const FROM_ADMIN = "lm-admin";
export const FROM_STOCKROOM = "lm-stockroom";

export type StockroomPage = { id: string; label: string; description: string };

/**
 * The stockroom pages the combined menu holds, by the stockroom's own tab name (its switchTab). Its Website orders,
 * Web Analytics and Help pages are left out: the admin's Orders, Overview and Help already do those jobs, so the press
 * sees one of each. Its Shipping page (parcels and labels outside website orders) stays, beside the website's rates.
 */
export const STOCKROOM_PAGES: StockroomPage[] = [
  { id: "todo", label: "To-do", description: "Everything waiting for you in the stockroom: sales to check, stock to count, payments due." },
  { id: "dashboard", label: "Stock and sales", description: "Each book's copies on hand, sales everywhere and where its copies are." },
  // All sales (SALES_TAB) lists every sale; this is where a sale the stockroom recorded is looked up, changed or voided.
  { id: "history", label: "Sales records", description: "Look up, change or void a sale the stockroom recorded." },
  { id: "manual", label: "Record a sale", description: "Add a sale made somewhere else, so stock and totals stay right." },
  { id: "pos", label: "Till", description: "Sell at a fair, a market or your counter. Keeps selling when the signal drops." },
  { id: "shipping", label: "Parcels", description: "Shipping costs and labels for parcels that aren't website orders, such as copies for stockists." },
  { id: "consignment", label: "Stockists", description: "Shops holding your copies: what they have, what they sold and what they owe you." },
  { id: "qrcodes", label: "QR codes", description: "Codes that open a book's page, for tables, posters and the back of books." },
  { id: "reconcile", label: "Reconcile", description: "Money coming in from every place you sell, matched to your sales." },
  { id: "expenses", label: "Expenses", description: "What the press spends, with receipts." },
  { id: "taxcenter", label: "Tax centre", description: "Sales tax collected, fees and what to file." },
  { id: "intel", label: "Insights", description: "Your best seller, your best channel and what is worth knowing." },
  { id: "customers", label: "Buyers in person", description: "People who bought at fairs, from invoices or by hand." },
  { id: "sheets", label: "Sheets", description: "Keep a copy of your stockroom in a Google Sheet." },
  { id: "backups", label: "Backups", description: "Copies of your stockroom you can download or bring back." },
];

const PAGES = new Map(STOCKROOM_PAGES.map((p) => [p.id, p]));
export const DEFAULT_STOCKROOM_PAGE = STOCKROOM_PAGES[0].id;

/** A stockroom page id from an address or a message, or undefined when it isn't one of the menu's. */
export function stockroomPage(id: string | undefined | null): StockroomPage | undefined {
  return id ? PAGES.get(id) : undefined;
}

/** A message from the stockroom frame, checked: `{ type: "ready" }` or `{ type: "page", tab }`, else null. */
export function stockroomFrameMessage(event: { source: unknown; origin: string; data: unknown }, frame: unknown, origin: string):
  { type: "ready" } | { type: "page"; tab: string } | null {
  if (!event || !frame || event.source !== frame || event.origin !== origin) return null;
  const data = event.data as Record<string, unknown> | null;
  if (!data || typeof data !== "object" || data.source !== FROM_STOCKROOM) return null;
  if (data.type === "ready") return { type: "ready" };
  // Any page the frame shows, the menu's or not, so the admin always knows what is on screen.
  if (data.type === "page" && typeof data.tab === "string" && /^[a-z][a-z-]{1,29}$/.test(data.tab)) return { type: "page", tab: data.tab };
  return null;
}

/** A message for the stockroom frame. */
export const openMessage = (tab: string) => ({ source: FROM_ADMIN, type: "open", tab });
export const lookMessage = (look: string, appearance: "light" | "dark") => ({ source: FROM_ADMIN, type: "look", look, appearance });
