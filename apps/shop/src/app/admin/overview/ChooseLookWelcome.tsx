import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { applyChosenLook, galleryThemes, lookPreview, pressNameOf, type LibraryTheme } from "../chooseLook";
import type { WelcomeDone } from "../firstWeek";
import { friendlyError } from "../studio/friendlyError";
import { Dialog, GhostButton, LoadingState, PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from "../riso/components";

/**
 * Choose your look (plan 6.3): the welcome before the setup guide, shown once. `settings` is settings/website as the
 * Overview read it: undefined while it loads, null when it couldn't be read. `onDone` gets what to record once the
 * look is in the draft; the parent saves it (and puts the welcome away).
 */
export function ChooseLookWelcome({ publishes, settings, onDone, onRetrySettings }: {
  publishes?: string | null;
  settings: any;
  onDone: (welcome: WelcomeDone) => Promise<void>;
  onRetrySettings?: () => void;
}) {
  const { suggested, others } = galleryThemes(publishes);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<LibraryTheme | null>(null);
  const [width, setWidth] = useState<"phone" | "desktop">("phone");
  const press = pressNameOf(settings);

  const choose = async (theme: LibraryTheme, skipped = false) => {
    if (busy) return;
    setBusy(theme.id); setError("");
    try {
      await applyChosenLook(theme, settings, publishes);
      await onDone({ theme: theme.id, at: new Date().toISOString(), ...(skipped ? { skipped: true } : {}) });
    } catch (err) {
      setError(friendlyError(err, `use “${theme.name}”`));
      setBusy("");
    }
  };

  const intro = "Pick a look for your shop. It goes into your draft, and you can change it any time in Design.";
  if (settings === undefined) return <SectionCard title="Choose your look" description={intro}><LoadingState label="Opening the looks…" /></SectionCard>;
  if (settings === null) {
    return (
      <SectionCard title="Choose your look" description={intro}>
        <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>Your shop's settings couldn't be read, so no look can be saved yet.</p>
        {onRetrySettings && <SecondaryButton size="sm" style={{ marginTop: 12 }} onClick={onRetrySettings}>Try again</SecondaryButton>}
      </SectionCard>
    );
  }

  const card = (theme: LibraryTheme, suggestion: boolean) => {
    const look = lookPreview(theme);
    return (
      <li key={theme.id} style={{ display: "grid", gap: 10, alignContent: "start", border: "1px solid var(--rp-border)", padding: 12, minWidth: 0 }}>
        <LookPicture look={look} press={press} width="phone" compact />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <strong>{theme.name}</strong>
          {suggestion && <StatusBadge tone="info" glyph={false}>Suggested</StatusBadge>}
        </div>
        <p className="rp-hint" style={{ margin: 0 }}>{theme.mood}</p>
        <div aria-label={`${theme.name} colours`} role="img" style={{ display: "flex", gap: 6 }}>
          {look.swatches.map((c, i) => <span key={i} style={{ width: 28, height: 28, background: c, border: "1px solid var(--rp-border-strong)" }} />)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <PrimaryButton size="sm" busy={busy === theme.id} disabled={!!busy && busy !== theme.id} onClick={() => void choose(theme)}>Use this look</PrimaryButton>
          <GhostButton size="sm" disabled={!!busy} onClick={() => setPreview(theme)}>Preview</GhostButton>
        </div>
      </li>
    );
  };
  const grid = { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))" } as const;
  const first = suggested[0];

  return (
    <SectionCard title={`Welcome to ${press}. Choose your look`} description={intro} collapsible={false}
      actions={first && <GhostButton size="sm" disabled={!!busy} onClick={() => void choose(first, true)}>Skip for now</GhostButton>}>
      {error && <p role="alert" className="rp-hint" style={{ marginTop: 0, color: "var(--rp-danger)" }}>{error}</p>}
      {first && <p className="rp-hint" style={{ marginTop: 0 }}>Skip uses “{first.name}”, our suggestion for you. Every look keeps your words, products and pages.</p>}
      <h3 className="rp-card-title" style={{ fontSize: "var(--rp-text-base)", margin: "8px 0 12px" }}>Suggested for you</h3>
      <ul aria-label="Suggested looks" style={grid}>{suggested.map(t => card(t, true))}</ul>
      <h3 className="rp-card-title" style={{ fontSize: "var(--rp-text-base)", margin: "24px 0 12px" }}>Every look</h3>
      <ul aria-label="Every look" style={grid}>{others.map(t => card(t, false))}</ul>

      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview ? `Preview: ${preview.name}` : "Preview"} description={preview?.mood} size="lg"
        footer={preview && <>
          <GhostButton onClick={() => setPreview(null)}>Back to the looks</GhostButton>
          <PrimaryButton busy={busy === preview.id} disabled={!!busy && busy !== preview.id} onClick={() => void choose(preview)}>Use this look</PrimaryButton>
        </>}>
        {preview && <>
          <div role="group" aria-label="Preview width" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <SecondaryButton size="sm" aria-pressed={width === "phone"} icon={<Smartphone size={14} aria-hidden />} onClick={() => setWidth("phone")}>Phone</SecondaryButton>
            <SecondaryButton size="sm" aria-pressed={width === "desktop"} icon={<Monitor size={14} aria-hidden />} onClick={() => setWidth("desktop")}>Desktop</SecondaryButton>
          </div>
          <div style={{ overflowX: "auto" }}><LookPicture look={lookPreview(preview)} press={press} width={width} /></div>
          <p className="rp-hint">Sample books. Your own books, words and logo take their places.</p>
        </>}
      </Dialog>
    </SectionCard>
  );
}

