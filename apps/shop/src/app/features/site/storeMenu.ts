// ─────────────────────────────────────────────────────────────────────────────
// Store menus — editor-defined navigation for the header and footer.
//
// Menus are stored on design.menus = { header: MenuItem[], footer: MenuItem[] }.
// Each item links to the home page, a custom page, a collection/category, or an
// arbitrary URL, and may contain one level of children (rendered as a header
// dropdown / footer sub-links). When a menu is empty the storefront falls back
// to its previous page-derived navigation, so this is fully backwards-compatible.
// ─────────────────────────────────────────────────────────────────────────────

export type MenuLinkType = "home" | "page" | "collection" | "url";

export type MenuItem = {
  id: string;
  label: string;
  type: MenuLinkType;
  /** page slug, collection slug, or URL. Unused for "home". */
  value?: string;
  children?: MenuItem[];
  /** Footer placement and optional visibility, edited in Studio. */
  footerGroup?: "explore" | "connect";
  hidden?: boolean;
  /** Header-only: render children as a full mega-menu panel instead of a dropdown. */
  mega?: boolean;
  /** Mega menu featured card (optional). */
  featuredImage?: string;
  featuredTitle?: string;
  featuredLink?: string;
};

export type StoreMenus = {
  header?: MenuItem[];
  footer?: MenuItem[];
};

export const MENU_LINK_TYPES: { value: MenuLinkType; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "page", label: "Page" },
  { value: "collection", label: "Collection" },
  { value: "url", label: "Custom URL" },
];

export const slugify = (s: string): string =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Resolve a menu item to an href the storefront router understands. */
export function resolveHref(item: MenuItem): string {
  switch (item.type) {
    case "home":
      return "/";
    case "page":
      return item.value ? `/page/${item.value}` : "/";
    case "collection":
      return item.value ? `/collections/${slugify(item.value)}` : "/";
    case "url":
      return item.value || "#";
    default:
      return "#";
  }
}

/** External links (open in a new tab) are absolute http(s) URLs. */
export function isExternal(item: MenuItem): boolean {
  return item.type === "url" && /^https?:\/\//i.test(item.value || "");
}

export function newMenuItem(partial?: Partial<MenuItem>): MenuItem {
  return {
    id: (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    label: "New link",
    type: "home",
    value: "",
    ...partial,
  };
}
