import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronDown } from "lucide-react";
import { resolveHref, isExternal, type MenuItem } from "../features/site/storeMenu";

// Top-level links inherit the header's text color (set by the theme), so the
// menu stays readable on both light and dark backgrounds. Dropdown/mega panels
// keep explicit white text on their dark surfaces unless Studio › Style › Navigation links ›
// Drop-down menus sets their colours (`headerMenuPanel*`; unset = the look below, unchanged).
const linkCls = "text-[10px] tracking-[0.2em] text-current opacity-50 hover:opacity-100 transition-opacity uppercase whitespace-nowrap";

function MenuLink({ item, className, copyKey, style }: { item: MenuItem; className?: string; copyKey?: string; style?: CSSProperties }) {
  const href = resolveHref(item);
  if (isExternal(item)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className ?? linkCls} style={style}>
        <span data-studio-copy={copyKey}>{item.label}</span>
      </a>
    );
  }
  return (
    <Link to={href} className={className ?? linkCls} style={style}>
      <span data-studio-copy={copyKey}>{item.label}</span>
    </Link>
  );
}

/** Studio overrides for the header-menu drop-down and mega-menu panels (empty when nothing is set). */
export function headerMenuPanelStyle(design: any): CSSProperties {
  const style: CSSProperties = {};
  if (design?.headerMenuPanelBg) style.backgroundColor = design.headerMenuPanelBg;
  if (design?.headerMenuPanelBorderColor) style.borderColor = design.headerMenuPanelBorderColor;
  const radius = design?.headerMenuPanelRadius;
  if (radius !== undefined && radius !== null && radius !== "" && Number.isFinite(Number(radius))) {
    style.borderRadius = `${Math.max(0, Math.min(32, Number(radius)))}px`;
  }
  return style;
}

/** Link colour inside the panels, when Studio sets one. */
function panelLinkStyle(design: any): CSSProperties | undefined {
  return design?.headerMenuPanelTextColor ? { color: design.headerMenuPanelTextColor } : undefined;
}

const PANEL_TARGET = { "data-studio-target": "menus:header|style:navlinks", "data-studio-label": "Header menu drop-down" };

/** The featured card's link: Studio's link picker can save a page path or a full web address. */
function FeaturedLink({ href, className, style, children }: { href: string; className: string; style?: CSSProperties; children: ReactNode }) {
  if (/^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style}>{children}</a>;
  return <Link to={href} className={className} style={style}>{children}</Link>;
}

/** Mega menu panel: child items become link-group columns (their own children are
 *  the group links), plus an optional featured image card on the right. */
function MegaMenuPanel({ item, design }: { item: MenuItem; design?: any }) {
  const groups = item.children || [];
  const linkStyle = panelLinkStyle(design);
  return (
    <div className="absolute right-0 top-full pt-3 z-50">
      <div {...PANEL_TARGET} style={headerMenuPanelStyle(design)} className="w-[min(760px,calc(100vw-3rem))] bg-black/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl">
        <div className="flex gap-10">
          <div
            className="flex-1 grid gap-8"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(4, groups.length))}, minmax(0, 1fr))` }}
          >
            {groups.map((group) => {
              const links = group.children || [];
              return (
                <div key={group.id} className="space-y-3">
                  <MenuLink
                    item={group}
                    style={linkStyle}
                    className="block text-[10px] tracking-[0.3em] font-bold text-white uppercase whitespace-nowrap hover:text-white/70 transition-colors"
                  />
                  {links.map((link) => (
                    <MenuLink
                      key={link.id}
                      item={link}
                      style={linkStyle}
                      className="block text-[10px] tracking-[0.2em] text-white/40 hover:text-white transition-colors uppercase whitespace-nowrap"
                    />
                  ))}
                </div>
              );
            })}
          </div>
          {item.featuredImage && (
            <FeaturedLink
              href={item.featuredLink || "/"}
              className="group relative w-56 flex-shrink-0 aspect-[4/5] rounded-2xl overflow-hidden border border-white/10"
              style={headerMenuPanelStyle({ headerMenuPanelBorderColor: design?.headerMenuPanelBorderColor, headerMenuPanelRadius: design?.headerMenuPanelRadius })}
            >
              <img
                src={item.featuredImage}
                alt={item.featuredTitle || ""}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              {item.featuredTitle && (
                <p className="absolute bottom-0 left-0 right-0 p-4 text-white text-[10px] font-bold tracking-[0.25em] uppercase">
                  {item.featuredTitle}
                </p>
              )}
            </FeaturedLink>
          )}
        </div>
      </div>
    </div>
  );
}

/** Header navigation built from an editor-defined menu, with hover dropdowns
 *  and optional full-width mega-menu panels. */
export function StoreMenu({ items, design }: { items: MenuItem[]; design?: any }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!items || items.length === 0) return null;

  return (
    <nav className="hidden lg:flex items-center gap-6">
      {items.map((item) => {
        const children = item.children || [];
        if (children.length === 0) {
          return <MenuLink key={item.id} item={item} />;
        }
        const isMega = item.mega === true;
        return (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => setOpenId(item.id)}
            onMouseLeave={() => setOpenId((cur) => (cur === item.id ? null : cur))}
          >
            <button className={`${linkCls} flex items-center gap-1`}>
              {item.label}
              <ChevronDown size={10} className="opacity-60" />
            </button>
            {openId === item.id && (
              isMega ? (
                <MegaMenuPanel item={item} design={design} />
              ) : (
                <div className="absolute left-0 top-full pt-3 z-50">
                  <div {...PANEL_TARGET} style={headerMenuPanelStyle(design)} className="min-w-[180px] bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl flex flex-col">
                    {children.map((child) => (
                      <MenuLink
                        key={child.id}
                        item={child}
                        style={panelLinkStyle(design)}
                        className="px-4 py-2.5 rounded-xl text-[10px] tracking-[0.2em] text-white/50 hover:text-white hover:bg-white/5 transition-colors uppercase whitespace-nowrap"
                      />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** Footer navigation: a heading column with its child links flattened. */
export function FooterMenu({ items, copyKeys = {} }: { items: MenuItem[]; copyKeys?: Record<string, string> }) {
  if (!items || items.length === 0) return null;
  return (
    <>
      {items.filter(item => !item.hidden).map((item) => (
        <div key={item.id}>
          <MenuLink item={item} copyKey={copyKeys[item.id]} className="block hover:text-white transition-colors" />
          {item.children?.length ? <div className="pl-3 mt-3 space-y-3"><FooterMenu items={item.children} /></div> : null}
        </div>
      ))}
    </>
  );
}
