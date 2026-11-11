import {
  BookOpen, Settings, Inbox, LayoutDashboard, BadgePercent, Star, ShoppingCart, Users, Boxes, Gift,
  SlidersHorizontal, Truck, CreditCard, Receipt, Palette, Mail, UserPlus, Calculator, Wallet, FileText, Store, Megaphone, PiggyBank, ShieldCheck, Plug, Blocks,
  Share2, Send, ListChecks,
} from "lucide-react";
import type { NavEntry } from "./components";
import { COMBINED_PAGES, REORDER_TAB, SALES_TAB, STOCKROOM_ITEM_PREFIX, STOCKROOM_PAGES } from "../combined";

export const NAV: NavEntry[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "orders", label: "Orders", icon: ShoppingCart },
  { id: "customers", label: "Customers", icon: Users },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "catalog", label: "Books", icon: BookOpen },
  { id: "discounts", label: "Discounts", icon: BadgePercent },
  { id: "giftCards", label: "Gift cards", icon: Gift },
  { id: "reviews", label: "Reviews", icon: Star },
  { id: "messages", label: "Messages", icon: Inbox },
  // Facebook & Instagram, Pinterest, TikTok and Google & YouTube, like Shopify's sales channels (plan 27.5).
  { id: "channels", label: "Sales channels", icon: Share2 },
  // Posting a product to the connected accounts, now or later (plan 27.6), next to Discounts like Shopify's Marketing.
  { id: "socialPosts", label: "Social posts", icon: Send },
  { id: "settings", label: "Settings", icon: Settings, children: [
    { id: "general", label: "General", icon: SlidersHorizontal },
    { id: "shipping", label: "Shipping", icon: Truck },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "taxes", label: "Taxes", icon: Receipt },
    { id: "designer", label: "Design", icon: Palette },
    // One email page: templates, shop alerts, Gmail sending, sender details and recent deliveries.
    { id: "notifications", label: "Email sender", icon: Mail },
    // Every Google service in one place, with one sign-in (GoogleSettings.tsx); hidden on a shop not run by Colophon.
    { id: "google", label: "Google", icon: Plug },
    // What installed apps changed, and why a change was refused (AppsSettings.tsx); hidden on a shop not run by Colophon.
    { id: "apps", label: "Apps", icon: Blocks },
    { id: "team", label: "Team", icon: UserPlus },
    // Two-step sign-in with an authenticator app, for whoever is signed in (22.6).
    { id: "security", label: "Security", icon: ShieldCheck },
    // The QuickBooks link (plan 7.16); hidden unless the platform's bookkeeping link is on (`withoutPages`).
    { id: "bookkeeping", label: "Bookkeeping", icon: Calculator },
    // The shop's plan on the platform (plan 6.6), managed here since 22.3: compare and change plans, how you pay, cancel.
    { id: "plan", label: "Plan", icon: Wallet },
    // Bills, saved cards, billing details and paying a declined bill (22.3), where Shopify keeps them.
    { id: "billing", label: "Billing", icon: FileText },
  ] },
];

/** Sidebar id of a Settings page shown as its own top-level item: `settings/<page>`. */
export const SETTINGS_ITEM_PREFIX = "settings/";

/**
 * The admin menu (plan 1.27): five items. Each opens its first page; the item holding the page you are on lists its
 * other pages under it. NAV keeps every page (titles, admin search and routes read it); this only groups them.
 * A page's id here is its module id, or `settings/<page>` for a Settings page.
 */
export type Menu = { label: string; icon: NavEntry["icon"]; pages: string[] }[];
// Every Settings page, in NAV's order. Both menus' Settings read it, so a page added to Settings (Billing, say) shows
// in the combined admin too. Design has its own menu item ("Design", or "Online store" in the combined admin).
const SETTINGS_PAGES = (NAV.find((n) => n.id === "settings")?.children || []).map((c) => SETTINGS_ITEM_PREFIX + c.id).filter((id) => id !== SETTINGS_ITEM_PREFIX + "designer");
export const MENU: Menu = [
  { label: "Home", icon: LayoutDashboard, pages: ["overview"] },
  { label: "Orders", icon: ShoppingCart, pages: ["orders", "customers", "discounts", "giftCards", "socialPosts", "messages"] },
  // Sales channels sit with the products: where each one is listed (Studio opens full screen, so not under Design).
  { label: "Books", icon: BookOpen, pages: ["catalog", "inventory", "reviews", "channels"] },
  { label: "Design", icon: Palette, pages: [SETTINGS_ITEM_PREFIX + "designer"] },
  { label: "Settings", icon: Settings, pages: SETTINGS_PAGES },
];

const S = (id: string) => STOCKROOM_ITEM_PREFIX + id;

/**
 * The combined admin's menu (shop + stockroom plan, admin/combined.ts; design in docs/combined-admin.md), in two sides
 * (Julian, 10 November 2026): running the website, and the stockroom (stock, sales off the website, money). A switch
 * at the top of the rail picks the side; the rail shows only that side's items. Home stays on the website side and
 * shows both (stockroom to-dos, the fair today).
 */
