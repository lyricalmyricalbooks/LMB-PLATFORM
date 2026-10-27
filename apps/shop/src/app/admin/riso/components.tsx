import {
  Fragment, createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from "react";
import {
  AlertTriangle, BookOpen, Check, ChevronDown, ChevronRight, CircleDashed, CreditCard, Gift, Globe, Hourglass, Inbox, LayoutGrid, Lock,
  Minus, Package, Percent, RotateCw, Search, Tag, Truck, Waves, X,
} from "lucide-react";
import "./riso.css";
import { useFocusTrap } from "../../lib/useFocusTrap";
export { useFocusTrap };

const cx = (...p: Array<string | false | null | undefined>) => p.filter(Boolean).join(" ");

/* ── Shell ───────────────────────────────────────────────────────────── */

export function AppShell({ appearance = "light", sidebar, topbar, children, mainId = "rp-main", overlay }: {
  appearance?: "light" | "dark";
  sidebar: ReactNode; topbar: ReactNode; children: ReactNode; mainId?: string;
  /** Fixed-position app-level UI (e.g. SyncChip) that must inherit the shell tokens. */ overlay?: ReactNode;
}) {
  return (
    <div className="rp" data-rp-appearance={appearance}>
      <a className="rp-skip-link" href={`#${mainId}`}>Skip to content</a>
      <div className="rp-app">
        {sidebar}
        <div className="rp-app-body">
          {topbar}
          <main id={mainId} tabIndex={-1} className="rp-workspace">
            <div className="rp-workspace-inner">{children}</div>
          </main>
        </div>
      </div>
      {overlay}
    </div>
  );
}

export type NavEntry = {
  id: string; label: string; icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  children?: Array<{ id: string; label: string; icon?: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }> }>;
  /** A small group heading shown above this item (e.g. "Settings"). */
  section?: string;
  /** Count of things waiting on this page (e.g. orders to ship); hidden at 0. */
  badge?: number;
  /** The parent page a flattened child item belongs to (e.g. "settings"); phones lay these out as a grid of short links. */
  group?: string;
};

