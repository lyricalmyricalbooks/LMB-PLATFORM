// Make it yours (round three phase 3, 25 November 2026): the four steps Studio opens on right after a new shop picks its
// starter. Each click changes the draft at once (one undoable change, named for Undo), so the real preview beside the
// panel shows it; nothing reaches shoppers until Publish. The rules are in makeItYours.ts.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";
import { PrimaryButton, SecondaryButton, StatusBadge } from "../riso/components";
import { googleFontHref } from "../../features/site/fonts";
import { adminApi } from "../api";
import { aiWriterAvailable, askAi, AiWriteError } from "../aiWriter";
import { brandAccent } from "./brandKit";
import { logoColours } from "./logoColours";
import { PAGE_STARTERS, pageFromStarter } from "./pageStarters";
import type { StarterPhotos } from "./presetContent";
import type { SectionMetaLookup } from "./starterDesign";
import type { SetupItem } from "./setupChecklist";
import {
  MAKE_STEPS, applyColours, applyFonts, applyHomeShape, colourChoices, currentColour, currentFonts, currentHomeShape, fontChoices,
  hasOpening, homeShapes, pageChoices, untouchedStarterPage, withOpeningWords,
} from "./makeItYours";

type Change = (fn: (d: any) => any, meta: { label: string }) => void;
type Say = (tone: "ok" | "err", text: string) => void;

