import { useMemo, useState, type KeyboardEvent } from "react";
import { ADMIN_LOOKS, applyAdminLook, readAdminLook, type AdminLookId } from "../riso/adminLook";
import { ChevronLeft, ChevronRight, Monitor, Smartphone } from "lucide-react";
import {
  filterLooks, galleryThemes, isDarkLook, isTemplate, LOOK_FILTERS, lookPreview, pressNameOf, sampleProducts,
  type LibraryTheme, type LookFilter, type PreviewProduct,
} from "../lookGallery";
import type { WelcomeDone } from "../firstWeek";
import { friendlyError } from "../studio/friendlyError";
import { Dialog, GhostButton, LoadingState, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, Tabs } from "../riso/components";
import { sellsBooks } from "../sells";
import { LookStage, ScaledStage, STAGE_WIDTH, type StageDevice, type StagePage } from "./LookStage";

/**
 * Choose your look (plan 6.3): the welcome before the setup guide, shown once, and setup mode's Design page. Laid out
 * like a theme store: the suggested looks large, then every look with filters, each card a picture of a whole shop
 * page in that look. Try it on opens the look full screen (LookStage) on a desktop or a phone, on the home page or a
 * product page, with the press's own products or sample ones, and flips through the looks with the arrows.
 * `settings` is settings/website as the Overview read it: undefined while it loads, null when it couldn't be read.
 * `onDone` gets what to record once the look is in the draft; the parent saves it (and puts the welcome away).
 */
