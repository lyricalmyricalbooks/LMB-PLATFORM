import {
  BookOpen, Settings, Inbox, LayoutDashboard, BadgePercent, Star, ShoppingCart, Users, Boxes, Gift,
  SlidersHorizontal, Truck, CreditCard, Receipt, Palette, Mail, UserPlus,
} from "lucide-react";
import type { NavEntry } from "./components";

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
  { id: "settings", label: "Settings", icon: Settings, children: [
    { id: "general", label: "General", icon: SlidersHorizontal },
    { id: "shipping", label: "Shipping", icon: Truck },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "taxes", label: "Taxes", icon: Receipt },
    { id: "designer", label: "Design", icon: Palette },
    // One email page: templates, shop alerts, Gmail sending, sender details and recent deliveries.
    { id: "notifications", label: "Email sender", icon: Mail },
    { id: "team", label: "Team", icon: UserPlus },
  ] },
];

/** Sidebar id of a Settings page shown as its own top-level item: `settings/<page>`. */
export const SETTINGS_ITEM_PREFIX = "settings/";

/**
 * The admin menu (plan 1.27): five items. Each opens its first page; the item holding the page you are on lists its
 * other pages under it. NAV keeps every page (titles, admin search and routes read it); this only groups them.
 * A page's id here is its module id, or `settings/<page>` for a Settings page.
 */
export const MENU: { label: string; icon: NavEntry["icon"]; pages: string[] }[] = [
  { label: "Home", icon: LayoutDashboard, pages: ["overview"] },
  { label: "Orders", icon: ShoppingCart, pages: ["orders", "customers", "discounts", "giftCards", "messages"] },
  { label: "Books", icon: BookOpen, pages: ["catalog", "inventory", "reviews"] },
  { label: "Design", icon: Palette, pages: [SETTINGS_ITEM_PREFIX + "designer"] },
  { label: "Settings", icon: Settings, pages: ["general", "shipping", "payments", "taxes", "notifications", "team"].map((id) => SETTINGS_ITEM_PREFIX + id) },
];

/** Every page with its menu id and label, in NAV order. */
export function navPages(nav: NavEntry[]): { id: string; label: string }[] {
  return nav.flatMap((entry) => entry.children
    ? entry.children.map((child) => ({ id: SETTINGS_ITEM_PREFIX + child.id, label: child.label }))
    : [{ id: entry.id, label: entry.label }]);
}

/** The five menu items. An item's id is its first page; an item with more than one page lists them as children. */
export function sidebarItems(nav: NavEntry[]): NavEntry[] {
  const labels = new Map(navPages(nav).map((p) => [p.id, p.label]));
  return MENU.map((group) => ({
    id: group.pages[0], label: group.label, icon: group.icon,
    ...(group.pages.length > 1 ? { children: group.pages.map((id) => ({ id, label: labels.get(id) || id })) } : {}),
  }));
}

/** The menu item (its id) that holds a page. */
export function menuItemFor(page: string): string {
  return MENU.find((group) => group.pages.includes(page))?.pages[0] ?? page;
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
  messages: { title: "Messages", description: "Messages people send you from the contact form on your website." },
  settings: { title: "Settings", description: "Store identity, shipping, payments, design, and notifications." },
  shipping: { title: "Shipping", description: "Shipping profiles, zones, and rates." },
  payments: { title: "Payments", description: "Payment methods and currency configuration." },
};