export function StudioMakeItYours({ design, sells, words, meta, samples, change, nameField, logoField, pages, setPages, say, nextFour, onGo, onClose, siteName }: {
  design: any;
  sells?: string | null;
  /** The shop's own nouns (books, products or services) for the sections a homepage shape adds. */
  words: (text: string) => string;
  meta: SectionMetaLookup;
  samples?: StarterPhotos;
  change: Change;
  /** Text & labels › Site name and Style › Logo, the same fields as everywhere else in Studio. */
  nameField: ReactNode;
  logoField: ReactNode;
  pages: any[];
  setPages: (fn: (p: any[]) => any[]) => void;
  say: Say;
  /** The four things left (makeItYours `nextFour`), each with Studio's usual Show me. */
  nextFour: SetupItem[];
  onGo: (item: SetupItem) => void;
  onClose: () => void;
  siteName?: string;
}) {
  const [step, setStep] = useState(0);
  const done = step >= MAKE_STEPS.length;
  // Each step starts at its top, under the step list, however far the last one was scrolled.
  const root = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    try { root.current?.scrollIntoView({ block: "start" }); } catch { /* old browsers keep the place */ }
  }, [step]);
  // The logo's colours, read in the browser whenever the logo changes (none: the colour step shows the styles only).
  const [logo, setLogo] = useState<string[] | null>(null);
  useEffect(() => {
    const url = typeof design?.logoUrl === "string" ? design.logoUrl : "";
    if (!url) { setLogo(null); return; }
    let live = true;
    void logoColours(url).then((found) => { if (live) setLogo(found && brandAccent(found) ? found : null); });
    return () => { live = false; };
  }, [design?.logoUrl]);
  const colours = useMemo(() => colourChoices(design, logo), [design?.themeBase?.id, logo]); // eslint-disable-line react-hooks/exhaustive-deps
  const fonts = useMemo(() => fontChoices(design), [design?.themeBase?.id, design?.themeBase?.style]); // eslint-disable-line react-hooks/exhaustive-deps
  const shapes = useMemo(() => homeShapes(design, sells), [design?.themeBase?.id, design?.themeBase?.style, sells]); // eslint-disable-line react-hooks/exhaustive-deps
  const [fontsPicked, setFontsPicked] = useState(false);
  const colourNow = currentColour(design, colours);
  const fontNow = currentFonts(design, fonts);
  const shapeNow = currentHomeShape(design, shapes);

  // Write my words: the owner's sentence on the homepage's opening, or the AI's headline and line from it.
  const [sentence, setSentence] = useState("");
  const [writing, setWriting] = useState(false);
  const ai = aiWriterAvailable();
  const writeWords = async () => {
    const brief = sentence.trim();
    if (!brief || writing) return;
    if (!ai) { change((d) => withOpeningWords(d, { intro: brief }), { label: "Put your words on the homepage" }); say("ok", "Your words are on the homepage. Undo takes them back."); return; }
    setWriting(true);
    try {
      const result = await askAi("starterWords", { brief }, { siteName });
      change((d) => withOpeningWords(d, { headline: String(result.headline || ""), intro: String(result.intro || brief) }), { label: "Write my words" });
      say("ok", "Your homepage headline and opening line are drafted. Edit them in the preview, or Undo.");
    } catch (err) {
      say("err", err instanceof AiWriteError ? err.message : "The words couldn't be written just now. Try again.");
    } finally { setWriting(false); }
  };

  // Pages: a tick adds the page as a draft; taking it off removes it only while it is still the untouched starter.
  const [pageBusy, setPageBusy] = useState("");
  const togglePage = async (id: string) => {
    const starter = PAGE_STARTERS.find((s) => s.id === id);
    if (!starter || pageBusy) return;
    const existing = pages.find((p) => p.slug === starter.slug);
    setPageBusy(id);
    try {
      if (!existing) {
        const created = await adminApi.createPage(pageFromStarter(starter, pages));
        setPages((prev) => [...prev, created]);
      } else if (untouchedStarterPage(existing, starter.body)) {
        await adminApi.deletePage(existing.id);
        setPages((prev) => prev.filter((p) => p.id !== existing.id));
      }
    } catch { say("err", `“${starter.label}” couldn't be changed just now. Try again, or use Pages.`); }
    finally { setPageBusy(""); }
  };

  const card = (on: boolean) => ({ role: "radio" as const, "aria-checked": on, className: "studio-library-card studio-make-card" });
  // A small page in the style's own colours and the shop's heading font: its page, words and accent.
  const swatches = ([bg, text, accent]: string[]) => (
    <span className="studio-make-swatch" aria-hidden style={{ background: bg, color: text, fontFamily: design?.headingFont ? `"${design.headingFont}", serif` : undefined }}>
      <b>Aa</b><i style={{ background: accent }} /><i style={{ background: text, opacity: 0.25 }} />
    </span>
  );
  const left = nextFour.filter((i) => !i.done).length;

  return (
    <div ref={root} className="studio-library studio-make" role="region" aria-label="Make it yours" data-studio-make-it-yours
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      {fonts.map((f) => <link key={f.id} rel="stylesheet" href={googleFontHref(f.heading)} />)}
      <div className="studio-library-head">
        <button type="button" className="studio-structure-switch" onClick={onClose}><ArrowLeft size={14} aria-hidden /> {done ? "Close" : "Skip for now"}</button>
        <h2 className="studio-library-title">Make it yours</h2>
        <ol className="studio-make-steps" aria-label="Steps">
          {MAKE_STEPS.map((s, i) => <li key={s.id} aria-current={i === step ? "step" : undefined} data-done={i < step || undefined}>
            <button type="button" onClick={() => setStep(i)}><span aria-hidden>{i < step ? <Check size={12} /> : i + 1}</span>{s.title}</button>
          </li>)}
        </ol>
        <p className="studio-hint">{done ? "Your shop is set up. Everything stays changeable in Studio." : MAKE_STEPS[step].hint}</p>
      </div>
      <div className="studio-library-body" data-make-step={done ? "done" : MAKE_STEPS[step].id}>
        {step === 0 && <section className="studio-library-group">
          {nameField}
          {logoField}
          {hasOpening(design) && <div className="studio-make-words" data-make-words>
            <h3><Sparkles size={14} aria-hidden /> {ai ? "Write my words" : "Your words on the homepage"} <span className="studio-hint">Optional</span></h3>
            <label className="studio-field">Your shop in one sentence
              <textarea rows={2} maxLength={300} value={sentence} onChange={(e) => setSentence(e.target.value)}
                placeholder="We make small-batch ceramics for everyday use, fired in our studio by the river." />
            </label>
            <SecondaryButton size="sm" disabled={!sentence.trim() || writing} onClick={() => void writeWords()}>
              {writing ? <><Loader2 size={13} className="animate-spin" aria-hidden /> Writing…</> : ai ? "Write my words" : "Put it on my homepage"}
            </SecondaryButton>
            <p className="studio-hint">{ai ? "Drafts your homepage headline and opening line from your sentence." : "Your sentence goes under the homepage headline."} Undo takes it back.</p>
          </div>}
        </section>}

        {step === 1 && <section className="studio-library-group">
          {colours.length ? <>
            <div className="studio-library-grid" role="radiogroup" aria-label="Styles">
              {colours.filter((c) => !c.yours).map((c) => <button key={c.id} type="button" {...card(colourNow === c.id)} data-make-colour={c.id}
                onClick={() => change((d) => applyColours(d, c, meta, fontsPicked), { label: `Use the ${c.name} colours` })}>
                {swatches(c.swatches)}<span className="studio-library-name">{c.name}</span>
              </button>)}
            </div>
            {colours.some((c) => c.yours) ? <>
              <h3>In your logo's colour</h3>
              <div className="studio-library-grid" role="radiogroup" aria-label="Styles in your logo's colour">
                {colours.filter((c) => c.yours).map((c) => <button key={c.id} type="button" {...card(colourNow === c.id)} data-make-colour={c.id}
                  onClick={() => change((d) => applyColours(d, c, meta, fontsPicked), { label: `Use ${c.name}` })}>
                  {swatches(c.swatches)}<span className="studio-library-name">{c.name}</span>
                </button>)}
              </div>
            </> : <p className="studio-hint">Add a logo in the first step and three more styles appear here, made from its colour.</p>}
          </> : <p className="studio-hint">This look has no other styles. Change any colour under Style › Colours.</p>}
        </section>}

        {step === 2 && <section className="studio-library-group">
          <div className="studio-library-grid" role="radiogroup" aria-label="Fonts">
            {fonts.map((f) => <button key={f.id} type="button" {...card(fontNow === f.id)} data-make-fonts={f.id}
              onClick={() => { setFontsPicked(true); change((d) => applyFonts(d, f), { label: `Use ${f.heading} and ${f.body}` }); }}>
              <span className="studio-make-font" style={{ fontFamily: `"${f.heading}", serif`, fontWeight: f.headingWeight }}>Aa {f.label}</span>
              <small>{f.heading} · {f.body}</small>
            </button>)}
          </div>
        </section>}

        {step === 3 && <section className="studio-library-group">
          <h3>Pages</h3>
          <ul className="studio-make-pages">
            {pageChoices(sells).map((id) => {
              const starter = PAGE_STARTERS.find((s) => s.id === id)!;
              const existing = pages.find((p) => p.slug === starter.slug);
              const locked = !!existing && !untouchedStarterPage(existing, starter.body);
              return <li key={id}>
                <label className="studio-toggle-row" data-make-page={id}>
                  <input type="checkbox" checked={!!existing} disabled={locked || !!pageBusy} onChange={() => void togglePage(id)} />
                  <span><b>{starter.label}</b><small>{locked ? "You've written on this page, so it stays. Remove it in Pages." : starter.summary}</small></span>
                  {pageBusy === id && <Loader2 size={13} className="animate-spin" aria-label="Saving" />}
                </label>
              </li>;
            })}
          </ul>
          <p className="studio-hint">New pages start as drafts with prompts to replace. They go live when you publish them in Pages.</p>
          {shapes.length > 1 && <>
            <h3>Homepage</h3>
            <div className="studio-library-grid" role="radiogroup" aria-label="Homepage layout">
              {shapes.map((s) => <button key={s.id} type="button" {...card(shapeNow === s.id)} data-make-home={s.id}
                onClick={() => change((d) => applyHomeShape(d, s, meta, words, samples), { label: `Homepage: ${s.label}` })}>
                <span className="studio-make-shape" aria-hidden>{s.sections.map((_, i) => <i key={i} />)}</span>
                <span className="studio-library-name">{s.label}</span>
                <small>{s.hint}</small>
              </button>)}
            </div>
            <p className="studio-hint">A new layout replaces the homepage's sections. Undo brings them back.</p>
          </>}
        </section>}

        {done && <section className="studio-library-group" data-make-next>
          <h3>{left ? `${left} ${left === 1 ? "thing" : "things"} left before you open` : "Ready when you are"}</h3>
          <ul className="studio-health-list">
            {nextFour.map((item) => <li key={item.id} className="studio-health-item" data-make-next-item={item.id}>
              <div>
                <span>{item.done ? <StatusBadge tone="success">Done</StatusBadge> : null} <b>{item.title}</b></span>
                <small>{item.detail}</small>
              </div>
              {!item.done && item.go && <SecondaryButton size="sm" onClick={() => onGo(item)}>{item.id === "publish" ? "Publish" : "Show me"}</SecondaryButton>}
            </li>)}
          </ul>
        </section>}

        <div className="studio-inline-actions">
          {step > 0 && <SecondaryButton size="sm" onClick={() => setStep((s) => s - 1)}>Back</SecondaryButton>}
          {!done && <PrimaryButton size="sm" onClick={() => setStep((s) => s + 1)}>{step === MAKE_STEPS.length - 1 ? "Finish" : "Next"}</PrimaryButton>}
          {done && <PrimaryButton size="sm" onClick={onClose}>Back to Studio</PrimaryButton>}
        </div>
      </div>
    </div>
  );
}
