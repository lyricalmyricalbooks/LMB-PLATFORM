import { ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { getCopy } from "./storeCopy";
import { navActiveColor } from "./headerNav";
import { elementScheme } from "./colorSchemes";

export type NavDropdownEntry = { key: string; label: string; active?: boolean; to?: string; onSelect?: () => void };

/**
 * Click on an entry that is both a link and an in-page pick (the shop's categories): a plain click picks the
 * category in place; Ctrl/⌘/Shift/middle click and crawlers follow the `/collections/<slug>` address.
 */
export function selectInPlace(e: ReactMouseEvent, entry: NavDropdownEntry) {
  if (!entry.onSelect) return;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  entry.onSelect();
}

const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

/** First non-empty computed value of `prop` on the element or its closest ancestor that sets it. */
function resolved(el: Element, prop: string): string {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const v = window.getComputedStyle(n).getPropertyValue(prop).trim();
    if (v && v !== "inherit") return v;
  }
  return "";
}

/** What the header gives its links that a body portal would lose: font family/size/weight and `--nav-fit`. */
/** Colour variables a header colour scheme sets on the header (colorSchemes.schemeVars). */
const SCHEME_VARS = ["--bg-color", "--text-color", "--border-color", "--link-color", "--accent", "--on-accent", "--muted", "--surface", "--fg-rgb", "--border-rgb", "--accent-rgb", "--muted-rgb", "--surface-rgb"];

export function headerInheritance(el: Element, schemeColours = false): CSSProperties {
  const style: Record<string, string> = {};
  // While the header follows a colour scheme (Theme settings › Colour schemes › Header), the panel takes its colours too.
  if (schemeColours) for (const name of SCHEME_VARS) { const v = resolved(el, name); if (v) style[name] = v; }
  const fit = resolved(el, "--nav-fit");
  if (fit) style["--nav-fit"] = fit;
  const family = resolved(el, "font-family");
  if (family) style.fontFamily = family;
  const size = resolved(el, "font-size");
  if (size) style.fontSize = size;
  const weight = resolved(el, "font-weight");
  if (weight) style.fontWeight = weight;
  return style as CSSProperties;
}

/**
 * A header category that has sub-categories (Studio › Menus › Shop categories › "Sits under").
 * Opens on hover or click and lists "All" (the parent itself) then each sub-category.
 * Colours are Studio › Style › Navigation links controls (drop-down background / border).
 * The panel is `position: fixed` so the scrollable category bar can't clip it, and it is rendered in
 * a portal on <body>: the sticky header's backdrop-filter makes the header the containing block for
 * fixed children, which pushed the panel down by the header's own offset. The panel carries
 * `data-fm-store` (like the bag drawer) so the storefront theme variables still reach it.
 */
