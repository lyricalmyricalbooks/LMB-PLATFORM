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
  { id: "history", label: "All sales", description: "Every sale from every place you sell: website, fairs, stockists, invoices and ones entered by hand." },
  { id: "manual", label: "Record a sale", description: "Add a sale made somewhere else, so stock and totals stay right." },
  { id: "pos", label: "Fair till", description: "Sell at a fair or event, and keep stock right as you go." },
  { id: "shipping", label: "Parcels and labels", description: "Shipping costs and labels for parcels that aren't website orders, such as copies for stockists." },
  { id: "consignment", label: "Stockists", description: "Shops holding your copies: what they have, what they sold and what they owe you." },
  { id: "qrcodes", label: "QR codes", description: "Codes that open a book's page, for tables, posters and the back of books." },
  { id: "opencall", label: "Open call", description: "Submissions from people who want to publish with you." },
  { id: "reconcile", label: "Payments and payouts", description: "Money coming in from every place you sell, matched to your sales." },
  { id: "expenses", label: "Expenses", description: "What the press spends, with receipts." },
  { id: "taxcenter", label: "Tax centre", description: "Sales tax and year-end totals, ready for your accountant." },
  { id: "intel", label: "Ask about your sales", description: "Questions about your books and sales, answered from your own records." },
  { id: "customers", label: "Buyers in person", description: "People who bought at fairs, from invoices or by hand." },
  { id: "sheets", label: "Google Sheet", description: "Keep a copy of your stockroom in a Google Sheet." },
  { id: "backups", label: "Stockroom backups", description: "Copies of your stockroom you can download or bring back." },
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