export function Sidebar({ brand, top, items, activeId, activeChildId, onSelect, onSelectChild, open, onClose, footer }: {
  brand: ReactNode; top?: ReactNode; items: NavEntry[]; activeId: string | null; activeChildId?: string;
  onSelect: (id: string) => void; onSelectChild: (parentId: string, childId: string) => void;
  open: boolean; onClose: () => void; footer: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useFocusTrap(ref, open && typeof window !== "undefined" && window.matchMedia?.("(max-width: 1023px)").matches, onClose);
  return (
    <>
      {open && <div className="rp-scrim" onClick={onClose} aria-hidden="true" />}
      <aside ref={ref} className="rp-sidebar" data-open={open} aria-label="Admin sidebar">
        <div className="rp-sidebar-brand">
          {brand}
          {/* The rail is a drawer on phones and tablets; it closes from here as well as from the scrim and Escape. */}
          <button type="button" className="rp-icon-btn rp-drawer-close" aria-label="Close menu" onClick={onClose}><X size={20} aria-hidden /></button>
        </div>
        {top}
        <nav className="rp-nav" aria-label="Primary">
          <ul className="rp-nav-list">
            {items.map((item) => {
              const active = activeId === item.id;
              const Icon = item.icon;
              return (
                <Fragment key={item.id}>
                {item.section && <li className="rp-nav-section-row" aria-hidden="true"><div className="rp-nav-section">{item.section}</div></li>}
                <li data-group={item.group}>
                  <button
                    type="button" className="rp-nav-item" data-nav={item.id}
                    aria-current={active ? "page" : undefined}
                    aria-expanded={item.children ? active : undefined}
                    onClick={() => onSelect(item.id)}
                  >
                    <Icon size={18} aria-hidden />
                    {item.label}
                    {!!item.badge && (
                      <span className="rp-nav-badge" aria-label={`${item.badge} need attention`}>{item.badge > 99 ? "99+" : item.badge}</span>
                    )}
                    {item.children && <ChevronRight size={14} className="rp-nav-chevron" aria-hidden />}
                  </button>
                  {item.children && active && (
                    <ul className="rp-nav-sublist" aria-label={`${item.label} sections`}>
                      {item.children.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button" className="rp-nav-subitem"
                            aria-current={activeChildId === c.id ? "page" : undefined}
                            onClick={() => onSelectChild(item.id, c.id)}
                          >{c.label}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
                </Fragment>
              );
            })}
          </ul>
        </nav>
        <div className="rp-sidebar-foot">{footer}</div>
      </aside>
    </>
  );
}

export function Topbar({ children }: { children: ReactNode }) {
  return <header className="rp-topbar">{children}</header>;
}

export function Breadcrumbs({ trail }: { trail: Array<{ label: string; onClick?: () => void }> }) {
  return (
    <nav className="rp-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={`${c.label}-${i}`} style={{ display: "contents" }}>
              {last || !c.onClick
                ? <span aria-current={last ? "page" : undefined}>{c.label}</span>
                : <button type="button" onClick={c.onClick}>{c.label}</button>}
              {!last && <ChevronRight size={12} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, description, breadcrumbs, actions }: {
  title: string; description?: string; breadcrumbs?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="rp-page-header">
      <div>
        {breadcrumbs}
        <h1 className="rp-page-title">{title}</h1>
        {description && <p className="rp-page-desc">{description}</p>}
      </div>
      {actions && <div className="rp-page-actions">{actions}</div>}
    </div>
  );
}

/* ── Cards ───────────────────────────────────────────────────────────── */

const FOLD_KEY = "lm:card-folded:";
function readFolded(key: string): boolean {
  try { return localStorage.getItem(FOLD_KEY + key) === "1"; } catch { return false; }
}
function writeFolded(key: string, folded: boolean) {
  try { folded ? localStorage.setItem(FOLD_KEY + key, "1") : localStorage.removeItem(FOLD_KEY + key); } catch { /* storage blocked */ }
}

/**
 * Inside an Overview board widget the widget's own bar carries the title and the fold button, so cards there
 * keep only their description and actions (see OverviewBoard.tsx).
 */
export const CardInWidget = createContext(false);

/**
 * A page that draws its own masthead (the Overview) shows the admin alerts under it, as every other page does
 * under its PageHeader: the shell hands the alerts down through this slot instead of drawing them above the page.
 */
export const PageAlertsSlot = createContext<ReactNode>(null);

/**
 * A titled card. Cards with a title can be folded down to just their heading (chevron button); the choice is
 * remembered per browser by `foldKey` (default: the title). Pass `collapsible={false}` to keep a card always open.
 */
export function SectionCard({ title, description, actions, children, bodyClassName, flush, collapsible, foldKey, ...rest }: {
  title?: string; description?: string; actions?: ReactNode; children: ReactNode; bodyClassName?: string; flush?: boolean;
  collapsible?: boolean; foldKey?: string;
  "data-print"?: "hide";
}) {
  const inWidget = useContext(CardInWidget);
  const canFold = !inWidget && collapsible !== false && !!title;
  const key = foldKey || title || "";
  const [folded, setFolded] = useState(() => canFold && readFolded(key));
  const bodyId = useId();
  const toggle = () => setFolded(f => { writeFolded(key, !f); return !f; });
  const isFolded = canFold && folded;
  return (
    <section className="rp-card" data-folded={isFolded || undefined} {...rest}>
      {((title && (!inWidget || description)) || actions) && (
        <div className="rp-card-head" style={isFolded ? { borderBottom: 0 } : undefined}>
          <div className="rp-card-heading">
            {title && !inWidget && <h2 className="rp-card-title" onClick={canFold ? toggle : undefined} style={canFold ? { cursor: "pointer" } : undefined}>{title}</h2>}
            {description && <p className="rp-card-desc">{description}</p>}
          </div>
          {!isFolded && actions}
          {canFold && (
            <button type="button" className="rp-card-fold" aria-expanded={!isFolded} aria-controls={bodyId}
              aria-label={`${isFolded ? "Expand" : "Collapse"} ${title}`} title={isFolded ? "Expand" : "Collapse"} onClick={toggle}>
              <ChevronDown size={18} aria-hidden style={{ transform: isFolded ? "rotate(-90deg)" : "none", transition: "transform .15s" }} />
            </button>
          )}
        </div>
      )}
      <div id={bodyId} hidden={isFolded} className={flush ? bodyClassName : cx("rp-card-body", bodyClassName)}>{children}</div>
    </section>
  );
}

export function MetricCard({ label, value, footer, tone }: { label: string; value: ReactNode; footer?: ReactNode; tone?: "gold" | "warn" | "danger" }) {
  return (
    <div className="rp-card rp-metric">
      <div className="rp-metric-label">{label}</div>
      <div className="rp-metric-value" data-tone={tone}>{value}</div>
      {footer && <div className="rp-metric-foot">{footer}</div>}
    </div>
  );
}

/* ── Buttons ─────────────────────────────────────────────────────────── */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "sm" | "md" | "lg"; icon?: ReactNode;
  /** Work in progress: the button is disabled, says so to screen readers and shows a small spinner in place of its icon. */
  busy?: boolean;
};
function makeButton(variant: string) {
  return function RisoButton({ size = "md", icon, className, children, type = "button", busy, disabled, ...rest }: BtnProps) {
    return (
      <button type={type} className={cx("rp-btn", `rp-btn-${variant}`, size === "sm" && "rp-btn-sm", size === "lg" && "rp-btn-lg", className)}
        disabled={disabled || busy || undefined} aria-busy={busy || rest["aria-busy"] || undefined} {...rest}>
        {busy ? <span className="rp-btn-spinner" aria-hidden="true" /> : icon}{children}
      </button>
    );
  };
}
export const PrimaryButton = makeButton("primary");
export const SecondaryButton = makeButton("secondary");
export const GhostButton = makeButton("ghost");
export const InkButton = makeButton("ink");
export const OutlineButton = makeButton("gold-outline");
export const DestructiveButton = makeButton("danger");
export const ConfirmButton = makeButton("success");

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: "danger" | "success" }>(
  function IconButton({ label, tone, className, children, type = "button", ...rest }, ref) {
    return (
      <button ref={ref} type={type} aria-label={label} title={label} data-tone={tone} className={cx("rp-icon-btn", className)} {...rest}>
        {children}
      </button>
    );
  });

/* ── Fields ──────────────────────────────────────────────────────────── */

type FieldWrap = { label: string; hint?: string; error?: string; hideLabel?: boolean };

function Field({ id, label, hint, error, hideLabel, children }: FieldWrap & { id: string; children: ReactNode }) {
  return (
    <div className="rp-field">
      <label htmlFor={id} className={hideLabel ? "rp-sr-only" : "rp-label"}>{label}</label>
      {children}
      {hint && !error && <span id={`${id}-hint`} className="rp-hint">{hint}</span>}
      {error && <span id={`${id}-err`} role="alert" className="rp-error-text">{error}</span>}
    </div>
  );
}
const describe = (id: string, hint?: string, error?: string) =>
  error ? `${id}-err` : hint ? `${id}-hint` : undefined;

export function TextField({ label, hint, error, hideLabel, className, ...rest }: FieldWrap & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <input id={id} className={cx("rp-input", className)} aria-invalid={!!error || undefined}
        aria-describedby={describe(id, hint, error)} {...rest} />
    </Field>
  );
}

export function TextArea({ label, hint, error, hideLabel, className, ...rest }: FieldWrap & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <textarea id={id} className={cx("rp-textarea", className)} aria-invalid={!!error || undefined}
        aria-describedby={describe(id, hint, error)} {...rest} />
    </Field>
  );
}

export function SelectField({ label, hint, error, hideLabel, className, children, ...rest }: FieldWrap & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <select id={id} className={cx("rp-select", className)} aria-invalid={!!error || undefined}
        aria-describedby={describe(id, hint, error)} {...rest}>{children}</select>
    </Field>
  );
}