/**
 * A small picture of the shop in a look: the header with the press's name, a heading, a row of sample books and a
 * button, in the look's own colours and type. Drawn from the theme itself, so every theme has one.
 */
export function LookPicture({ look, press, width, compact }: { look: ReturnType<typeof lookPreview>; press: string; width: "phone" | "desktop"; compact?: boolean }) {
  const cols = width === "phone" ? look.columns.phone + (compact ? 1 : 0) : look.columns.desktop;
  const books = Array.from({ length: width === "phone" ? 2 * cols : cols }, (_, i) => i);
  const scale = compact ? 0.8 : 1;
  return (
    <div role="img" aria-label={`${press} in this look, ${width === "phone" ? "phone" : "desktop"} width`}
      style={{ width: compact ? "100%" : width === "phone" ? 300 : 640, maxWidth: compact ? "100%" : undefined, margin: compact ? 0 : "0 auto",
        background: look.bg, color: look.text, fontFamily: look.bodyFont, border: "1px solid var(--rp-border-strong)", overflow: "hidden" }}>
      <div style={{ background: look.headerBg, color: look.headerText, padding: `${8 * scale}px ${12 * scale}px`, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${look.border}` }}>
        <span style={{ fontFamily: look.headingFont, fontWeight: 700, fontSize: 15 * scale, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{press}</span>
        <span aria-hidden style={{ fontSize: 11 * scale, opacity: 0.8 }}>Shop · Bag</span>
      </div>
      <div style={{ padding: 12 * scale }}>
        <div style={{ fontFamily: look.headingFont, fontSize: (width === "phone" ? 18 : 24) * scale, lineHeight: 1.1, marginBottom: 10 * scale }}>New books</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 * scale }}>
          {books.map(i => (
            <div key={i}>
              <div style={{ aspectRatio: "3 / 4", background: i % 2 ? look.accent : look.surface, border: `1px solid ${look.border}`, borderRadius: look.radius }} />
              <div style={{ height: 6 * scale, width: "80%", background: look.text, opacity: 0.7, marginTop: 6 * scale }} />
              <div style={{ height: 6 * scale, width: "40%", background: look.text, opacity: 0.4, marginTop: 4 * scale }} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 * scale, display: "inline-block", background: look.button, color: look.buttonText, borderRadius: look.buttonRadius,
          padding: `${6 * scale}px ${12 * scale}px`, fontSize: 12 * scale, fontWeight: 700, textTransform: look.uppercase ? "uppercase" : "none" }}>Add to bag</div>
      </div>
    </div>
  );
}
