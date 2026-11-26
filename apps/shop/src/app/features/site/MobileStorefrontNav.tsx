import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Menu as MenuIcon, X } from "lucide-react";
import { accountsEnabled } from "./customerAccounts";
import { Link, useLocation } from "react-router";
import { navActiveColor } from "./headerNav";
import { NavDropdown } from "./NavDropdown";
import { elementScheme } from "./colorSchemes";
import { CurrencySelector } from "../../CurrencyContext";
import { bookingsLinkShown, useBookingsLive } from "./bookingsLive";
import { eventsLinkShown, useEventsLive } from "./eventsLive";
import { classesLinkShown, useClassesLive } from "./classesLive";
import { supportLinkShown, useGivingLive } from "./supportLive";
import { splitNavigation, buildNavItems, withShopLink, type NavItem } from "./navItems";
import { getCopy } from "./storeCopy";
import { useStudioOverlay } from "./studioOverlay";
import { ThemeToggle } from "../../components/theme/ThemeToggle";
import { useShopSocial } from "./shopSocial";
import type { SocialLink } from "./socialAccounts";

export function MobileStorefrontNav({ design, pages, onSearch, showThemeToggle = false, everywhere = false }: { design: any; pages: any[]; onSearch: () => void; showThemeToggle?: boolean; everywhere?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const { pathname } = useLocation();
  const bookings = useBookingsLive();
  const events = useEventsLive();
  const classes = useClassesLive();
  const giving = useGivingLive();
  const social = useShopSocial();
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
  if (d.showMobileNavigation === false && !everywhere) return null;
  const groups = splitNavigation(buildNavItems(d.categories || [], pages, d.navOrder), d);
  const primary = withShopLink(groups.primary, d, getCopy(design, "navShopLabel"));
  const linkClass = "block min-h-11 px-6 py-3 hover:opacity-70";
  // The link for the page on screen wears Style › Navigation links › "Current page link color".
  const here = (to: string): { "aria-current"?: "page"; style?: CSSProperties } => pathname.endsWith(to) ? { "aria-current": "page", style: { color: navActiveColor(d) } } : {};
  // Style › Header layout › "Phone navigation style": tabs across the top (default) or the drop-down menu.
  // Header layout › Minimal: the Menu button holds every link on every screen size.
  const menuSocial = d.showSocialInMobileMenu !== false ? social : [];
  // "Menu button beside the name": the header draws this menu itself (PhoneHeaderMenu), so nothing below the header row.
  if (!everywhere && mobileNavStyle(d) === "icon") return null;
  if (!everywhere && mobileNavStyle(d) === "tabs") return <MobileNavTabs design={design} d={d} groups={groups} bookings={bookings} showThemeToggle={showThemeToggle} pathname={pathname} slug={slug} social={menuSocial} />;
  // The menu's links, drawn by the drop-down and by the full-screen panel (`big` for the main links in the panel).
  const links = (close: () => void, big?: { className: string; style: CSSProperties }) => <>
    {primary.map(item => { const to = itemPath(item, slug); const own = here(to); return <div key={item.key}>
      <Link className={big?.className || linkClass} onClick={close} to={to} {...own} style={{ ...big?.style, ...own.style }}>{item.label}</Link>
      {item.kind !== "page" && item.children.filter(c => c.showInNav !== false).map(c => <Link key={c.id} className={`${linkClass} pl-10`} onClick={close} to={`/collections/${slug(c.name)}`} {...here(`/collections/${slug(c.name)}`)}>{c.name}</Link>)}
    </div>; })}
    {d.showSecondaryNavigation !== false && groups.secondary.length > 0 && <div role="group" aria-label={getCopy(design, "secondaryNavigationAria")} className="border-t border-current/20" data-studio-target="menus:header-order|style:header|copy:Header" data-studio-label="Publisher navigation">
      {groups.secondary.map(item => item.kind === "page" && <Link key={item.key} className={linkClass} onClick={close} to={`/page/${item.page.slug}`} {...here(`/page/${item.page.slug}`)}>{item.label}</Link>)}
    </div>}
    {/* In the panel the rest sit in a quieter list under a rule; the bookings link stays big (it is a services shop's main door). */}
    {big && <hr className="mx-6 my-3 border-current/15" />}
    {bookingsLinkShown(bookings, d) && big && <Link className={big.className} style={big.style} onClick={close} to="/book" {...here("/book")}>{getCopy(design, "bookTimeNavLink")}</Link>}
    {!d.hideHeaderSearch && <button className={`${linkClass} text-left`} onClick={() => { close(); onSearch(); }}>{getCopy(design, "navSearch")}</button>}
    {bookingsLinkShown(bookings, d) && !big && <Link className={linkClass} onClick={close} to="/book" {...here("/book")}>{getCopy(design, "bookTimeNavLink")}</Link>}
    {eventsLinkShown(events, d) && <Link className={linkClass} onClick={close} to="/events" {...here("/events")}>{getCopy(design, "eventsNavLink")}</Link>}
    {classesLinkShown(classes, d) && <Link className={linkClass} onClick={close} to="/classes" {...here("/classes")}>{getCopy(design, "classesNavLink")}</Link>}
    {supportLinkShown(giving, d) && <Link className={linkClass} onClick={close} to="/support" {...here("/support")}>{getCopy(design, "supportNavLink")}</Link>}
    {!d.hideHeaderWishlist && <Link className={linkClass} onClick={close} to="/wishlist">{getCopy(design, "ariaWishlist")}</Link>}
    {!d.hideHeaderAccount && accountsEnabled(design) && <Link className={linkClass} onClick={close} to="/account">{getCopy(design, "ariaAccount")}</Link>}
    {!d.hideCurrencySelector && <div className="px-6 py-3 [&_select]:-my-3 [&_select]:py-3"><CurrencySelector label={getCopy(design, "currencyLabel")} ariaLabel={getCopy(design, "ariaCurrency")} /></div>}
    {showThemeToggle && <div className="px-6 py-3"><ThemeToggle label={getCopy(design, "ariaThemeToggle")} /></div>}
    {menuSocial.length > 0 && <MenuSocial design={design} links={menuSocial} />}
  </>;
  // Style › Header layout › "Menu button opens a full-screen panel": the whole screen, big links (Shopify and
  // Squarespace phone menus), instead of the small box under the button.
  if (everywhere && d.phoneMenuFullScreen === true) return <PhonePanelMenu design={design} links={links} />;
  return <details ref={ref} className={everywhere ? "relative shrink-0" : "md:hidden"} data-ga-menu="phone" data-studio-target="style:header|menus:categories|copy:Header" data-studio-label="Mobile navigation"
    onKeyDown={e => { if (e.key === "Escape") { close(); ref.current?.querySelector("summary")?.focus(); } }}>
    <summary className={everywhere ? "flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] [&::-webkit-details-marker]:hidden" : "min-h-11 cursor-pointer px-6 py-3 font-semibold"}>
      {everywhere && <MenuIcon size={18} aria-hidden="true" />}{everywhere ? <span className="max-md:sr-only">{getCopy(design, "navMenu")}</span> : getCopy(design, "navMenu")}
    </summary>
    <nav aria-label={getCopy(design, "ariaMainNavigation")} className={everywhere ? "absolute left-0 top-full z-50 mt-2 w-72 max-w-[85vw] border border-current/20 pb-4 shadow-lg" : "border-t border-current/20 pb-4"}
      style={everywhere ? { backgroundColor: "var(--bg-color, var(--background))" } : undefined}>
      {links(close)}
    </nav>
  </details>;
}

const PANEL_CSS = `@media (prefers-reduced-motion: no-preference){.fm-menu-panel{animation:fm-menu-panel-in .28s cubic-bezier(.2,.7,.2,1)}}
@keyframes fm-menu-panel-in{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}`;

/**
 * The full-screen phone menu. It sits on the page itself (a portal): the header's blur would otherwise squeeze a
 * fixed panel into the header's own box. The page behind stops scrolling while it is open.
 */
function PhonePanelMenu({ design, links }: { design: any; links: (close: () => void, big?: { className: string; style: CSSProperties }) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); button.current?.focus(); };
  // Studio's page structure opens it in the phone preview so the owner can see and style it.
  useStudioOverlay("menu", setOpen);
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("button, a")?.focus();
    return () => { document.body.style.overflow = before; };
  }, [open]);
  const big = { className: "block min-h-12 px-6 py-2.5 text-[1.75rem] leading-tight hover:opacity-70", style: { fontFamily: "var(--heading-font, inherit)" } };
  return <div className="relative shrink-0" data-ga-menu="phone" data-studio-target="style:header|menus:categories|copy:Header" data-studio-label="Mobile navigation">
    <button ref={button} type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}
      className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
      <MenuIcon size={18} aria-hidden="true" /><span className="max-md:sr-only">{getCopy(design, "navMenu")}</span>
    </button>
    {open && typeof document !== "undefined" && createPortal(
      <div ref={panel} role="dialog" aria-modal="true" aria-label={getCopy(design, "navMenu")} data-fm-store=""
        className="fm-menu-panel fixed inset-0 z-[80] flex flex-col overflow-y-auto"
        style={{ backgroundColor: "var(--bg-color, var(--background))", color: "var(--text-color, var(--text))", fontFamily: "var(--body-font, inherit)" }}
        onKeyDown={e => {
          if (e.key === "Escape") return close();
          // Tab stays inside the open panel (it covers the page).
          if (e.key !== "Tab") return;
          const stops = [...(panel.current?.querySelectorAll<HTMLElement>("a[href], button, select") || [])];
          const [first, last] = [stops[0], stops[stops.length - 1]];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }}>
        <style>{PANEL_CSS}</style>
        <div className="flex min-h-16 items-center justify-between gap-4 border-b border-current/15 pl-6 pr-3">
          <span className="min-w-0 truncate text-sm font-semibold uppercase tracking-[0.2em]" style={{ fontFamily: "var(--heading-font, inherit)" }}>{getCopy(design, "siteName")}</span>
          <button type="button" onClick={close} aria-label={getCopy(design, "navMenuClose")} className="inline-flex h-11 w-11 items-center justify-center hover:opacity-70">
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label={getCopy(design, "ariaMainNavigation")} className="fm-menu-panel-links flex flex-1 flex-col py-4 [&_button]:font-[inherit] [&_button]:opacity-80">
          {links(close, big)}
        </nav>
      </div>, document.body)}
  </div>;
}