export function SearchField({ label, className, ...rest }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={cx("rp-search", className)}>
      <label htmlFor={id} className="rp-sr-only">{label}</label>
      <Search size={16} className="rp-search-icon" aria-hidden />
      <input id={id} type="search" className="rp-input" {...rest} />
    </div>
  );
}

export function Toggle({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className="rp-toggle">
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
        className="rp-toggle-track" onClick={() => onChange(!checked)} />
      <span aria-hidden="true">{label}</span>
    </label>
  );
}

export function Checkbox({ label, ...rest }: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="rp-check"><input type="checkbox" {...rest} />{label}</label>
  );
}

export type BadgeTone = "neutral" | "primary" | "info" | "success" | "warning" | "danger";
// Status never relies on colour alone: every badge carries a glyph AND a word.
const BADGE_GLYPH: Record<BadgeTone, string> = { neutral: "○", primary: "●", info: "●", success: "✓", warning: "⚠", danger: "✕" };
/**
 * A status pill: glyph + word. `glyph` replaces the tone's glyph with your own (e.g. "▲"), or `false` drops it when the
 * words already carry their own mark (so nothing shows two glyphs). Default unchanged: the tone's glyph.
 */
export function StatusBadge({ tone = "neutral", glyph, children }: { tone?: BadgeTone; glyph?: string | false; children: ReactNode }) {
  const mark = glyph === false ? null : glyph ?? BADGE_GLYPH[tone];
  return <span className="rp-badge" data-tone={tone}>{mark ? <span aria-hidden="true">{mark}</span> : null}{children}</span>;
}