export type AdminSide = "website" | "stockroom";
export const WEBSITE_SIDE: Menu = [
  { label: "Home", icon: LayoutDashboard, pages: ["overview"] },
  { label: "Orders", icon: ShoppingCart, pages: ["orders", SALES_TAB, "customers", "messages"] },
  { label: "Books", icon: BookOpen, pages: ["catalog", "reviews", "channels"] },
  { label: "Marketing", icon: Megaphone, pages: ["discounts", "giftCards", "socialPosts"] },
  { label: "Online store", icon: Palette, pages: [SETTINGS_ITEM_PREFIX + "designer"] },
  { label: "Settings", icon: Settings, pages: SETTINGS_PAGES },
];
export const STOCKROOM_SIDE: Menu = [
  { label: "To-do", icon: ListChecks, pages: [S("todo")] },
  { label: "Stock", icon: Boxes, pages: [S("dashboard"), "inventory", REORDER_TAB] },
  { label: "Sales", icon: Receipt, pages: [S("history"), S("manual"), S("customers"), S("shipping")] },
  { label: "Sell in person", icon: Store, pages: [S("pos"), S("consignment"), S("qrcodes")] },
  { label: "Money", icon: PiggyBank, pages: [S("taxcenter"), S("reconcile"), S("expenses"), S("intel")] },
  { label: "Open call", icon: Inbox, pages: [S("opencall")] },
  { label: "Stockroom settings", icon: SlidersHorizontal, pages: [S("sheets"), S("backups")] },
];
/** Both sides as one list: what search, routes and "which item holds this page" read. */
export const COMBINED_MENU: Menu = [...WEBSITE_SIDE, ...STOCKROOM_SIDE];

/** The side a page belongs to. */
export function sideOf(page: string): AdminSide {
  return STOCKROOM_SIDE.some((g) => g.pages.includes(page)) ? "stockroom" : "website";
}
export const sideMenu = (side: AdminSide): Menu => (side === "stockroom" ? STOCKROOM_SIDE : WEBSITE_SIDE);

/** Every page with its menu id and label, in NAV order. */
export function navPages(nav: NavEntry[]): { id: string; label: string }[] {
  return nav.flatMap((entry) => entry.children
    ? entry.children.map((child) => ({ id: SETTINGS_ITEM_PREFIX + child.id, label: child.label }))
    : [{ id: entry.id, label: entry.label }]);
}

/** The menu items. An item's id is its first page; an item with more than one page lists them as children. */
export function sidebarItems(nav: NavEntry[], menu: Menu = MENU): NavEntry[] {
  const labels = new Map([...navPages(nav).map((p) => [p.id, p.label] as const), ...STOCKROOM_PAGES.map((p) => [S(p.id), p.label] as const), ...COMBINED_PAGES.map((p) => [p.id, p.label] as const)]);
  return menu.map((group) => ({
    id: group.pages[0], label: group.label, icon: group.icon,
    ...(group.pages.length > 1 ? { children: group.pages.map((id) => ({ id, label: labels.get(id) || id })) } : {}),
  }));
}

/** The menu without the pages this shop doesn't have on (an item keeps its other pages). */
export function withoutPages(items: NavEntry[], hidden: ReadonlySet<string>): NavEntry[] {
  if (!hidden.size) return items;
  return items.filter((item) => !hidden.has(item.id)).map((item) => (item.children ? { ...item, children: item.children.filter((c) => !hidden.has(c.id)) } : item));
}

/** The menu item (its id) that holds a page. */
export function menuItemFor(page: string, menu: Menu = MENU): string {
  return menu.find((group) => group.pages.includes(page))?.pages[0] ?? page;
}

export const PAGE_COPY: Record<string, { title: string; description: string }> = {
  overview: { title: "Overview", description: "Sales, orders, and catalog health at a glance." },
  orders: { title: "Orders", description: "Review payments, fulfillment, and shipping for every order." },
  customers: { title: "Customers", description: "Who buys from you: lifetime value, repeat buyers, and customers to win back." },
  inventory: { title: "Inventory", description: "Stock on hand, low-stock and reprint alerts, and quick count corrections." },
  catalog: { title: "Books", description: "Manage titles, pricing, formats, and inventory." },
  discounts: { title: "Discounts", description: "Create and schedule discount codes and automatic offers." },
  giftCards: { title: "Gift cards", description: "Gift cards shoppers bought and ones you issued: balances, history and resending codes." },
  reviews: { title: "Reviews", description: "Moderate customer reviews before they appear on the storefront." },
  channels: { title: "Sales channels", description: "Sell where people already look: Facebook, Instagram, Pinterest, TikTok and Google." },
  socialPosts: { title: "Social posts", description: "Post your products to your connected accounts, now or at a time you pick." },
  messages: { title: "Messages", description: "Messages people send you from the contact form on your website." },
  settings: { title: "Settings", description: "Store identity, shipping, payments, design, and notifications." },
  shipping: { title: "Shipping", description: "Shipping profiles, zones, and rates." },
  payments: { title: "Payments", description: "Payment methods and currency configuration." },
  general: { title: "General", description: "Your brand's details, your web address and how the shop runs." },
  taxes: { title: "Taxes", description: "The tax rates your checkout charges." },
  team: { title: "Team", description: "People who help run your store, and what each can do." },
  plan: { title: "Plan", description: "Your plan and what it includes." },
  billing: { title: "Billing", description: "Your card, invoices and the next bill." },
};
