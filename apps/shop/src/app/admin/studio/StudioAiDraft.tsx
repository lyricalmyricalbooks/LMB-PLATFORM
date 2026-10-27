// Studio 3.0 phase 8 · Add section › "✦ Draft a section with AI": the owner says what a section should say, Gemini
// writes its words, and the draft shows on the page (preview only) until Add to page makes it one undoable change.
import { useContext, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { AiWriteError, askAi } from "../aiWriter";
import { PrimaryButton, SecondaryButton } from "../riso/components";
import { getBlocksKey, getSectionMeta } from "../ThemeEditorExtensions";
import { DRAFT_TYPES, sectionFromDraft } from "./aiStudio";
import { sanitizeRichText } from "./richText";
import { StudioAiContext } from "./StudioAiRewrite";
import type { Section } from "./studioModel";

export function StudioAiDraft({ onPreview, onAdd, startOpen = false }: { onPreview: (section: Section | null) => void; onAdd: (section: Section) => void; startOpen?: boolean }) {
  const ai = useContext(StudioAiContext);
  const types = Object.entries(DRAFT_TYPES);
  const [type, setType] = useState(types[0][0]);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Section | null>(null);
  const [error, setError] = useState<{ text: string; needsKey: boolean } | null>(null);
  const run = useRef(0);
  useEffect(() => () => { run.current++; onPreview(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const show = (next: Section | null) => { setDraft(next); onPreview(next); };
  const draftIt = async () => {
    if (busy || !brief.trim()) return;
    const mine = ++run.current;
    setBusy(true); setError(null);
    try {
      const result = await askAi("sectionDraft", { type, brief: brief.trim() }, { siteName: ai?.siteName });
      if (mine !== run.current) return;
      const section = sectionFromDraft(type, result, getSectionMeta as any, getBlocksKey, sanitizeRichText);
      if (!section) throw new AiWriteError("The AI's draft couldn't be used. Try again.");
      show(section);
    } catch (err) {
      if (mine === run.current) setError({ text: err instanceof Error ? err.message : "The AI couldn't draft this. Try again.", needsKey: err instanceof AiWriteError && err.needsKey });
    } finally {
      if (mine === run.current) setBusy(false);
    }
  };
  const settingsHref = `${window.location.pathname}${window.location.search}#settings/general`;

  return (
    <details className="studio-library-group studio-ai-draft" data-studio-ai-draft open={startOpen || undefined}>
      <summary><Sparkles size={14} aria-hidden /> Draft a section with AI</summary>
      <p className="studio-hint">Say what it should be about; the AI writes the words and the section shows on the page to try. Nothing is added until you choose Add to page. It never adds prices, dates, reviews or quotes you didn't give it.</p>
      <label className="studio-field">Kind of section
        <select value={type} disabled={busy} onChange={e => { setType(e.target.value); show(null); }} aria-label="Kind of section to draft">
          {types.map(([t, spec]) => <option key={t} value={t}>{spec.label}</option>)}
        </select>
      </label>
      <label className="studio-field">What should it say?
        <textarea value={brief} rows={3} maxLength={500} placeholder={DRAFT_TYPES[type]?.example} onChange={e => setBrief(e.target.value)} aria-label="What should the section say" />
      </label>
      <div className="studio-inline-actions">
        <SecondaryButton size="sm" disabled={busy || !brief.trim()} onClick={() => void draftIt()}>
          {busy ? <><Loader2 size={13} className="animate-spin" aria-hidden /> Drafting…</> : draft ? "Try again" : "Draft it"}
        </SecondaryButton>
        {draft && !busy && <>
          <PrimaryButton size="sm" onClick={() => { const s = draft; show(null); setBrief(""); onAdd(s); }}>Add to page</PrimaryButton>
          <button type="button" className="studio-link-button" onClick={() => show(null)}>Cancel</button>
        </>}
      </div>
      {draft && !busy && <p className="studio-hint" role="status">Showing the draft on the page. Read it through, then Add to page.</p>}
      {error && <p className="studio-hint" role="alert">{error.text}{error.needsKey && <> <a href={settingsHref} target="_blank" rel="noopener">Open AI settings</a></>}</p>}
    </details>
  );
}
