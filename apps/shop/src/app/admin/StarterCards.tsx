// The starter cards Online store's website picker and the setup guide's Choose your website share (plan "One website
// picker", steps 2 and 4): a real screenshot of the starter, its name and one line, its colour versions, Use this and
// Preview. The rules (which starters, their colours, the pictures) live in websiteChoice.ts.
import { useState } from "react";
import { PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";
import type { StarterChoice } from "./lookGallery";
import { coloursOf, STARTER_BLURB, starterTheme, thumbUrl } from "./websiteChoice";

/** A starter's colour versions as named swatches; nothing when it has only one. */
export function Colours({ id, value, onPick, choice, label }: { id: string; value: string | null; onPick: (style: string) => void; choice?: StarterChoice; label: string }) {
  const colours = coloursOf(id, choice);
  if (colours.length < 2) return null;
  return (
    <div role="radiogroup" aria-label={label} className="rp-colour-chips">
      {colours.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={s.id === value} className="rp-colour-chip" onClick={() => onPick(s.id)}>
          <span aria-hidden className="rp-colour-dots">{s.swatches.map((c, i) => <i key={i} style={{ background: c }} />)}</span>{s.name}
        </button>
      ))}
    </div>
  );
}

/** The starter's home page on a computer, in that colour version (its name in place of a picture that won't load). */
export function Shot({ id, style, name, big }: { id: string; style: string | null; name: string; big?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="rp-website-shot" data-big={big || undefined}>
      {broken ? <span className="rp-website-shot-missing">{name}</span>
        : <img src={thumbUrl(id, style)} alt={`${name}, its home page on a computer`} loading={big ? "eager" : "lazy"} decoding="async" onError={() => setBroken(true)} />}
    </div>
  );
}

/** The colour version a card shows first: the one picked on it, else the starter's first offered one. */
export const firstColour = (id: string, choice?: StarterChoice) => coloursOf(id, choice)[0]?.id ?? null;

type CardProps = {
  id: string;
  style: string | null;
  onStyle: (style: string) => void;
  choice?: StarterChoice;
  isNew?: boolean;
  /** Which card's Use this is working, if any (every card waits while one is). */
  busy?: string | null;
  onUse?: (style: string | null) => void;
  /** Left out where the real shop can't be shown (setup, before the shop is made). */
  onPreview?: (style: string | null) => void;
};

/** One starter in the list: picture (opens Preview), name, one line, colours, Use this and Preview. */
export function StarterCard({ id, style, onStyle, choice, isNew, busy, onUse, onPreview }: CardProps) {
  const theme = starterTheme(id, null);
  if (!theme) return null;
  const shot = <Shot id={id} style={style} name={theme.name} />;
  return (
    <li className="rp-website-card" data-starter-card={id}>
      {onPreview
        ? <button type="button" className="rp-website-card-shot" onClick={() => onPreview(style)} aria-label={`Preview ${theme.name}`}>{shot}</button>
        : <div className="rp-website-card-shot">{shot}</div>}
      <div className="rp-website-card-words">
        <div className="rp-website-card-title">
          <strong>{theme.name}</strong>
          {isNew && <StatusBadge tone="info" glyph={false}>New</StatusBadge>}
        </div>
        <p className="rp-hint">{STARTER_BLURB[id]}</p>
        <Colours id={id} value={style} onPick={onStyle} choice={choice} label={`Colours of ${theme.name}`} />
        {(onUse || onPreview) && (
          <div className="rp-website-actions">
            {onUse && <PrimaryButton size="sm" onClick={() => onUse(style)} disabled={!!busy}>{busy === id ? "Putting it in your draft…" : "Use this"}</PrimaryButton>}
            {onPreview && <SecondaryButton size="sm" onClick={() => onPreview(style)}>Preview</SecondaryButton>}
          </div>
        )}
      </div>
    </li>
  );
}