/** Where a bar item goes: its page, its category's listing, or the Shop link's own address. */
const itemPath = (item: NavItem, slug: (s: string) => string) =>
  item.kind === "page" ? `/page/${item.page.slug}` : item.kind === "link" ? item.to : `/collections/${slug(item.label)}`;

/** Style › Header layout › "Social media icons in the phone menu": the shop's accounts as a row at the menu's foot. */
function MenuSocial({ design, links }: { design: any; links: SocialLink[] }) {
  return <SocialIconRow design={design} links={links} className="fm-menu-social mt-2 flex flex-wrap items-center gap-1 border-t border-current/20 px-4 pt-3" />;
}

function SocialIconRow({ design, links, className }: { design: any; links: SocialLink[]; className: string }) {
  const label = (name: string) => String(getCopy(design, "footerSocialAria") ?? "").replace("{network}", name) || name;
  return <div className={className} data-studio-target="style:header" data-studio-label="Phone menu social icons">
    {links.map((l) => <a key={l.key} href={l.url} target="_blank" rel="noopener noreferrer me" aria-label={label(l.name)} title={l.name} data-social={l.key}
      className="inline-flex h-11 w-11 items-center justify-center opacity-75 transition-opacity hover:opacity-100">
      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d={l.path} /></svg>
    </a>)}
  </div>;
}

