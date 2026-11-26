// Style › Site styles (round three, phase 5): ready-made palettes and font pairings. Each click is one undoable change
// to the draft (named for Undo), so the preview beside the panel shows it on every page at once; nothing reaches
// shoppers until Publish. The rules are in siteStyles.ts. A website built on a starter shows that starter's own colour
// versions instead of the palettes (one website picker plan, step 3): the same swatches as Online store.
import { ArrowLeft } from "lucide-react";
import { googleFontHref } from "../../features/site/fonts";
import { libraryLook } from "../lookGallery";
import { applyLook } from "./themeSwitch";
import { withStyle, type StarterStyle } from "./starterStyles";
import { applyPairing, applyPalette, currentPairing, currentPalette, hasOwnSchemes, SITE_FONTS, SITE_PALETTES } from "./siteStyles";

type Change = (fn: (d: any) => any, meta: { label: string }) => void;

export function StudioSiteStyles({ design, change, onClose, onOwnSchemes, starterStyles = [], surfaceIds }: {
  design: any;
  change: Change;
  onClose: () => void;
  /** Opens Style › Colour schemes, where the owner's own schemes live. */
  onOwnSchemes: () => void;
  /** The colour versions of the starter the website is built on (none for an older look: the palettes show). */
  starterStyles?: StarterStyle[];
  /** Every page of the shop, so a colour version reaches them all as Online store's does. */
  surfaceIds?: string[];
}) {
  const paletteNow = currentPalette(design);
  const fontsNow = currentPairing(design);
  const own = hasOwnSchemes(design);
  const starter = starterStyles.length > 1 ? libraryLook(design?.themeBase?.id) : null;
  const styleNow = starterStyles.some((s) => s.id === design?.themeBase?.style) ? design.themeBase.style : starterStyles[0]?.id;
  const card = (on: boolean) => ({ role: "radio" as const, "aria-checked": on, className: "studio-library-card studio-make-card" });
  const headingFont = design?.headingFont ? `"${design.headingFont}", serif` : undefined;

  return (
    <div className="studio-library studio-make studio-site-styles" role="region" aria-label="Site styles" data-studio-site-styles
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      {SITE_FONTS.map((f) => <link key={f.id} rel="stylesheet" href={googleFontHref(f.heading)} />)}
      <div className="studio-library-head">
        <button type="button" className="studio-structure-switch" onClick={onClose}><ArrowLeft size={14} aria-hidden /> Done</button>
        <h2 className="studio-library-title">Site styles</h2>
        <p className="studio-hint">One click tries a style on every page. Undo takes it back, and nothing changes for shoppers until you publish.</p>
      </div>
      <div className="studio-library-body">
        <section className="studio-library-group" aria-labelledby="site-styles-colours">
          <h3 id="site-styles-colours">Colours</h3>
          {own && <p className="studio-hint" data-site-styles-own>
            Your own colour schemes stay as they are.{" "}
            <button type="button" className="studio-text-button" onClick={onOwnSchemes}>See your schemes</button>
          </p>}
          {starter ? <div className="studio-library-grid" role="radiogroup" aria-label={`Colours of ${starter.name}`}>
            {starterStyles.map((s) => <button key={s.id} type="button" {...card(styleNow === s.id)} data-starter-style={s.id}
              onClick={() => change((d) => applyLook(d, withStyle(starter, s.id), surfaceIds), { label: `Use ${starter.name} ${s.name}` })}>
              <span className="studio-make-swatch studio-site-swatch" aria-hidden style={{ background: s.swatches[0], color: s.swatches[1], fontFamily: headingFont }}>
                <b>Aa</b><i style={{ background: s.swatches[2] }} /><i style={{ background: s.swatches[1] }} />
              </span>
              <span className="studio-library-name">{s.name}</span>
            </button>)}
          </div>
          : <div className="studio-library-grid" role="radiogroup" aria-label="Colours">
            {SITE_PALETTES.map((p) => <button key={p.id} type="button" {...card(paletteNow === p.id)} data-site-palette={p.id}
              onClick={() => change((d) => applyPalette(d, p), { label: `Use the ${p.label} colours` })}>
              <span className="studio-make-swatch studio-site-swatch" aria-hidden style={{ background: p.bg, color: p.text, fontFamily: headingFont }}>
                <b>Aa</b><i style={{ background: p.accent }} /><i style={{ background: p.band }} />
              </span>
              <span className="studio-library-name">{p.label}</span>
            </button>)}
          </div>}
        </section>
        <section className="studio-library-group" aria-labelledby="site-styles-fonts">
          <h3 id="site-styles-fonts">Fonts</h3>
          <div className="studio-library-grid" role="radiogroup" aria-label="Fonts">
            {SITE_FONTS.map((f) => <button key={f.id} type="button" {...card(fontsNow === f.id)} data-site-fonts={f.id}
              onClick={() => change((d) => applyPairing(d, f), { label: `Use ${f.heading} and ${f.body}` })}>
              <span className="studio-make-font" style={{ fontFamily: `"${f.heading}", serif`, fontWeight: f.headingWeight }}>Aa {f.label}</span>
              <small>{f.heading} · {f.body}</small>
            </button>)}
          </div>
          <p className="studio-hint">Sizes, weights and every other type setting are under Style › Typography.</p>
        </section>
      </div>
    </div>
  );
}
