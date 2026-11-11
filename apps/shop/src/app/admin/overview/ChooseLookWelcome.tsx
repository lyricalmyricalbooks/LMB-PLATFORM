import { useMemo, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Monitor, Smartphone } from "lucide-react";
import {
  feelLabel, lookFeel, filterLooks, builtLooks, libraryLook, suggestedThemes, LOOK_FILTERS, lookPreview, pressNameOf, sampleProducts,
  type LibraryTheme, type LookFilter, type PreviewProduct,
} from "../lookGallery";
import type { WelcomeDone } from "../firstWeek";
import { friendlyError } from "../studio/friendlyError";
import { Dialog, GhostButton, LoadingState, PrimaryButton, SecondaryButton, SectionCard, Tabs } from "../riso/components";
import { sellsBooks } from "../sells";
import { LookStage, ScaledStage, STAGE_WIDTH, type StageDevice, type StagePage } from "./LookStage";

/**
 * Choose your look (plan 6.3): the welcome before the setup guide, shown once, and setup mode's Design page. Laid out
 * like a theme store: every look with filters, each card a picture of a whole shop
 * page in that look. Try it on opens the look full screen (LookStage) on a desktop or a phone, on the home page or a
 * product page, with the press's own products or sample ones, and flips through the looks with the arrows.
 * `settings` is settings/website as the Overview read it: undefined while it loads, null when it couldn't be read.
 * `onDone` gets what to record once the look is in the draft; the parent saves it (and puts the welcome away).
 */