/** "tabs" (a sideways-scrolling row of links) unless Studio picked the drop-down "menu" or the "icon" menu button
 *  that sits in the header row beside the shop's name (one row on phones: menu, name, search, bag). */
export const mobileNavStyle = (d: any): "tabs" | "menu" | "icon" => (d?.mobileNavStyle === "menu" ? "menu" : d?.mobileNavStyle === "icon" ? "icon" : "tabs");

/** True when phones get the menu button inside the header row (Style › Header layout › "Phone navigation style"). */
export const phoneMenuInHeader = (d: any): boolean => d?.showMobileNavigation !== false && mobileNavStyle(d) === "icon";

/** The phone-only menu button for the header row; computers keep their own links. */
export function PhoneHeaderMenu(props: { design: any; pages: any[]; onSearch: () => void; showThemeToggle?: boolean }) {
  return <div className="flex shrink-0 md:hidden"><MobileStorefrontNav {...props} everywhere /></div>;
}

function MobileNavTabs({ design, d, groups, bookings, showThemeToggle, pathname, slug, social }: { design: any; d: any; groups: ReturnType<typeof splitNavigation>; bookings: boolean; showThemeToggle: boolean; pathname: string; slug: (s: string) => string; social: SocialLink[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  // A category with sub-categories opens a drop-down (All + each sub-category), like the desktop header.
  const tabs: { key: string; to: string; label: string; children?: { key: string; to: string; label: string }[] }[] = [];
  for (const item of withShopLink(groups.primary, d, getCopy(design, "navShopLabel"))) {
    if (item.kind === "page") { tabs.push({ key: item.key, to: `/page/${item.page.slug}`, label: item.label }); continue; }
    const children = item.children.filter(c => c.showInNav !== false).map(c => ({ key: `cat:${c.id}`, to: `/collections/${slug(c.name)}`, label: c.name }));
    tabs.push({ key: item.key, to: itemPath(item, slug), label: item.label, children: children.length ? children : undefined });
  }
  const secondary: typeof tabs = [];
  if (d.showSecondaryNavigation !== false) for (const item of groups.secondary) if (item.kind === "page") secondary.push({ key: item.key, to: `/page/${item.page.slug}`, label: item.label });
  const events = useEventsLive();
  const classes = useClassesLive();
  const giving = useGivingLive();
  const extras: typeof tabs = [];
  if (bookingsLinkShown(bookings, d)) extras.push({ key: "bookings", to: "/book", label: getCopy(design, "bookTimeNavLink") });
  if (eventsLinkShown(events, d)) extras.push({ key: "events", to: "/events", label: getCopy(design, "eventsNavLink") });
  if (classesLinkShown(classes, d)) extras.push({ key: "classes", to: "/classes", label: getCopy(design, "classesNavLink") });
  if (supportLinkShown(giving, d)) extras.push({ key: "support", to: "/support", label: getCopy(design, "supportNavLink") });
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
      {social.length > 0 && <SocialIconRow design={design} links={social} className="fm-menu-social flex shrink-0 items-center" />}
    </div>
  </nav>;
}