/* ── Data ────────────────────────────────────────────────────────────── */

export type Column<T> = { key: string; header: string; numeric?: boolean; lead?: boolean; render: (row: T) => ReactNode };
export type RowState = "pending" | "failed" | "conflict";

export function DataTable<T>({ columns, rows, rowKey, caption, empty, rowState, sticky, onRowClick, rowProps, stackOnPhone }: {
  columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; caption: string; empty?: ReactNode;
  rowState?: (r: T) => RowState | undefined; sticky?: boolean;
  /** On phones (≤767px) draw each row as a small card, every cell under its column name, instead of a
   *  table that scrolls sideways. Off by default: the table scrolls inside its own box. */
  stackOnPhone?: boolean;
  /** Pointer shortcut: clicking anywhere on a row (outside its own links/buttons). Keep a keyboard
   *  control for the same action inside the row, e.g. a button in the lead cell. */
  onRowClick?: (r: T) => void;
  /** Extra attributes for a row's <tr> (e.g. drag-and-drop handlers). */
  rowProps?: (r: T) => React.HTMLAttributes<HTMLTableRowElement> | undefined;
}) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className="rp-table-wrap" data-sticky={sticky || undefined} data-stack={stackOnPhone ? "phone" : undefined} tabIndex={0} role="region" aria-label={caption}>
      <table className="rp-table">
        <caption className="rp-sr-only">{caption}</caption>
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.numeric ? "rp-num" : undefined}>{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} {...rowProps?.(r)} data-row-state={rowState?.(r)} style={onRowClick ? { cursor: "pointer" } : rowProps?.(r)?.style}
              tabIndex={onRowClick ? 0 : undefined}
              data-clickable={onRowClick ? "true" : undefined}
              onKeyDown={onRowClick ? (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onRowClick(r); } } : undefined}
              onClick={onRowClick ? (e) => { if (!(e.target as HTMLElement).closest?.("a,button,input,select,textarea,label")) onRowClick(r); } : undefined}>{columns.map((c) => <td key={c.key} data-label={c.header || undefined} className={cx(c.numeric && "rp-num", c.lead && "rp-lead")}>{c.render(r)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="rp-filter-bar" role="search">{children}</div>;
}

export function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  return (
    <nav className="rp-pagination" aria-label="Pagination">
      <span aria-live="polite">Page {page} of {Math.max(pageCount, 1)}</span>
      <span style={{ display: "flex", gap: 8 }}>
        <SecondaryButton size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</SecondaryButton>
        <SecondaryButton size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</SecondaryButton>
      </span>
    </nav>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label, idPrefix = "", variant }: {
  /** `unsaved` marks a sub tab holding edits that aren't saved yet (a dot, read out as "unsaved changes"). */
  tabs: Array<{ id: T; label: string; count?: number; unsaved?: boolean }>; value: T; onChange: (id: NoInfer<T>) => void; label: string;
  /** Keeps button ids unique when two tab rows on one page share a tab id (the Overview's "all"). */
  idPrefix?: string;
  /** "page" draws a plain underlined row for a page's own sections; filter rows keep the boxed look. */
  variant?: "page";
}) {
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    requestAnimationFrame(() => document.getElementById(`rp-tab-${idPrefix}${next.id}`)?.focus());
  };
  return (
    <div className="rp-tabs" data-variant={variant} role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.id} id={`rp-tab-${idPrefix}${t.id}`} type="button" role="tab" className="rp-tab"
          aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>
          {t.label}{t.count !== undefined && <span className="rp-tab-count">{t.count}</span>}
          {t.unsaved && <><span aria-hidden="true" style={{ color: "var(--rp-warning)" }}>●</span><span className="rp-sr-only">(unsaved changes)</span></>}
        </button>
      ))}
    </div>
  );
}

