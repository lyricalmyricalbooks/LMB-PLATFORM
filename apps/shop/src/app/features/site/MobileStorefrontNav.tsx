import { useEffect, useRef } from "react";
import { accountsEnabled } from "./customerAccounts";
import { Link, useLocation } from "react-router";
import { navActiveColor } from "./headerNav";
import { NavDropdown } from "./NavDropdown";
import { elementScheme } from "./colorSchemes";
import { CurrencySelector } from "../../CurrencyContext";
import { splitNavigation, buildNavItems } from "./navItems";
import { getCopy } from "./storeCopy";
import { ThemeToggle } from "../../components/theme/ThemeToggle";

export function MobileStorefrontNav({ design, pages, onSearch, showThemeToggle = false }: { design: any; pages: any[]; onSearch: () => void; showThemeToggle?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const { pathname } = useLocation();
  // A tap or click outside the open menu closes it (like the category drop-downs).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  const d = { ...design, ...design?.storefront };
  const close = () => { if (ref.current) ref.current.open = false; };
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (d.showMobileNavigation === false) return null;
  const groups = splitNavigation(buildNavItems(d.categories || [], pages, d.navOrder), d);
  const linkClass = "block min-h-11 px-6 py-3 hover:opacity-70";
  // The link for the page on screen wears Style › Navigation links › "Current page link color".
  const here = (to: string) => pathname.endsWith(to) ? { "aria-current": "page" as const, style: { color: navActiveColor(d) } } : {};
  // Style › Header layout › "Phone navigation style": tabs across the top (default) or the drop-down menu.
  if (mobileNavStyle(d) === "tabs") return <MobileNavTabs design={design} d={d} groups={groups} showThemeToggle={showThemeToggle} pathname={pathname} slug={slug} />;
  return <details ref={ref} className="md:hidden" data-ga-menu="phone" data-studio-target="style:header|menus:categories|copy:Header" data-studio-label="Mobile navigation"
    onKeyDown={e => { if (e.key === "Escape") { close(); ref.current?.querySelector("summary")?.focus(); } }}>
    <summary className="min-h-11 cursor-pointer px-6 py-3 font-semibold">{getCopy(design, "navMenu")}</summary>
    <nav aria-label={getCopy(design, "ariaMainNavigation")} className="border-t border-current/20 pb-4">
      {groups.primary.map(item => <div key={item.key}>
        <Link className={linkClass} onClick={close} to={item.kind === "page" ? `/page/${item.page.slug}` : `/collections/${slug(item.label)}`} {...here(item.kind === "page" ? `/page/${item.page.slug}` : `/collections/${slug(item.label)}`)}>{item.label}</Link>
        {item.kind === "category" && item.children.filter(c => c.showInNav !== false).map(c => <Link key={c.id} className={`${linkClass} pl-10`} onClick={close} to={`/collections/${slug(c.name)}`} {...here(`/collections/${slug(c.name)}`)}>{c.name}</Link>)}
      </div>)}
      {d.showSecondaryNavigation !== false && groups.secondary.length > 0 && <div role="group" aria-label={getCopy(design, "secondaryNavigationAria")} className="border-t border-current/20" data-studio-target="menus:header-order|style:header|copy:Header" data-studio-label="Publisher navigation">
        {groups.secondary.map(item => item.kind === "page" && <Link key={item.key} className={linkClass} onClick={close} to={`/page/${item.page.slug}`} {...here(`/page/${item.page.slug}`)}>{item.label}</Link>)}
      </div>}
      {!d.hideHeaderSearch && <button className={linkClass} onClick={() => { close(); onSearch(); }}>{getCopy(design, "navSearch")}</button>}
      {!d.hideHeaderWishlist && <Link className={linkClass} onClick={close} to="/wishlist">{getCopy(design, "ariaWishlist")}</Link>}
      {!d.hideHeaderAccount && accountsEnabled(design) && <Link className={linkClass} onClick={close} to="/account">{getCopy(design, "ariaAccount")}</Link>}
      {!d.hideCurrencySelector && <div className="px-6 py-3 [&_select]:-my-3 [&_select]:py-3"><CurrencySelector label={getCopy(design, "currencyLabel")} ariaLabel={getCopy(design, "ariaCurrency")} /></div>}
      {showThemeToggle && <div className="px-6 py-3"><ThemeToggle label={getCopy(design, "ariaThemeToggle")} /></div>}
    </nav>
  </details>;
}

/** "tabs" (a sideways-scrolling row of links) unless Studio picked the drop-down "menu". */
export const mobileNavStyle = (d: any): "tabs" | "menu" => (d?.mobileNavStyle === "menu" ? "menu" : "tabs");

function MobileNavTabs({ design, d, groups, showThemeToggle, pathname, slug }: { design: any; d: any; groups: ReturnType<typeof splitNavigation>; showThemeToggle: boolean; pathname: string; slug: (s: string) => string }) {
  const rowRef = useRef<HTMLDivElement>(null);
  // A category with sub-categories opens a drop-down (All + each sub-category), like the desktop header.
  const tabs: { key: string; to: string; label: string; children?: { key: string; to: string; label: string }[] }[] = [];
  for (const item of groups.primary) {
    if (item.kind === "page") { tabs.push({ key: item.key, to: `/page/${item.page.slug}`, label: item.label }); continue; }
    const children = item.children.filter(c => c.showInNav !== false).map(c => ({ key: `cat:${c.id}`, to: `/collections/${slug(c.name)}`, label: c.name }));
    tabs.push({ key: item.key, to: `/collections/${slug(item.label)}`, label: item.label, children: children.length ? children : undefined });
  }
  const secondary: typeof tabs = [];
  if (d.showSecondaryNavigation !== false) for (const item of groups.secondary) if (item.kind === "page") secondary.push({ key: item.key, to: `/page/${item.page.slug}`, label: item.label });
  const extras: typeof tabs = [];
  if (!d.hideHeaderWishlist) extras.push({ key: "wishlist", to: "/wishlist", label: getCopy(design, "ariaWishlist") });
  if (!d.hideHeaderAccount && accountsEnabled(design)) extras.push({ key: "account", to: "/account", label: getCopy(design, "ariaAccount") });
  const activeKey = [...tabs.flatMap(t => [t, ...(t.children || [])]), ...secondary, ...extras].find(t => pathname.endsWith(t.to))?.key;
  // Bring the current page's tab into view when it sits past the right edge.
  useEffect(() => {
    const row = rowRef.current;
    const el = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && el && (el.offsetLeft + el.offsetWidth > row.scrollLeft + row.clientWidth || el.offsetLeft < row.scrollLeft)) row.scrollLeft = Math.max(0, el.offsetLeft - 24);
  }, [activeKey]);
  const tab = (t: { key: string; to: string; label: string; children?: { key: string; to: string; label: string }[] }) => {
    if (t.children) {
      const on = t.key === activeKey || t.children.some(c => c.key === activeKey);
      return <NavDropdown key={t.key} design={d} copyDesign={design} label={t.label}
        className={`min-h-11 shrink-0 border-b-2 font-semibold ${on ? "" : "border-transparent opacity-80"}`}
        linkStyle={on ? { color: navActiveColor(d), borderColor: "currentColor" } : { color: d.navLinkColor || (elementScheme(d, "header") ? "currentColor" : d.headerColor) || "var(--text)" }}
        all={{ key: `${t.key}:all`, label: t.label, to: t.to, active: t.key === activeKey }}
        entries={t.children.map(c => ({ ...c, active: c.key === activeKey }))} />;
    }
    const on = t.key === activeKey;
    return <Link key={t.key} to={t.to} aria-current={on ? "page" : undefined}
      className={`flex min-h-11 shrink-0 items-center border-b-2 font-semibold ${on ? "" : "border-transparent opacity-80 hover:opacity-100"}`}
      style={on ? { color: navActiveColor(d), borderColor: "currentColor" } : undefined}>{t.label}</Link>;
  };
  const size = Number(d.mobileNavTabSize) > 0 ? Number(d.mobileNavTabSize) : 14;
  return <nav aria-label={getCopy(design, "ariaMainNavigation")} className="md:hidden border-t border-current/20" data-ga-menu="phone" data-studio-target="style:header|menus:categories|copy:Header" data-studio-label="Mobile navigation">
    <div ref={rowRef} className="fm-mobile-tabs flex items-stretch gap-6 overflow-x-auto whitespace-nowrap px-6" style={{ scrollbarWidth: "none", fontSize: size }}>
      {tabs.map(tab)}
      {secondary.length > 0 && <div role="group" aria-label={getCopy(design, "secondaryNavigationAria")} className="contents" data-studio-target="menus:header-order|style:header|copy:Header" data-studio-label="Publisher navigation">{secondary.map(tab)}</div>}
      {extras.map(tab)}
      {/* The currency box is a ~19px line: its select gets a 43px tap area (padding cancelled by margin, so nothing moves). */}
      {!d.hideCurrencySelector && <div className="flex shrink-0 items-center [&_select]:-my-3 [&_select]:py-3"><CurrencySelector label={getCopy(design, "currencyLabel")} ariaLabel={getCopy(design, "ariaCurrency")} /></div>}
      {showThemeToggle && <div className="flex shrink-0 items-center"><ThemeToggle label={getCopy(design, "ariaThemeToggle")} /></div>}
    </div>
  </nav>;
}
