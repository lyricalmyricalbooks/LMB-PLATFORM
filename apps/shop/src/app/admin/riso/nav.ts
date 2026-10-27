import {
  BookOpen, Settings, Inbox, LayoutDashboard, BadgePercent, Star, ShoppingCart, Users, Boxes, Gift,
  SlidersHorizontal, Truck, CreditCard, Receipt, Palette, Mail,
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
  ] },
];

/** Sidebar id of a Settings page shown as its own top-level item: `settings/<page>`. */
export const SETTINGS_ITEM_PREFIX = "settings/";

/**
 * The sidebar list: every Settings page is its own top-level item (no fold-out), under a small
 * "Settings" heading. NAV itself keeps the nested shape that page titles and admin search read.
 */
export function sidebarItems(nav: NavEntry[]): NavEntry[] {
  return nav.flatMap((entry) => entry.children
    ? entry.children.map((child, i) => ({
      id: SETTINGS_ITEM_PREFIX + child.id, label: child.label, icon: child.icon || entry.icon, group: entry.id,
      ...(i === 0 ? { section: entry.label } : {}),
    }))
    : [entry]);
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