/**
 * The content of one sub tab, labelled by its `Tabs` button (`tabId` = that tab's id). Hidden tabs stay mounted, so
 * edits typed on one sub tab survive switching to another.
 */
export function TabPanel({ tabId, active, children }: { tabId: string; active: boolean; children: ReactNode }) {
  return <div role="tabpanel" id={`rp-panel-${tabId}`} aria-labelledby={`rp-tab-${tabId}`} hidden={!active}>{children}</div>;
}

/* ── Overlays ────────────────────────────────────────────────────────── */

export function Dialog({ open, onClose, title, description, footer, footerStart, badge, children, size, variant = "dialog", appearance }: {
  open: boolean; onClose: () => void; title: string; description?: string; footer?: ReactNode;
  /** A destructive action, alone on the far left of the footer. */ footerStart?: ReactNode; badge?: string;
  children: ReactNode; size?: "md" | "lg"; variant?: "dialog" | "drawer"; appearance?: "light" | "dark";
}) {
  // `appearance` set = mounted outside an AppShell (owns its tokens); unset = inherits the shell's.
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, open, onClose);
  if (!open) return null;
  return (
    <div className={appearance ? "rp rp-dialog-root" : "rp-dialog-root"} data-variant={variant} data-rp-appearance={appearance} style={appearance ? { background: "transparent" } : undefined}>
      <div className="rp-dialog-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className="rp-dialog" data-size={size} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="rp-dialog-head">
          <div>
            <h2 id={titleId} className="rp-dialog-title">{badge && <span className="rp-dialog-badge" aria-hidden="true">{badge}</span>}{title}</h2>
            {description && <p className="rp-card-desc">{description}</p>}
          </div>
          <IconButton label="Close dialog" onClick={onClose}><X size={18} aria-hidden /></IconButton>
        </div>
        <div className="rp-dialog-body">{children}</div>
        {(footer || footerStart) && <div className="rp-dialog-foot">{footerStart && <span className="rp-foot-start">{footerStart}</span>}{footer}</div>}
      </div>
    </div>
  );
}

export const Drawer = (p: Omit<Parameters<typeof Dialog>[0], "variant">) => <Dialog {...p} variant="drawer" />;

/** Compact confirm dialog for destructive actions. */
export function ConfirmDialog({ open, title, message, confirmLabel = "Delete", onConfirm, onCancel, appearance }: {
  open: boolean; title: string; message: string; confirmLabel?: string;
  onConfirm: () => void; onCancel: () => void; appearance?: "light" | "dark";
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} appearance={appearance}
      footer={<>
        <SecondaryButton data-autofocus onClick={onCancel}>Cancel</SecondaryButton>
        <DestructiveButton onClick={onConfirm}>{confirmLabel}</DestructiveButton>
      </>}>
      <p className="rp-card-desc" style={{ margin: 0, fontSize: "var(--rp-text-base)" }}>{message}</p>
    </Dialog>
  );
}

