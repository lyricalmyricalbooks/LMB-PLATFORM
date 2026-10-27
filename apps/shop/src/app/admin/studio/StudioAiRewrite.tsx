// Studio 3.0 phase 8 · "✦ Rewrite" under a text field: improve, shorten, lengthen, warm up, formalise or fix the
// owner's own words with the shop's free Gemini key (Settings › General › AI writing assistant). The answer replaces
// the field through its normal onChange, so it is one undoable Studio change; nothing is saved or published.
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { AiWriteError, askAi } from "../aiWriter";
import { SecondaryButton } from "../riso/components";
import { canRewrite, HOW_CHOICES, keepsTokens, normalizeRichText, protectRichText, restoreRichText, rewriteFormat, rewriteProblem, richTextSignature, type RewriteHow } from "./aiStudio";
import { sanitizeRichText } from "./richText";

export type StudioAiValue = {
  /** Called after a rewrite replaced a field (Studio adds the toast with Undo) or when one failed. `undo: true` = the
   *  Studio history step; a function = the field's own undo (Studio › Pages bodies aren't in Studio's history). */
  notify: (kind: "ok" | "err", text: string, opts?: { undo?: boolean | (() => void); needsKey?: boolean }) => void;
  siteName?: string;
};
export const StudioAiContext = createContext<StudioAiValue | null>(null);

/** Words only, to tell whether a field still holds the AI's version after its editor tidied the markup. */
const wordsOf = (html: string) => String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export function StudioAiRewrite({ kind, label, where, value, onChange, localUndo }: {
  kind: string; label: string; where?: string; value: unknown; onChange: (next: string) => void;
  /** The field isn't part of Studio's undo history (a custom page body): Undo puts the old words back itself. */
  localUndo?: boolean;
}) {
  const ai = useContext(StudioAiContext);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState("");
  const latest = useRef(value); latest.current = value;
  // The newest onChange: a block field's onChange rebuilds the block list from the section as it was rendered, so an
  // answer arriving seconds later must use the one from the latest render (or it would undo edits made meanwhile).
  const latestChange = useRef(onChange); latestChange.current = onChange;
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const menuId = useId();
  if (!ai || !canRewrite(kind, value)) return null;

  const run = async (how: RewriteHow) => {
    if (busy) return;
    const before = String(value);
    const format = rewriteFormat(kind);
    setOpen(false);
    const problem = rewriteProblem(kind, before);
    if (problem) { ai.notify("err", problem); return; }
    setBusy(true);
    try {
      // Pictures, videos, dividers and line layout never go to the AI: they're held out and put back afterwards.
      const guarded = format === "html" ? protectRichText(before) : null;
      const result = await askAi("rewrite", { text: guarded ? guarded.text : before, format, label, where: where || "", how, ...(how === "custom" ? { instruction: custom.trim() } : {}) }, { siteName: ai.siteName });
      let next = String(result.text || "");
      if (guarded) {
        const restored = restoreRichText(sanitizeRichText(next), guarded.held);
        if ("error" in restored) throw new AiWriteError(restored.error);
        next = restored.html;
      }
      if (!wordsOf(next)) throw new AiWriteError("The AI sent back an empty answer, so nothing was changed. Try again.");
      if (!keepsTokens(before, next)) throw new AiWriteError("The AI dropped a {placeholder} from the text, so nothing was changed. Try again.");
      // The owner kept typing while the AI worked: their words win.
      if (latest.current !== before) { ai.notify("err", `“${label}” changed while the AI was writing, so its answer was left out.`); return; }
      if (next === before || (guarded && next === normalizeRichText(before))) { ai.notify("ok", `The AI had nothing to change in “${label}”.`); return; }
      latestChange.current(next);
      const undo = localUndo
        ? () => {
          // Only while this field is still open and still says what the AI wrote: same words, pictures, links and line
          // layout (its editor may have tidied the markup since). Another page opened, or any later edit, wins.
          const same = format === "html" ? richTextSignature(String(latest.current ?? "")) === richTextSignature(next) : latest.current === next;
          if (!live.current || !same) { ai.notify("err", `“${label}” was edited or closed after the rewrite, so Undo left it as it is.`); return; }
          latestChange.current(before);
        }
        : true;
      ai.notify("ok", `Rewrote “${label}” with AI. Check it reads right; Undo puts the old words back.`, { undo });
      setCustom("");
    } catch (err) {
      ai.notify("err", err instanceof Error ? err.message : "The AI couldn't rewrite this. Try again.", { needsKey: err instanceof AiWriteError && err.needsKey });
    } finally {
      if (live.current) setBusy(false);
    }
  };

  return (
    <div className="studio-ai-rewrite" data-studio-ai-rewrite onKeyDown={e => { if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); } }}>
      <button type="button" className="studio-link-button" aria-expanded={open} aria-controls={menuId} disabled={busy}
        aria-label={`Rewrite ${label} with AI`} onClick={() => setOpen(o => !o)}>
        {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} aria-hidden />} {busy ? "Rewriting…" : "Rewrite with AI"}
      </button>
      {open && <div className="studio-ai-menu" id={menuId} role="group" aria-label={`Rewrite ${label}`}>
        <div className="studio-ai-choices">{HOW_CHOICES.map(c => <SecondaryButton key={c.how} size="sm" onClick={() => void run(c.how)}>{c.label}</SecondaryButton>)}</div>
        <form className="studio-ai-custom" onSubmit={e => { e.preventDefault(); if (custom.trim()) void run("custom"); }}>
          <input value={custom} maxLength={200} onChange={e => setCustom(e.target.value)} placeholder="Or tell it what to change…" aria-label="Tell the AI what to change" />
          <SecondaryButton size="sm" type="submit" disabled={!custom.trim()}>Go</SecondaryButton>
        </form>
        <small className="studio-hint">Sends only these words to the AI service set in Settings › General › AI writing assistant. Facts are never added on purpose: check prices, dates and names.</small>
      </div>}
    </div>
  );
}