export function ChooseLookWelcome({ publishes, books = [], settings, onDone, onRetrySettings, apply, intro: introWords, keep }: {
  publishes?: string | null;
  /** The press's own books (ownBooks), shown with their covers and titles in each look's preview (plan 17.8). */
  books?: { title: string; photo: string }[];
  settings: any;
  onDone: (welcome: WelcomeDone) => Promise<void>;
  onRetrySettings?: () => void;
  /** How the chosen look is put in place. The shop's admin puts it in Studio's draft and lets customer emails follow it
   * (the default); setup mode, with no shop yet, passes one that does nothing and keeps the choice on the press's setup
   * record through `onDone`. */
  apply?: (theme: LibraryTheme, settings: any, publishes?: string | null) => Promise<void>;
  /** The line under the title; the setup guide's step words by default. */
  intro?: string;
  /** When a look is already chosen: the way back that keeps it (in place of Skip, which would replace it). */
  keep?: { label: string; onKeep: () => void };
}) {
  const { suggested, others } = useMemo(() => galleryThemes(publishes), [publishes]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<LookFilter>("all");
  // The suggested looks show first; the whole gallery opens on "See all looks" (a long list buries the three picked for you).
  const [showAll, setShowAll] = useState(false);
  const [trying, setTrying] = useState<string | null>(null);
  const [device, setDevice] = useState<StageDevice>(() => (typeof window !== "undefined" && window.innerWidth < 720 ? "phone" : "desktop"));
  const [page, setPage] = useState<StagePage>("home");
  // The press's own products by default, once there are any (they can arrive after the picker opens).
  const [ownChoice, setOwn] = useState<boolean | null>(null);
  const own = ownChoice ?? books.length > 0;
  const [adminLook, setAdminLook] = useState<AdminLookId>(() => readAdminLook());
  const press = pressNameOf(settings);
  const bookShop = sellsBooks(publishes);
  const samples = useMemo(() => sampleProducts(publishes), [publishes]);
  // The press's own products have no prices in the preview; the sample prices fill in so the cards read as a shop.
  const products: PreviewProduct[] = own && books.length ? books.map((b, i) => ({ ...b, price: samples[i % samples.length].price })) : samples;
  const shown = useMemo(() => filterLooks(others, filter), [others, filter]);
  // The try-on flips through what the press is looking at: the suggestions, then the filtered list.
  const order = useMemo(() => [...suggested, ...shown], [suggested, shown]);
  const tryIndex = trying ? order.findIndex(t => t.id === trying) : -1;
  const current = tryIndex >= 0 ? order[tryIndex] : null;
  const step = (by: number) => { if (order.length && tryIndex >= 0) setTrying(order[(tryIndex + by + order.length) % order.length].id); };

  const choose = async (theme: LibraryTheme, skipped = false) => {
    if (busy) return;
    setBusy(theme.id); setError("");
    try {
      if (apply) await apply(theme, settings, publishes);
      else {
        // Loaded only when used, so setup mode never loads the shop's database code.
        const shop = await import("../chooseLook");
        await shop.applyChosenLook(theme, settings, publishes);
        await shop.followEmailTheme(theme.id);
      }
      await onDone({ theme: theme.id, at: new Date().toISOString(), adminLook, ...(skipped ? { skipped: true } : {}) });
    } catch (err) {
      setError(friendlyError(err, `use “${theme.name}”`));
      setBusy("");
    }
  };

  const intro = introWords ?? "Step 3 of 8. Pick a look for your shop. It goes into your draft, and you can change it any time in Design.";
  if (settings === undefined) return <SectionCard title="Choose your look" description={intro}><LoadingState label="Opening the looks…" /></SectionCard>;
  if (settings === null) {
    return (
      <SectionCard title="Choose your look" description={intro}>
        <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>Your shop's settings couldn't be read, so no look can be saved yet.</p>
        {onRetrySettings && <SecondaryButton size="sm" style={{ marginTop: 12 }} onClick={onRetrySettings}>Try again</SecondaryButton>}
      </SectionCard>
    );
  }

  const badges = (theme: LibraryTheme, suggestion: boolean) => (
    <>
      {suggestion && <StatusBadge tone="info" glyph={false}>Suggested</StatusBadge>}
      {isTemplate(theme) && <StatusBadge tone="primary" glyph={false}>Full template</StatusBadge>}
      {isDarkLook(theme) && <StatusBadge glyph={false}>Dark</StatusBadge>}
    </>
  );

  const card = (theme: LibraryTheme, suggestion: boolean) => {
    const look = lookPreview(theme, settings?.design);
    return (
      <li key={theme.id} data-look-card={theme.id} style={{ display: "grid", gap: 10, alignContent: "start", minWidth: 0 }}>
        <button type="button" onClick={() => { setPage("home"); setTrying(theme.id); }} disabled={!!busy} aria-label={`Try on ${theme.name}`}
          style={{ position: "relative", display: "block", width: "100%", padding: 0, aspectRatio: suggestion ? "4 / 3" : "16 / 11", overflow: "hidden",
            border: "var(--rp-hair, 1px) solid var(--rp-border-strong)", background: look.bg, cursor: "zoom-in" }}>
          <ScaledStage width={STAGE_WIDTH.desktop} label={`${press} in this look, desktop width`}>
            <LookStage look={look} press={press} device="desktop" products={products} books={bookShop} />
          </ScaledStage>
          {suggestion && (
            <span style={{ position: "absolute", right: "4%", top: "16%", width: "24%", aspectRatio: "390 / 800", border: "3px solid var(--rp-border-strong)", borderRadius: 14, overflow: "hidden", background: look.bg }}>
              <ScaledStage width={STAGE_WIDTH.phone}><LookStage look={look} press={press} device="phone" products={products} books={bookShop} /></ScaledStage>
            </span>
          )}
        </button>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <strong>{theme.name}</strong>
          {badges(theme, suggestion)}
        </div>
        <p className="rp-hint" style={{ margin: 0 }}>{theme.mood}</p>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <PrimaryButton size="sm" busy={busy === theme.id} disabled={!!busy && busy !== theme.id} onClick={() => void choose(theme)}>Use this look</PrimaryButton>
          <GhostButton size="sm" disabled={!!busy} onClick={() => { setPage("home"); setTrying(theme.id); }}>Try it on</GhostButton>
          <span aria-label={`${theme.name} colours`} role="img" style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
            {look.swatches.map((c, i) => <span key={i} style={{ width: 18, height: 18, background: c, border: "1px solid var(--rp-border-strong)" }} />)}
          </span>
        </div>
      </li>
    );
  };
  const grid = (min: number) => ({ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 24, gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))` }) as const;
  const first = suggested[0];
  const counts = Object.fromEntries(LOOK_FILTERS.map(f => [f.id, filterLooks(others, f.id).length]));

  const onStageKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[role=tab], input, textarea, select")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  };
  const toggle = (on: boolean) => ({ "aria-pressed": on, style: on ? { background: "var(--rp-primary-tint)", color: "var(--rp-text)", borderColor: "var(--rp-primary)" } : undefined });

  return (
    <SectionCard title={`Welcome to ${press}. Choose your look`} description={intro} collapsible={false}
      actions={keep
        ? <GhostButton size="sm" disabled={!!busy} onClick={keep.onKeep}>{keep.label}</GhostButton>
        : first && <GhostButton size="sm" disabled={!!busy} onClick={() => void choose(first, true)}>Skip for now</GhostButton>}>
      {error && <p role="alert" className="rp-hint" style={{ marginTop: 0, color: "var(--rp-danger)" }}>{error}</p>}
      <p className="rp-hint" style={{ marginTop: 0 }}>
        Try any look on before you choose. You can change it any time.
        {first && !keep && ` Skip uses “${first.name}”.`}
      </p>

      <h3 className="rp-card-title" style={{ fontSize: "var(--rp-text-base)", margin: "16px 0 12px" }}>Suggested for you</h3>
      <ul aria-label="Suggested looks" style={grid(320)}>{suggested.map(t => card(t, true))}</ul>

      {showAll ? <>
        <h3 className="rp-card-title" style={{ fontSize: "var(--rp-text-base)", margin: "40px 0 12px" }}>Every look</h3>
        <Tabs label="Show looks" idPrefix="looks-" value={filter} onChange={setFilter}
          tabs={LOOK_FILTERS.map(f => ({ id: f.id, label: f.label, count: counts[f.id] }))} />
        <ul aria-label="Every look" style={{ ...grid(240), marginTop: 16 }}>{shown.map(t => card(t, false))}</ul>
      </> : others.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <SecondaryButton onClick={() => setShowAll(true)}>See all {others.length + suggested.length} looks</SecondaryButton>
        </div>
      )}

      <h3 className="rp-card-title" style={{ fontSize: "var(--rp-text-base)", margin: "40px 0 4px" }}>Your admin</h3>
      <p className="rp-hint" style={{ marginTop: 0 }}>How this admin looks to you, not to your customers. Tap one to see it now; change it any time from the top bar.</p>
      <div role="radiogroup" aria-label="Admin look" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))" }}>
        {ADMIN_LOOKS.map(l => (
          <button key={l.id} type="button" role="radio" aria-checked={adminLook === l.id} disabled={!!busy}
            onClick={() => { setAdminLook(l.id); applyAdminLook(l.id); }}
            style={{ textAlign: "left", minHeight: 44, padding: 12, display: "grid", gap: 4, background: adminLook === l.id ? "var(--rp-primary-tint)" : "var(--rp-surface)", color: "var(--rp-text)",
              border: adminLook === l.id ? "3px solid var(--rp-primary)" : "1px solid var(--rp-border-strong)", cursor: "pointer" }}>
            <strong>{l.name}{adminLook === l.id ? " ✓" : ""}</strong>
            <span className="rp-hint">{l.description}</span>
          </button>
        ))}
      </div>

      <Dialog open={!!current} onClose={() => setTrying(null)} size="full"
        title={current ? `Try on: ${current.name}` : "Try on"}
        description={current ? `${tryIndex + 1} of ${order.length}. ${current.mood}` : undefined}
        footer={current && <>
          <GhostButton onClick={() => setTrying(null)}>Back to the looks</GhostButton>
          <PrimaryButton busy={busy === current.id} disabled={!!busy && busy !== current.id} onClick={() => void choose(current)}>Use {current.name}</PrimaryButton>
        </>}>
        {current && (() => {
          const look = lookPreview(current, settings?.design);
          return (
            <div onKeyDown={onStageKey} style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <span role="group" aria-label="Other looks" style={{ display: "flex", gap: 8 }}>
                  <SecondaryButton size="sm" icon={<ChevronLeft size={14} aria-hidden />} onClick={() => step(-1)}>Previous look</SecondaryButton>
                  <SecondaryButton size="sm" icon={<ChevronRight size={14} aria-hidden />} onClick={() => step(1)}>Next look</SecondaryButton>
                </span>
                <span role="group" aria-label="Screen" style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                  <SecondaryButton size="sm" {...toggle(device === "desktop")} icon={<Monitor size={14} aria-hidden />} onClick={() => setDevice("desktop")}>Computer</SecondaryButton>
                  <SecondaryButton size="sm" {...toggle(device === "phone")} icon={<Smartphone size={14} aria-hidden />} onClick={() => setDevice("phone")}>Phone</SecondaryButton>
                </span>
                <span role="group" aria-label="Page" style={{ display: "flex", gap: 8 }}>
                  <SecondaryButton size="sm" {...toggle(page === "home")} onClick={() => setPage("home")}>Home page</SecondaryButton>
                  <SecondaryButton size="sm" {...toggle(page === "product")} onClick={() => setPage("product")}>Product page</SecondaryButton>
                </span>
                {books.length > 0 && (
                  <span role="group" aria-label="Products shown" style={{ display: "flex", gap: 8 }}>
                    <SecondaryButton size="sm" {...toggle(own)} onClick={() => setOwn(true)}>Your products</SecondaryButton>
                    <SecondaryButton size="sm" {...toggle(!own)} onClick={() => setOwn(false)}>Samples</SecondaryButton>
                  </span>
                )}
              </div>
              <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", alignItems: "start" }}>
                <div data-try-on-stage={device} style={{ gridColumn: "1 / -1", background: "var(--rp-surface-2)", padding: device === "phone" ? "24px 12px" : 12, display: "flex", justifyContent: "center", minWidth: 0 }}>
                  <div style={device === "phone"
                    ? { width: "min(100%, 390px)", border: "10px solid var(--rp-text)", borderRadius: 36, overflow: "hidden", background: look.bg }
                    : { width: "100%", maxWidth: STAGE_WIDTH.desktop, border: "1px solid var(--rp-border-strong)", background: look.bg }}>
                    <ScaledStage width={STAGE_WIDTH[device]} label={`${press} in ${current.name}, ${device === "phone" ? "phone" : "computer"} screen, ${page === "home" ? "home page" : "product page"}`}>
                      <LookStage look={look} press={press} device={device} page={page} products={products} books={bookShop} />
                    </ScaledStage>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{badges(current, suggested.some(t => t.id === current.id))}</div>
                  <p className="rp-hint" style={{ margin: 0 }}>{own && books.length ? "Your own products, shown in this look." : "Sample products. Your own products, words and logo take their places."} Every look keeps your words, products and pages.</p>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <span aria-label={`${current.name} colours`} role="img" style={{ display: "flex", gap: 6 }}>
                    {look.swatches.map((c, i) => <span key={i} style={{ width: 28, height: 28, background: c, border: "1px solid var(--rp-border-strong)" }} />)}
                  </span>
                  <p className="rp-hint" style={{ margin: 0 }}>{look.bodyFont === "inherit" ? "Set in the shop's standard type." : `Headings in ${look.headingFont}, text in ${look.bodyFont}.`} Tip: the arrow keys flip between looks.</p>
                </div>
              </div>
            </div>
          );
        })()}
      </Dialog>
    </SectionCard>
  );
}