/* ── Toast (uses a polite live region; auto-dismiss, optional Undo) ──── */

type ToastOpts = { actionLabel?: string; onAction?: () => void; tone?: "ok" | "warn" | "err" };
type ToastItem = { id: number; message: string } & ToastOpts;
const ToastCtx = createContext<(m: string, o?: ToastOpts) => void>(() => {});
export const useRisoToast = () => useContext(ToastCtx);

/** Milliseconds a message stays: longer with an Undo button, longest for problems (they are the ones people need to read). */
export const toastLifetime = (o?: ToastOpts) => (o?.tone === "err" || o?.tone === "warn" ? 10000 : o?.onAction ? 8000 : 4000);
const MAX_TOASTS = 4;

function ToastCard({ t, onClose }: { t: ToastItem; onClose: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(onClose, toastLifetime(t));
  }, [onClose, t]);
  const stop = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  useEffect(() => { start(); return stop; }, [start, stop]);
  return (
    <div className="rp-toast" data-tone={t.tone} onMouseEnter={stop} onMouseLeave={start} onFocus={stop} onBlur={start}>
      <span className="rp-toast-text">{t.message}</span>
      {t.onAction && (
        <SecondaryButton size="sm" style={{ color: "inherit", borderColor: "currentColor" }}
          onClick={() => { t.onAction?.(); onClose(); }}>
          {t.actionLabel || "Undo"}
        </SecondaryButton>
      )}
      <button type="button" className="rp-toast-x" aria-label="Dismiss message" onClick={onClose}><X size={16} aria-hidden /></button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, o?: ToastOpts) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, message, ...o }].slice(-MAX_TOASTS));
  }, []);
  const close = useCallback((id: number) => setItems((s) => s.filter((t) => t.id !== id)), []);
  const problems = items.filter((t) => t.tone === "err");
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="rp rp-toast-stack">
        <div className="rp-toasts" aria-live="polite" role="status">
          {items.filter((t) => t.tone !== "err").map((t) => <ToastCard key={t.id} t={t} onClose={() => close(t.id)} />)}
        </div>
        {/* Problems are announced at once, in their own region */}
        <div className="rp-toasts" aria-live="assertive" role="alert">
          {problems.map((t) => <ToastCard key={t.id} t={t} onClose={() => close(t.id)} />)}
        </div>
      </div>
    </ToastCtx.Provider>
  );
}

/* ── States ──────────────────────────────────────────────────────────── */

/** `inline`: the small version for inside a card or widget — no icon, about 80px tall, left-aligned. */
/** One line-icon set for every empty/error state: pages may pass a short glyph or emoji, which maps onto the matching icon. */
const STATE_ICONS: Record<string, typeof Inbox> = {
  "📭": Inbox, "⚠": AlertTriangle, "%": Percent, "🌍": Globe, "🎁": Gift, "🏷️": Tag, "🏷": Tag, "💳": CreditCard, "📚": BookOpen, "📦": Package,
  "🔒": Lock, "🚚": Truck, "⏳": Hourglass, "✓": Check, "◌": CircleDashed, "↻": RotateCw, "≈": Waves, "▦": LayoutGrid, "–": Minus,
};
function stateIcon(icon: ReactNode) {
  const Icon = typeof icon === "string" ? STATE_ICONS[icon] : undefined;
  return Icon ? <Icon size={24} strokeWidth={2} aria-hidden /> : icon;
}