export function NavDropdown({ design, copyDesign, label, linkStyle, className, all, entries, studioTarget = true }: {
  design: any;
  /** Design holding Text & labels (defaults to `design`). */
  copyDesign?: any;
  label: ReactNode;
  linkStyle: CSSProperties;
  className?: string;
  /** The parent category itself ("All"). */
  all: NavDropdownEntry;
  entries: NavDropdownEntry[];
  studioTarget?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // The panel lives on <body>, outside the navigation header element, so it no longer inherits the
  // header's font (Studio › Typography › Header & menu font) or `--nav-fit` (shrink to fit). Copy them from the button.
  const [inherited, setInherited] = useState<CSSProperties>({});
  // Google Analytics names menu clicks by the region they sit in (lib/ga4Nav.ts, `data-ga-menu`); the panel is drawn
  // outside it, so it carries the name of the bar its button is in.
  const [gaMenu, setGaMenu] = useState<string | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const hoverOpenedAt = useRef(0);

  const headerScheme = elementScheme(design, "header");
  const items = design?.navDropdownHideAll ? entries : [{ ...all, label: getCopy(copyDesign ?? design, "navDropdownAll") }, ...entries];
  const studioHooks = studioTarget ? { "data-studio-target": "menus:categories|style:navlinks", "data-studio-label": "Category drop-down" } : {};

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 10, left: Math.max(8, r.left - 12) });
    if (btnRef.current) setInherited(headerInheritance(btnRef.current, Boolean(headerScheme)));
    setGaMenu(wrapRef.current?.closest("[data-ga-menu]")?.getAttribute("data-ga-menu") || undefined);
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  }, [open]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const hoverOpen = () => {
    window.clearTimeout(closeTimer.current);
    if (!open) hoverOpenedAt.current = Date.now();
    setOpen(true);
  };
  // A click right after the hover opened it (mouse users) keeps it open instead of toggling shut.
  const clickToggle = () => setOpen((o) => !o || Date.now() - hoverOpenedAt.current < 600);
  const hoverClose = () => { closeTimer.current = window.setTimeout(() => setOpen(false), 150); };
  const focusFirst = () => window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>("a,button")?.focus(), 0);
  // Focus leaving both the button and the panel (Tab away, Shift+Tab back out) closes the panel. A null
  // relatedTarget (mouse press on a non-focusable spot, Safari) is left to the outside-press handler.
  const onFocusOut = (e: ReactFocusEvent<HTMLElement>) => {
    const to = e.relatedTarget as Node | null;
    if (to && !btnRef.current?.contains(to) && !panelRef.current?.contains(to)) setOpen(false);
  };
  const pick = (entry: NavDropdownEntry) => { setOpen(false); entry.onSelect?.(); };
  const follow = (e: ReactMouseEvent, entry: NavDropdownEntry) => { setOpen(false); selectInPlace(e, entry); };

  // The portal sits at the end of <body>, so keyboard order is kept as if the panel followed the
  // button: arrows move between items; Tab / Shift+Tab close it and continue from the button.
  const panelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const links = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a,button") || []);
    const at = links.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!links.length) return;
      const next = e.key === "ArrowDown" ? (at + 1) % links.length : (at - 1 + links.length) % links.length;
      links[next]?.focus();
    } else if (e.key === "Tab") {
      const btn = btnRef.current;
      if (!btn) return;
      e.preventDefault();
      setOpen(false);
      if (e.shiftKey) { btn.focus(); return; }
      const order = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !panelRef.current?.contains(el));
      (order[order.indexOf(btn) + 1] || btn).focus();
    }
  };

  const borderColor = design?.navDropdownBorderColor || (headerScheme ? "var(--border-color)" : design?.borderColor) || "rgba(var(--border-rgb, 177, 177, 170), 1)";
  const panelStyle: CSSProperties = {
    position: "fixed",
    top: pos?.top ?? 0,
    left: pos?.left ?? 0,
    zIndex: 70,
    minWidth: 180,
    ...inherited,
    backgroundColor: design?.navDropdownBg || (headerScheme ? "var(--bg-color)" : design?.headerBg) || design?.backgroundColor || "var(--background)",
    // data-fm-store brings the theme variables, not the page's print-grain backdrop.
    backgroundImage: "none",
    border: `${Math.max(0, Math.min(8, Number(design?.navDropdownBorderWidth ?? 4)))}px solid ${borderColor}`,
    padding: "10px 0",
  };
  const itemStyle = (active?: boolean): CSSProperties => ({
    ...linkStyle,
    color: active ? navActiveColor(design) : design?.navDropdownTextColor || linkStyle.color,
    textTransform: (design?.navDropdownTransform || linkStyle.textTransform) as CSSProperties["textTransform"],
    opacity: active ? 1 : Math.max(0.1, Math.min(1, Number(design?.navLinkOpacity ?? 0.6)) + 0.25),
    display: "block",
    padding: "10px 24px",
    textAlign: "left",
    width: "100%",
  });

  return (
    <div ref={wrapRef} className="relative shrink-0" onMouseEnter={hoverOpen} onMouseLeave={hoverClose} {...studioHooks}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={clickToggle}
        onBlur={onFocusOut}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); focusFirst(); }
          // The panel is at the end of <body>: when it is open, Tab from the button goes into it.
          else if (e.key === "Tab" && !e.shiftKey && open && panelRef.current) { e.preventDefault(); focusFirst(); }
        }}
        style={linkStyle}
        className={`inline-flex items-center gap-1.5 ${className || ""}`}
      >
        {label}
        {/* em-sized so it follows the link size (which may be a calc() when the bar shrinks to fit) */}
        <ChevronDown size="1.2em" strokeWidth={3} aria-hidden="true"
          style={{ transition: "transform .15s", transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {/* Closed, the panel isn't drawn; its addresses stay in the page (hidden, out of the tab order) so search
          engines reach every collection page from the header. */}
      {!open && items.some((entry) => entry.to) && (
        <span hidden data-nav-dropdown-links>
          {items.filter((entry) => entry.to).map((entry) => <Link key={entry.key} to={entry.to!} tabIndex={-1}>{entry.label}</Link>)}
        </span>
      )}
      {open && pos && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} role="menu" data-fm-store data-nav-dropdown-panel data-ga-menu={gaMenu} style={panelStyle}
          onMouseEnter={hoverOpen} onMouseLeave={hoverClose} onKeyDown={panelKeyDown} onBlur={onFocusOut} {...studioHooks}>
          {items.map((entry) => entry.to ? (
            <Link key={entry.key} role="menuitem" to={entry.to} onClick={(e) => follow(e, entry)} style={itemStyle(entry.active)}
              aria-current={entry.active ? (entry.onSelect ? "true" : "page") : undefined} className="transition-all hover:!opacity-100 hover-text-accent">
              {entry.label}
            </Link>
          ) : (
            <button key={entry.key} role="menuitem" type="button" onClick={() => pick(entry)} style={itemStyle(entry.active)}
              aria-current={entry.active ? "true" : undefined} className="transition-all hover:!opacity-100 hover-text-accent">
              {entry.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