export function ChooseLookWelcome({ publishes, books = [], settings, onDone, onRetrySettings, apply, intro: introWords, keep, chosen, settled = false }: {
  publishes?: string | null;
  /** The press's own books (ownBooks), shown with their covers, titles and prices in each look's preview (plan 17.8). */
  books?: { title: string; photo: string; price?: string }[];
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
  /** The look (and admin look) the press chose in setup (code plan 18.9): shown on its own first, with every look a tap away. */
  chosen?: { theme: string } | null;
  /** The chosen look is already saved (setup mode's Design page): show it as "Your look", with no Use button on it. */
  settled?: boolean;
}) {
  const others = useMemo(() => builtLooks(), []);
  // One general list. The sign-up answer only decides which look "Skip for now" uses.
  const first = useMemo(() => suggestedThemes(publishes)[0], [publishes]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<LookFilter>("all");
  const [trying, setTrying] = useState<string | null>(null);
  const [device, setDevice] = useState<StageDevice>(() => (typeof window !== "undefined" && window.innerWidth < 720 ? "phone" : "desktop"));
  const [page, setPage] = useState<StagePage>("home");
  const [pick, setPick] = useState(0);
  // The press's own products by default, once there are any (they can arrive after the picker opens).
  const [ownChoice, setOwn] = useState<boolean | null>(null);
  const own = ownChoice ?? books.length > 0;
  const [browsing, setBrowsing] = useState(false);
  const picked = useMemo(() => (chosen && !browsing ? libraryLook(chosen.theme) ?? null : null), [chosen, browsing]);
  const press = pressNameOf(settings);
  const bookShop = sellsBooks(publishes);
  const samples = useMemo(() => sampleProducts(publishes), [publishes]);
  // The press's own products show their own prices; one without a price borrows a sample price so the cards read as a shop.
  const products: PreviewProduct[] = own && books.length ? books.map((b, i) => ({ ...b, price: b.price || samples[i % samples.length].price })) : samples;
  const shown = useMemo(() => filterLooks(others, filter), [others, filter]);
  // The try-on flips through what the press is looking at: the filtered list.
  const order = shown;
  const tryIndex = trying ? order.findIndex(t => t.id === trying) : -1;
  const current = tryIndex >= 0 ? order[tryIndex] : null;
  const step = (by: number) => { if (order.length && tryIndex >= 0) setTrying(order[(tryIndex + by + order.length) % order.length].id); };

  const choose = async (theme: LibraryTheme, skipped = false, toDesigner = false) => {
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
      await onDone({ theme: theme.id, at: new Date().toISOString(), ...(skipped ? { skipped: true } : {}) });
      // The look is in the draft: open the shop designer on it.
      setBrowsing(false);
      if (toDesigner && typeof window !== "undefined") window.location.hash = "settings/designer";
    } catch (err) {
      setError(friendlyError(err, `use “${theme.name}”`));
      setBusy("");
    }
  };

  const intro = introWords ?? "Pick a look for your shop. It goes into your draft, and you can change it any time in Design.";
  if (settings === undefined) return <SectionCard title="Choose your look" description={intro}><LoadingState label="Opening the looks…" /></SectionCard>;
  if (settings === null) {
    return (
      <SectionCard title="Choose your look" description={intro}>
        <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>Your shop's settings couldn't be read, so no look can be saved yet.</p>
        {onRetrySettings && <SecondaryButton size="sm" style={{ marginTop: 12 }} onClick={onRetrySettings}>Try again</SecondaryButton>}
      </SectionCard>
    );
  }

  // The feel as a small coloured pill, in the Colophon tile colours.
  const FEEL_TILE = { quiet: "var(--rp-info-tint)", warm: "var(--rp-success-tint)", bold: "var(--rp-warning-tint)", dark: "var(--rp-surface-inset)" } as const;
  const badges = (theme: LibraryTheme) => (
    <span style={{ fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 999, background: FEEL_TILE[lookFeel(theme)], color: "var(--rp-text)" }}>{feelLabel(theme)}</span>
  );
  const dots = (colours: string[], size: number, label: string) => (
    <span aria-label={label} role="img" style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
      {colours.map((c, i) => <i key={i} style={{ display: "block", width: size, height: size, borderRadius: "50%", background: c, boxShadow: "inset 0 0 0 1px var(--rp-border-strong)" }} />)}
    </span>
  );

  // `big`: the large picture with a phone beside it, for the look chosen in setup.
  const card = (theme: LibraryTheme, big = false) => {
    const look = lookPreview(theme, settings?.design);
    return (
      <li key={theme.id} data-look-card={theme.id} style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0, padding: 12, background: "var(--rp-surface-sunken)", borderRadius: "var(--rp-radius-lg)" }}>
        <button type="button" onClick={() => { setPage("home"); setPick(0); setTrying(theme.id); }} disabled={!!busy} aria-label={`Try on ${theme.name}`}
          style={{ position: "relative", display: "block", width: "100%", padding: 0, aspectRatio: big ? "4 / 3" : "8 / 5", overflow: "hidden",
            border: 0, borderRadius: 16, background: look.bg, cursor: "zoom-in" }}>
          <ScaledStage width={STAGE_WIDTH.desktop} label={`${press} in this look, desktop width`}>
            <LookStage look={look} press={press} device="desktop" products={products} books={bookShop} />
          </ScaledStage>
          {big && (
            <span style={{ position: "absolute", right: "4%", top: "16%", width: "24%", aspectRatio: "390 / 800", border: "3px solid var(--rp-text)", borderRadius: 14, overflow: "hidden", background: look.bg }}>
              <ScaledStage width={STAGE_WIDTH.phone}><LookStage look={look} press={press} device="phone" products={products} books={bookShop} /></ScaledStage>
            </span>
          )}
        </button>
        <div style={{ display: "grid", gap: 8, padding: "0 6px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em" }}>{theme.name}</strong>
            {badges(theme)}
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--rp-text-muted)", textWrap: "pretty", minHeight: 63 }}>{theme.mood}</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "0 6px 6px", marginTop: "auto" }}>
          {!(settled && picked?.id === theme.id) && <PrimaryButton size="sm" busy={busy === theme.id} disabled={!!busy && busy !== theme.id} onClick={() => void choose(theme)}>Use this look</PrimaryButton>}
          <GhostButton size="sm" disabled={!!busy} onClick={() => { setPage("home"); setTrying(theme.id); }}>Try it on</GhostButton>
          {dots(look.swatches, 18, `${theme.name} colours`)}
        </div>
      </li>
    );
  };
  const grid = (min: number) => ({ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 20, gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))` }) as const;
  const counts = Object.fromEntries(LOOK_FILTERS.map(f => [f.id, filterLooks(others, f.id).length]));

  const onStageKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[role=tab], input, textarea, select")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  };
  const toggle = (on: boolean) => ({ "aria-pressed": on, style: on ? { background: "var(--rp-primary-tint)", color: "var(--rp-text)", borderColor: "var(--rp-primary)" } : undefined });

  return (
    <SectionCard title={picked ? (settled ? `Your look: ${picked.name}` : `Welcome to ${press}. Here's the look you chose`) : `Welcome to ${press}. Choose your look`} description={intro} collapsible={false}
      actions={picked
        ? <GhostButton size="sm" disabled={!!busy} onClick={() => setBrowsing(true)}>{settled ? "Choose another look" : "See every look"}</GhostButton>
        : keep
        ? <GhostButton size="sm" disabled={!!busy} onClick={() => { setBrowsing(false); keep.onKeep(); }}>{keep.label}</GhostButton>
        : first && <GhostButton size="sm" disabled={!!busy} onClick={() => void choose(first, true)}>Skip for now</GhostButton>}>
      {error && <p role="alert" className="rp-hint" style={{ marginTop: 0, color: "var(--rp-danger)" }}>{error}</p>}
      {picked ? (
        <>
          <p className="rp-hint" style={{ marginTop: 0 }}>
            {settled ? "This goes on your website when your shop is made. Try it on to click around, and change anything in the designer later." : `You chose “${picked.name}” in setup. Use it, try it on, or see every look. You can change it any time in Design.`}
          </p>
          <ul aria-label="The look you chose" style={{ ...grid(320), maxWidth: settled ? 960 : 720, gridTemplateColumns: settled ? "1fr" : undefined }}>{card(picked, true)}</ul>
        </>
      ) : (<>
      <p className="rp-hint" style={{ marginTop: 0 }}>
        Try any look on before you choose. Every look is a starting point: change anything in the shop designer.
        {first && !keep && ` Skip uses “${first.name}”.`}
      </p>

      <Tabs label="Show looks" idPrefix="looks-" value={filter} onChange={setFilter}
        tabs={LOOK_FILTERS.map(f => ({ id: f.id, label: f.label, count: counts[f.id] }))} />
      <p data-look-count style={{ margin: "12px 0 0", textAlign: "right", fontFamily: "var(--rp-font-mono)", fontSize: 13, color: "var(--rp-text-subtle)" }}>{shown.length} {shown.length === 1 ? "look" : "looks"} · change any time</p>
      <ul aria-label="Looks" style={{ ...grid(300), marginTop: 12 }}>{shown.map(t => card(t))}</ul>

      </>)}

      <Dialog open={!!current} onClose={() => setTrying(null)} size="full"
        title={current ? `Try on: ${current.name}` : "Try on"}
        description={current ? `${tryIndex + 1} of ${order.length}. ${current.mood}` : undefined}
        footer={current && <>
          <GhostButton onClick={() => setTrying(null)}>Back to the looks</GhostButton>
          <SecondaryButton disabled={!!busy} onClick={() => void choose(current, false, true)}>Use and customize</SecondaryButton>
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
                  <SecondaryButton size="sm" {...toggle(page === "bag")} onClick={() => setPage("bag")}>Bag</SecondaryButton>
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
                    <ScaledStage interactive width={STAGE_WIDTH[device]} label={`${press} in ${current.name}, ${device === "phone" ? "phone" : "computer"} screen, ${page === "home" ? "home page" : page === "bag" ? "bag" : "product page"}`}>
                      <LookStage look={look} press={press} device={device} page={page} products={products} books={bookShop} productIndex={pick}
                        onNavigate={(to, i) => { setPage(to); if (i !== undefined) setPick(i); }} />
                    </ScaledStage>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{badges(current)}</div>
                  <p className="rp-hint" style={{ margin: 0 }}>{own && books.length ? "Your own products, shown in this look." : "Sample products. Your own products, words and logo take their places."} Click around to see the shop. Everything can be changed in the designer afterwards.</p>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <span aria-label={`${current.name} colours`} role="img" style={{ display: "flex", gap: 6 }}>
                    {look.swatches.map((c, i) => <i key={i} style={{ display: "block", width: 28, height: 28, borderRadius: "50%", background: c, boxShadow: "inset 0 0 0 1px var(--rp-border-strong)" }} />)}
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