export function EmptyState({ title, description, action, icon, inline }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode; inline?: boolean }) {
  if (inline) {
    return (
      <div className="rp-state" data-inline="" style={{ alignItems: "flex-start", textAlign: "left", gap: 6, padding: "16px 20px", minHeight: 0 }}>
        <p className="rp-state-title" style={{ fontSize: "var(--rp-text-base)", fontStyle: "normal", fontFamily: "var(--rp-font-body)", fontWeight: 700 }}>{title}</p>
        {description && <p className="rp-state-desc">{description}</p>}
        {action}
      </div>
    );
  }
  return (
    <div className="rp-state">
      <div className="rp-state-icon" aria-hidden="true">{stateIcon(icon || "📭")}</div>
      <h3 className="rp-state-title">{title}</h3>
      {description && <p className="rp-state-desc">{description}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="rp-state" role="status" aria-live="polite">
      <div className="rp-spinner" aria-hidden />
      <p className="rp-state-desc">{label}</p>
    </div>
  );
}

/** A page-shaped placeholder (title, a row of figures, a table) shown while a page opens, so the layout doesn't jump when content arrives. */
export function PageSkeleton({ label = "Opening page…" }: { label?: string }) {
  return (
    <div className="rp-page-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="rp-sr-only">{label}</span>
      <div aria-hidden className="rp-page-skeleton-body">
        <div className="rp-skeleton rp-page-skeleton-title" />
        <div className="rp-page-skeleton-figures">
          {[0, 1, 2, 3].map((i) => <div key={i} className="rp-skeleton rp-page-skeleton-figure" />)}
        </div>
        <div className="rp-page-skeleton-table">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="rp-skeleton rp-page-skeleton-row" />)}
        </div>
      </div>
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div className="rp-state" data-tone="danger" role="alert">
      <div className="rp-state-icon" aria-hidden="true">{stateIcon("⚠")}</div>
      <h3 className="rp-state-title">{title}</h3>
      {description && <p className="rp-state-desc">{description}</p>}
      {onRetry && <SecondaryButton onClick={onRetry}>Try again</SecondaryButton>}
    </div>
  );
}

export function SaveBar({ dirty, saving, onSave, onDiscard, message }: {
  dirty: boolean; saving?: boolean; onSave: () => void; onDiscard: () => void; message?: string;
}) {
  if (!dirty) return null;
  return (
    <div className="rp-savebar" role="region" aria-label="Unsaved changes">
      <span role="status">{message || "You have unsaved changes."}</span>
      <span style={{ display: "flex", gap: 8 }}>
        <SecondaryButton onClick={onDiscard} disabled={saving}>Discard</SecondaryButton>
        <PrimaryButton onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</PrimaryButton>
      </span>
    </div>
  );
}


/* ── SectionHead, TabBar, SyncChip ───────────────────────────────────── */

export function SectionHead({ kicker, title, subcopy, actions, tone }: {
  kicker?: string; title: string; subcopy?: string; actions?: ReactNode; tone?: "muted" | "danger";
}) {
  return (
    <div className="rp-sec-head" data-tone={tone}>
      <div>
        {kicker && <div className="rp-kicker">{kicker}</div>}
        <h2 className="rp-sec-title">{title}</h2>
        {subcopy && <p className="rp-page-desc" style={{ marginTop: 6 }}>{subcopy}</p>}
      </div>
      {actions && <div className="rp-page-actions">{actions}</div>}
    </div>
  );
}

