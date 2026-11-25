import { useRef, type ReactNode } from "react";
import { ImagePlus, X } from "lucide-react";
import { GhostButton, SecondaryButton } from "../riso/components";
import { GUIDED_FEELS, type StyleFeel } from "../guidedStart";
import type { SampleSet, SampleSetId } from "../starterSamples";

/**
 * Guided start (next starters plan phase 3): the three questions above Choose your look. What you sell picks the
 * products the previews show (the press's own, or a sample set), the feel picks each starter's style, and the logo
 * (optional, read in the browser and never uploaded here) puts its colour into each starter and its picture into the
 * header. The shortlist itself is drawn by Choose your look with its own cards (`children`).
 */
export function GuidedStart({ sets, sampleSet, onSampleSet, own, hasOwn, onOwn, feel, onFeel, logo, onLogo, logoNote, children }: {
  sets: SampleSet[];
  sampleSet: SampleSetId | null;
  onSampleSet: (id: SampleSetId) => void;
  /** Showing the press's own products (only offered once it has some). */
  own: boolean;
  hasOwn: boolean;
  onOwn: (own: boolean) => void;
  feel: StyleFeel;
  onFeel: (feel: StyleFeel) => void;
  /** The picked logo's picture (a local address) and its colour, or null. */
  logo: { url: string; colour: string | null } | null;
  onLogo: (file: File | null) => void;
  /** A word about the logo, such as "Reading its colours…" or why its colour couldn't be read. */
  logoNote?: string;
  children: ReactNode;
}) {
  const file = useRef<HTMLInputElement>(null);
  // A chosen option is a black pill, like every other on/off choice in the admin.
  // A choice not picked yet still reads as a button: a light fill and an outline on the sunken panel.
  const pill = (on: boolean) => ({ "aria-checked": on, role: "radio", style: on
    ? { background: "var(--rp-text)", color: "var(--rp-surface)", border: "1px solid var(--rp-text)" }
    : { background: "var(--rp-surface)", color: "var(--rp-text)", border: "1px solid var(--rp-border)" } });
  const step = (n: number, title: string, hint: string, body: ReactNode) => (
    <li style={{ display: "grid", gridTemplateColumns: "32px minmax(0, 1fr)", gap: "4px 14px", alignItems: "start" }}>
      <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 999, background: "var(--rp-text)", color: "var(--rp-surface)", fontWeight: 700, fontSize: 14 }}>{n}</span>
      <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h3>
          <p className="rp-hint" style={{ margin: "2px 0 0" }}>{hint}</p>
        </div>
        {body}
      </div>
    </li>
  );
  return (
    <div data-guided-start style={{ display: "grid", gap: 28 }}>
      <ol aria-label="Three questions" style={{ margin: 0, padding: 20, listStyle: "none", display: "grid", gap: 24, background: "var(--rp-surface-sunken)", borderRadius: "var(--rp-radius-lg)",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
        {step(1, "What do you sell?", "The previews show these products.",
          <div role="radiogroup" aria-label="What do you sell?" data-guided-sell style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {hasOwn && <SecondaryButton size="sm" {...pill(own)} data-guided-set="own" onClick={() => onOwn(true)}>Your products</SecondaryButton>}
            {sets.map((s) => (
              <SecondaryButton key={s.id} size="sm" {...pill(!own && sampleSet === s.id)} data-guided-set={s.id} onClick={() => { onOwn(false); onSampleSet(s.id); }}>{s.label}</SecondaryButton>
            ))}
          </div>)}
        {step(2, "Which feel suits you?", "Each starter comes in the style that fits it.",
          <div role="radiogroup" aria-label="Which feel suits you?" style={{ display: "grid", gap: 8 }}>
            {GUIDED_FEELS.map((f) => (
              <button key={f.id} type="button" {...pill(feel === f.id)} data-guided-feel={f.id} onClick={() => onFeel(f.id)}
                style={{ display: "grid", gap: 2, textAlign: "left", padding: "10px 14px", font: "inherit", cursor: "pointer", borderRadius: 14,
                  border: `1px solid ${feel === f.id ? "var(--rp-text)" : "var(--rp-border)"}`, background: feel === f.id ? "var(--rp-text)" : "var(--rp-surface)", color: feel === f.id ? "var(--rp-surface)" : "var(--rp-text)" }}>
                <strong style={{ fontSize: 14, fontWeight: 600 }}>{f.label}</strong>
                <span style={{ fontSize: 13, opacity: 0.8 }}>{f.blurb}</span>
              </button>
            ))}
          </div>)}
        {step(3, "Add your logo", "Optional. Its colour goes into every starter.",
          <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden data-guided-logo-input
              onChange={(e) => { onLogo(e.target.files?.[0] || null); e.target.value = ""; }} />
            {logo ? (
              <div data-guided-logo style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, background: "var(--rp-surface)", border: "1px solid var(--rp-border)", borderRadius: 14 }}>
                <img src={logo.url} alt="Your logo" style={{ display: "block", height: 40, width: "auto", maxWidth: 120, objectFit: "contain" }} />
                {logo.colour && <i role="img" aria-label="Your logo's colour" style={{ display: "block", width: 22, height: 22, borderRadius: 999, background: logo.colour, boxShadow: "inset 0 0 0 1px var(--rp-border-strong)" }} />}
                <GhostButton size="sm" icon={<X size={14} aria-hidden />} onClick={() => onLogo(null)}>Remove</GhostButton>
              </div>
            ) : (
              <SecondaryButton size="sm" icon={<ImagePlus size={14} aria-hidden />} onClick={() => file.current?.click()}>Choose a logo</SecondaryButton>
            )}
            {logoNote && <p className="rp-hint" role="status" style={{ margin: 0 }}>{logoNote}</p>}
          </div>)}
      </ol>
      {children}
    </div>
  );
}
