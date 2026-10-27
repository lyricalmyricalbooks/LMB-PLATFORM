// Brand kit (Studio 3.0 phase 6): a five-step panel beside the preview — logo, colours, personality, Home page, review.
// Each choice is shown on the canvas straight away (a preview only); "Apply brand kit" writes it to the draft as one
// undoable change. Nothing is published until Publish.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ImageUp } from "lucide-react";
import { PrimaryButton, SecondaryButton, StatusBadge } from "../riso/components";
import { contrastRatio } from "../../features/site/colorSchemes";
import { googleFontHref } from "../../features/site/fonts";
import { brandKitSummary, palettesFromColours, PERSONALITIES, type BrandKitChoice, type BrandPalette, type Personality } from "./brandKit";
import { HOME_LAYOUT_TEMPLATES } from "./homeLayouts";
import { logoColours } from "./logoColours";
import { mainUrl } from "./mediaLibrary";
import { useMediaPicker } from "./mediaPicker";
import { uploadErrorMessage, uploadStudioImage } from "./mediaUpload";

const STEPS = ["Logo", "Colours", "Personality", "Home page", "Review"] as const;

export function StudioBrandKit({ design, onPreview, onApply, onClose }: {
  design: any;
  /** Show this choice on the canvas (null = stop previewing). */
  onPreview: (choice: BrandKitChoice | null) => void;
  onApply: (choice: BrandKitChoice) => void;
  onClose: () => void;
}) {
  const media = useMediaPicker();
  const [step, setStep] = useState(0);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoNote, setLogoNote] = useState("");
  const [colours, setColours] = useState<string[]>([]);
  const [custom, setCustom] = useState("#e8402a");
  // A colour the owner picks with "Use this colour" wins over the one read from the logo.
  const [chosen, setChosen] = useState<string | null>(null);
  const palettes = useMemo(() => palettesFromColours(colours, chosen), [colours, chosen]);
  const [paletteId, setPaletteId] = useState<string | null>(null);
  const palette: BrandPalette = palettes.find(p => p.id === paletteId) || palettes[0];
  const [personality, setPersonality] = useState<Personality>(PERSONALITIES[0]);
  const homeCount = Array.isArray(design?.heroPage?.sections) ? design.heroPage.sections.length : 0;
  const [home, setHome] = useState<"keep" | "starter">(homeCount === 0 ? "starter" : "keep");
  const choice: BrandKitChoice = { logoUrl, palette, personality, home };
  const input = useRef<HTMLInputElement>(null);

  // The current logo's colours start the list, when the browser can read them.
  useEffect(() => {
    if (typeof design?.logoUrl !== "string" || !design.logoUrl) return;
    let live = true;
    void logoColours(design.logoUrl).then(found => { if (live && found?.length) setColours(c => c.length ? c : found); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview from the Colours step on; stop when the panel closes.
  const key = JSON.stringify([logoUrl, palette, personality.id, home]);
  useEffect(() => { if (step >= 1) onPreview(choice); }, [key, step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const readLogoFile = async (file: File) => {
    setLogoBusy(true); setLogoNote("");
    const [found] = await Promise.all([
      logoColours(file),
      (async () => {
        try { setLogoUrl(media?.status === "ready" ? mainUrl(await media.upload(file)) : await uploadStudioImage(file)); }
        catch (err) { setLogoNote(uploadErrorMessage(err)); }
      })(),
    ]);
    if (found?.length) { setColours(found); setChosen(null); setPaletteId(null); }
    else setLogoNote(n => n || "Couldn't read colours from this picture; pick a colour on the next step.");
    setLogoBusy(false);
  };
  const pickLogoFromLibrary = async () => {
    try {
      const item = await media?.choose("Choose your logo");
      if (!item) return;
      const url = mainUrl(item);
      setLogoUrl(url); setLogoNote("");
      const found = await logoColours(url);
      if (found?.length) { setColours(found); setChosen(null); setPaletteId(null); }
      else setLogoNote("Couldn't read colours from this picture; pick a colour on the next step.");
    } catch (err) { setLogoNote(uploadErrorMessage(err)); }
  };
  const layout = HOME_LAYOUT_TEMPLATES.find(t => t.id === personality.homeLayoutId);

  return (
    <div className="studio-library" role="dialog" aria-modal="false" aria-label="Brand kit" data-studio-brand-kit
      onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      {PERSONALITIES.map(p => <link key={p.id} rel="stylesheet" href={googleFontHref(p.headingFont)} />)}
      <div className="studio-library-head">
        <button type="button" className="studio-structure-switch" onClick={onClose}><ArrowLeft size={14} aria-hidden /> Close brand kit</button>
        <h2 className="studio-library-title">Brand kit</h2>
        <ol className="studio-brand-steps" aria-label="Steps">
          {STEPS.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined}>
            <button type="button" disabled={logoBusy} onClick={() => setStep(i)}>{i + 1}. {s}</button>
          </li>)}
        </ol>
        <p className="studio-hint">{step >= 1 ? "The preview shows your choices. Nothing changes in your draft until you apply them." : "Five quick steps for your logo, colours, type and Home page. You can change everything afterwards in Theme settings."}</p>
      </div>
      <div className="studio-library-body" data-brand-step={STEPS[step]}>
        {step === 0 && <section className="studio-library-group">
          <h3>Your logo</h3>
          <div className="studio-brand-logo">
            {logoUrl || design?.logoUrl ? <img src={logoUrl || design.logoUrl} alt="Logo" /> : <span className="studio-hint">No logo picture yet: your shop shows its text wordmark.</span>}
          </div>
          <input ref={input} type="file" accept="image/*" hidden aria-label="Upload your logo"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readLogoFile(f); }} />
          <div className="studio-inline-actions">
            <SecondaryButton size="sm" disabled={logoBusy} onClick={() => input.current?.click()}><ImageUp size={14} aria-hidden /> {logoBusy ? "Reading your logo…" : "Upload your logo"}</SecondaryButton>
            {media?.status === "ready" && <SecondaryButton size="sm" disabled={logoBusy} onClick={() => void pickLogoFromLibrary()}>Choose from library</SecondaryButton>}
          </div>
          {colours.length > 0 && <p className="studio-hint" role="status">Colours found: <span className="studio-brand-swatches">{colours.map(c => <i key={c} style={{ background: c }} title={c} />)}</span></p>}
          {logoNote && <p className="studio-hint" role="alert">{logoNote}</p>}
          <p className="studio-hint">No logo? Skip this step: the colours step has ready-made palettes and a colour picker.</p>
        </section>}

        {step === 1 && <section className="studio-library-group">
          <h3>Colours</h3>
          <label className="studio-brand-custom">Add your brand colour
            <input type="color" value={custom} onChange={e => setCustom(e.target.value)} aria-label="Brand colour" />
            <SecondaryButton size="sm" onClick={() => { setChosen(custom); setPaletteId("logo-light"); }}>Use this colour</SecondaryButton>
          </label>
          <div className="studio-library-grid" role="radiogroup" aria-label="Palette">
            {palettes.map(p => {
              const ratio = contrastRatio(p.text, p.bg) ?? 0;
              return <button key={p.id} type="button" role="radio" aria-checked={p.id === palette.id} className="studio-library-card" data-palette={p.id}
                onClick={() => setPaletteId(p.id)}>
                <span className="studio-brand-swatches studio-brand-swatches-lg">{[p.bg, p.text, p.accent].map((c, i) => <i key={i} style={{ background: c }} />)}</span>
                <span className="studio-library-name">{p.label}</span>
                <small><StatusBadge tone={ratio >= 7 ? "success" : "info"}>Text {ratio.toFixed(1)}:1</StatusBadge></small>
              </button>;
            })}
          </div>
        </section>}

        {step === 2 && <section className="studio-library-group">
          <h3>Personality</h3>
          <div className="studio-library-grid" role="radiogroup" aria-label="Personality">
            {PERSONALITIES.map(p => <button key={p.id} type="button" role="radio" aria-checked={p.id === personality.id} className="studio-library-card" data-personality={p.id}
              onClick={() => setPersonality(p)}>
              <span className="studio-brand-font" style={{ fontFamily: `"${p.headingFont}", serif`, textTransform: p.uppercase ? "uppercase" : undefined }}>{p.label}</span>
              <small>{p.blurb}</small>
              <small>{p.headingFont} · {p.bodyFont}</small>
            </button>)}
          </div>
        </section>}

        {step === 3 && <section className="studio-library-group">
          <h3>Home page</h3>
          <div className="studio-library-grid" role="radiogroup" aria-label="Home page">
            <button type="button" role="radio" aria-checked={home === "keep"} className="studio-library-card" data-home="keep" onClick={() => setHome("keep")}>
              <span className="studio-library-name">Keep my Home page</span>
              <small>{homeCount ? `Its ${homeCount} section${homeCount === 1 ? "" : "s"} stay; they take on the new colours and type.` : "Home stays empty for now."}</small>
            </button>
            {layout && <button type="button" role="radio" aria-checked={home === "starter"} className="studio-library-card" data-home="starter" onClick={() => setHome("starter")}>
              <span className="studio-library-name">Start from “{layout.name}”</span>
              <small>{layout.description}{homeCount ? ` Replaces your ${homeCount} current Home section${homeCount === 1 ? "" : "s"} (Undo brings them back).` : ""}</small>
            </button>}
          </div>
        </section>}

        {step === 4 && <section className="studio-library-group">
          <h3>Review</h3>
          <ul className="studio-health-list" data-brand-summary>
            {brandKitSummary(design, choice).map(line => <li key={line} className="studio-health-item"><div><span>{line}</span></div></li>)}
          </ul>
          <PrimaryButton disabled={logoBusy} onClick={() => onApply(choice)}>Apply brand kit</PrimaryButton>
          <p className="studio-hint">Applying changes your draft only. Undo (Ctrl/⌘+Z) takes it all back; Publish makes it live.</p>
        </section>}

        <div className="studio-inline-actions">
          {step > 0 && <SecondaryButton size="sm" onClick={() => setStep(s => s - 1)}>Back</SecondaryButton>}
          {step < STEPS.length - 1 && <PrimaryButton size="sm" disabled={logoBusy} onClick={() => setStep(s => s + 1)}>{step === 0 && !logoUrl ? "Skip to colours" : "Next"}</PrimaryButton>}
        </div>
      </div>
    </div>
  );
}