export function TabBar<T extends string>({ tabs, value, onChange, label }: {
  tabs: Array<{ id: T; label: string }>; value: T; onChange: (id: T) => void; label: string;
}) {
  return (
    <div className="rp-tab-bar" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" className="rp-tab-btn" aria-selected={value === t.id}
          onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return online;
}

/** Shown only when there is something the user could not otherwise know. */
export function SyncChip({ state, onRetry, lastSync }: { state: "offline" | "failed" | "pending" | null; onRetry?: () => void; lastSync?: string }) {
  if (!state) return null;
  const copy = {
    offline: ["⚠", "You're offline", "Changes you make now aren't lost — we keep them on this device and retry when you're back online."],
    failed: ["✕", "Some changes didn't upload", "Nothing is lost — they're saved on this device and we keep retrying."],
    pending: ["↑", "Uploading changes", "Your latest changes are on their way to the cloud."],
  }[state];
  return (
    <div className="rp-sync-chip" data-state={state} role="status" aria-live="polite">
      <span className="rp-sync-ico" aria-hidden="true">{copy[0]}</span>
      <div>
        <div className="rp-sync-title">{copy[1]}</div>
        <div className="rp-sync-detail">{copy[2]}</div>
        {lastSync && <div className="rp-sync-meta">Last upload {lastSync}</div>}
      </div>
      {state === "failed" && onRetry && <PrimaryButton size="lg" onClick={onRetry}>Try again now</PrimaryButton>}
    </div>
  );
}

/* ── ActionMenu: keyboard-accessible overflow menu ───────────────────── */

export type MenuAction = { label: string; onSelect: () => void; tone?: "danger"; icon?: ReactNode };

export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { setOpen(false); btn.current?.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === "Tab") setOpen(false);
  };
  return (
    <div className="rp-menu-wrap" ref={wrap} onKeyDown={open ? onKey : undefined}>
      <IconButton ref={btn} label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span aria-hidden="true" style={{ fontWeight: 800, letterSpacing: 1 }}>⋯</span>
      </IconButton>
      {open && (
        <div className="rp-menu" role="menu" aria-label={label}>
          {actions.map(a => (
            <button key={a.label} type="button" role="menuitem" className="rp-menu-item" data-tone={a.tone}
              onClick={() => { setOpen(false); btn.current?.focus(); a.onSelect(); }}>
              {a.icon}{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Promise-based replacement for window.confirm: `if (!(await ask({...}))) return;` then render `node`. */
export function useConfirm() {
  const [state, setState] = useState<null | { title: string; message: string; confirmLabel?: string; resolve: (v: boolean) => void }>(null);
  // The question on screen. A new ask() answers the one it replaces with "no", so an earlier await never hangs.
  const pending = useRef<((v: boolean) => void) | null>(null);
  const ask = useCallback((opts: { title: string; message: string; confirmLabel?: string }) =>
    new Promise<boolean>((resolve) => {
      pending.current?.(false);
      pending.current = resolve;
      setState({ ...opts, resolve });
    }), []);
  const done = (v: boolean) => {
    const resolve = pending.current || state?.resolve;
    pending.current = null;
    resolve?.(v);
    setState(null);
  };
  const node = (
    <ConfirmDialog open={!!state} title={state?.title || ""} message={state?.message || ""} confirmLabel={state?.confirmLabel}
      onConfirm={() => done(true)} onCancel={() => done(false)} />
  );
  return [ask, node] as const;
}

/* ── usePrompt: Riso replacement for window.prompt (returns string | null) ── */
export function usePrompt() {
  const [state, setState] = useState<null | { title: string; label: string; value: string; confirmLabel?: string; resolve: (v: string | null) => void }>(null);
  const ask = useCallback((opts: { title: string; label: string; defaultValue?: string; confirmLabel?: string }) =>
    new Promise<string | null>((resolve) => setState({ title: opts.title, label: opts.label, value: opts.defaultValue || "", confirmLabel: opts.confirmLabel, resolve })), []);
  const done = (v: string | null) => { state?.resolve(v); setState(null); };
  const node = (
    <Dialog open={!!state} onClose={() => done(null)} title={state?.title || ""}
      footer={<>
        <SecondaryButton onClick={() => done(null)}>Cancel</SecondaryButton>
        <PrimaryButton onClick={() => done(state?.value ?? "")}>{state?.confirmLabel || "Save"}</PrimaryButton>
      </>}>
      <div className="rp-field">
        <label className="rp-label" htmlFor="rp-prompt-input">{state?.label}</label>
        <input id="rp-prompt-input" className="rp-input" data-autofocus value={state?.value || ""}
          onChange={(e) => setState((s) => (s ? { ...s, value: e.target.value } : s))}
          onKeyDown={(e) => { if (e.key === "Enter") done(state?.value ?? ""); }} />
      </div>
    </Dialog>
  );
  return [ask, node] as const;
}
