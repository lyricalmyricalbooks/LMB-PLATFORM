import { hasStockroom, shopProfile, type ShopProfile } from "../../lib/shopProfile";

// The combined admin (shop + stockroom plan, design: docs/combined-admin.md). A press with both apps gets one admin:
// one menu holding the website's pages and the stockroom's, and no "Website · Inventory" switcher. The stockroom's
// pages are drawn by this admin itself (stockroom/nativePages.ts), so one sign-in covers both. Shop-only presses keep
// the website admin's own menu (riso/nav.ts MENU); stockroom-only presses never open it. Pure.

/** Both apps on: the website admin becomes the one admin. */
export function combinedAdmin(profile: ShopProfile = shopProfile): boolean {
  return profile.apps.shop === true && hasStockroom(profile);
}

/** The admin route of a stockroom page: `#stockroom/<page>`, tab "stockroom" with the page as its sub tab. */
export const STOCKROOM_TAB = "stockroom";
/** Menu id of a stockroom page: `stockroom/<page>`. */
export const STOCKROOM_ITEM_PREFIX = "stockroom/";
/** Where a fair helper opens their till: this admin, which shows them the Fair till only (FairHelperDesk.tsx). */
export const FAIR_TILL_PATH = "/admin";
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
  { id: "invoices", label: "Invoices", description: "Invoices for stockists and buyers: make, send, chase and mark paid." },
  { id: "qrcodes", label: "QR codes", description: "Codes to print for card payments, your shop and any link you choose." },
  { id: "reconcile", label: "Bookkeeping", description: "The record of money in and out: sales, costs, receipts and payouts." },
  { id: "payouts", label: "Payments", description: "Payouts to your bank, card sales on their way and your pay links." },
  { id: "expenses", label: "Bookkeeping", description: "The record of money in and out: sales, costs, receipts and payouts." },
  { id: "taxcenter", label: "Tax centre", description: "What you collected, what you owe and when to file." },
  // Bookkeeping (mockup, 12 November 2026): one title over five tabs; the menu names each tab (riso/nav.ts).
  { id: "books", label: "Bookkeeping", description: "The record of money in and out: sales, costs, receipts and payouts." },
  { id: "receipts", label: "Bookkeeping", description: "The record of money in and out: sales, costs, receipts and payouts." },
  { id: "artists", label: "Bookkeeping", description: "The record of money in and out: sales, costs, receipts and payouts." },
  { id: "intel", label: "Insights", description: "Your best seller, your best channel and what is worth knowing." },
  { id: "customers", label: "Buyers in person", description: "People who bought at fairs, from invoices or by hand." },
  { id: "sheets", label: "Sales spreadsheet", description: "Your stock, sales and costs copied to a Google Sheet in your own Drive." },
  { id: "backups", label: "Backups", description: "Nightly backups, all your data in one zip, and spreadsheets." },
];

const PAGES = new Map(STOCKROOM_PAGES.map((p) => [p.id, p]));
export const DEFAULT_STOCKROOM_PAGE = STOCKROOM_PAGES[0].id;

/** Pages that moved into another (Tax centre + Bookkeeping, 12 November 2026): old links and to-do fixes open the new one. */
const MOVED: Record<string, string> = {
  taxsales: "taxcenter", taxrates: "taxcenter", taxfilings: "taxcenter",
  taxledger: "reconcile", taxcosts: "expenses", taxyear: "books",
};

/** A stockroom page id from an address or a message, or undefined when it isn't one of the menu's. */
export function stockroomPage(id: string | undefined | null): StockroomPage | undefined {
  return id ? PAGES.get(MOVED[id] ?? id) : undefined;
}
