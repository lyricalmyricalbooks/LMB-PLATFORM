// The admin's Help page (`#help`). Julian, 14 November 2026: the help was "needlessly complicated" and needs to be
// "designed better and clearer". So it works like asking someone: one big box on a mint tile, the best answer shown in
// full right under it (steps + a button to the page), a few other matches as one-line links, and two buttons at the
// foot: take the tour, ask a person. Answers are the platform's own (help/articles.js, bundled), in the shop's words.
import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { articlesFor } from "@help/articles.js";
import { PrimaryButton } from "./riso/components";
import { helpList, wherePage, type HelpEntry } from "./helpAnswers";
import "./help.css";

export function HelpPage({ combined, sells, askUrl, onTour, onOpen }: {
  combined: boolean; sells: string | null;
  /** The platform's Ask a person page (null off the platform). */ askUrl: string | null;
  onTour: (start: number) => void; onOpen: (page: string) => void;
}) {
  const list = useMemo<HelpEntry[]>(() => articlesFor(combined ? "both" : "shop", sells), [combined, sells]);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState("");
  const typed = text.trim();
  const found = helpList(list, { text, topic: "All" }).items;
  const best = found.find((a) => a.id === picked) ?? (typed ? found[0] : undefined);
  const others = (typed ? found : found.slice(0, 4)).filter((a) => a !== best).slice(0, typed ? 4 : 4);
  const page = best && (best.where || []).map((p) => ({ path: p, page: wherePage(p, { combined }) })).find((p) => p.page);

  return (
    <div className="rp-help-page">
      <section className="rp-help-ask" aria-label="Ask a question">
        <h2 className="rp-help-ask-title">What do you need help with?</h2>
        <label className="rp-help-box">
          <Search size={20} aria-hidden />
          <span className="rp-sr-only">Your question</span>
          <input type="text" value={text} placeholder="e.g. How do I set shipping prices?" autoFocus
            onChange={(e) => { setText(e.target.value); setPicked(""); }} />
        </label>
        {askUrl && <p className="rp-help-ask-person">Rather talk to someone? <a href={askUrl}>Ask a person</a> and we'll write back by email.</p>}
      </section>

      {best && (
        <article className="rp-help-answer" aria-live="polite">
          <h3>{best.question}</h3>
          {best.answer.map((line) => <p key={line}>{line}</p>)}
          {best.steps?.length ? <ol>{best.steps.map((s) => <li key={s}>{s}</li>)}</ol> : null}
          {page?.page && <div><PrimaryButton size="sm" onClick={() => onOpen(page.page!)}>Go to {page.path}</PrimaryButton></div>}
        </article>
      )}

      {typed && !best && (
        <article className="rp-help-answer rp-help-answer-none" aria-live="polite">
          <h3>We don't have an answer for that yet.</h3>
          <p>{askUrl ? "Ask a person and we'll write back by email." : "Try fewer words."}</p>
        </article>
      )}

      {others.length > 0 && (
        <nav className="rp-help-more" aria-label={typed ? "Other answers" : "Common questions"}>
          <h3>{typed ? "Other answers" : "Common questions"}</h3>
          <ul>
            {others.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => setPicked(a.id)}><span>{a.question}</span><ArrowRight size={16} aria-hidden /></button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="rp-help-foot">
        <a className="rp-btn" href="#help" onClick={(e) => { e.preventDefault(); onTour(0); }}>Take the tour</a>
        {askUrl && <a className="rp-btn" href={askUrl}>Ask a person</a>}
      </div>
    </div>
  );
}
