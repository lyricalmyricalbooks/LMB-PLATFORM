// The admin's Help page (`#help`). Julian, 14 November 2026: the help was "needlessly complicated" and needs to be
// "designed better and clearer". So it works like asking someone: one big box on a mint tile, the best answer shown in
// full right under it (steps + a button to the page), a few other matches as one-line links, and two buttons at the
// foot: take the tour, ask a person. Answers are the platform's own (help/articles.js, bundled), in the shop's words.
// Then "keep beefing this feature up, use best practises for help sections": help for the page you came from first,
// "Did this answer your question?" with a way to a person that carries the question, related answers on the same
// topic, every answer one click away (See all answers, by topic), and "/" jumps to the box from anywhere on the page.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { articlesFor } from "@help/articles.js";
import { PrimaryButton } from "./riso/components";
import { answersForPage, askWith, helpList, relatedTo, wherePage, type HelpEntry } from "./helpAnswers";
import "./help.css";

export function HelpPage({ combined, sells, askUrl, fromPage, fromLabel, onTour, onOpen }: {
  combined: boolean; sells: string | null;
  /** The platform's Ask a person page (null off the platform). */ askUrl: string | null;
  /** The admin page the owner opened Help from, and its menu name. */ fromPage?: string | null; fromLabel?: string | null;
  onTour: (start: number) => void; onOpen: (page: string) => void;
}) {
  const list = useMemo<HelpEntry[]>(() => articlesFor(combined ? "both" : "shop", sells), [combined, sells]);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState("");
  const [all, setAll] = useState(false);
  const [vote, setVote] = useState<Record<string, "yes" | "no">>({});
  const box = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      e.preventDefault(); box.current?.focus();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const typed = text.trim();
  const found = helpList(list, { text, topic: "All" }).items;
  const here = answersForPage(list, fromPage, { combined });
  const best = list.find((a) => a.id === picked) ?? (typed ? found[0] : undefined);
  const others = (typed ? found : best ? relatedTo(list, best) : here.length ? here : found).filter((a) => a !== best).slice(0, 4);
  const othersTitle = typed ? "Other answers" : best ? "Related" : here.length && fromLabel ? `Help with ${fromLabel}` : "Common questions";
  const page = best && (best.where || []).map((p) => ({ path: p, page: wherePage(p, { combined }) })).find((p) => p.page);
  const askHref = askUrl ? askWith(askUrl, typed || best?.question || "") : null;
  const topics = useMemo(() => [...new Set(list.map((a) => a.topic))], [list]);

  const open = (id: string) => {
    setPicked(id); setAll(false);
    requestAnimationFrame(() => answerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  return (
    <div className="rp-help-page">
      <section className="rp-help-ask" aria-label="Ask a question">
        <h2 className="rp-help-ask-title">What do you need help with?</h2>
        <label className="rp-help-box">
          <Search size={20} aria-hidden />
          <span className="rp-sr-only">Your question</span>
          <input ref={box} type="text" value={text} placeholder="e.g. How do I set shipping prices?" autoFocus
            onChange={(e) => { setText(e.target.value); setPicked(""); setAll(false); }}
            onKeyDown={(e) => { if (e.key === "Escape" && text) { e.preventDefault(); setText(""); setPicked(""); } }} />
          {text && <button type="button" className="rp-help-clear" onClick={() => { setText(""); setPicked(""); box.current?.focus(); }}>Clear</button>}
        </label>
        {askHref && <p className="rp-help-ask-person">Rather talk to someone? <a href={askHref}>Ask a person</a> and we'll write back by email.</p>}
      </section>

      {best && (
        <article className="rp-help-answer" aria-live="polite" ref={answerRef}>
          <p className="rp-help-topic">{best.topic}</p>
          <h3>{best.question}</h3>
          {best.answer.map((line) => <p key={line}>{line}</p>)}
          {best.steps?.length ? <ol>{best.steps.map((s) => <li key={s}>{s}</li>)}</ol> : null}
          {page?.page && <div><PrimaryButton size="sm" onClick={() => onOpen(page.page!)}>Go to {page.path}</PrimaryButton></div>}
          <div className="rp-help-vote" role="group" aria-label="Did this answer your question?">
            {!vote[best.id] && <>
              <span>Did this answer your question?</span>
              <button type="button" onClick={() => setVote({ ...vote, [best.id]: "yes" })}>Yes</button>
              <button type="button" onClick={() => setVote({ ...vote, [best.id]: "no" })}>No</button>
            </>}
            {vote[best.id] === "yes" && <span role="status">Glad it helped.</span>}
            {vote[best.id] === "no" && <span role="status">
              {askHref ? <>Sorry about that. <a href={askHref}>Ask a person</a> and we'll sort it out by email.</> : "Sorry about that. Try asking another way."}
            </span>}
          </div>
        </article>
      )}

      {typed && !best && (
        <article className="rp-help-answer rp-help-answer-none" aria-live="polite">
          <h3>We don't have an answer for that yet.</h3>
          <p>{askHref ? <>Try other words, or <a href={askHref}>ask a person</a> and we'll write back by email.</> : "Try fewer or other words."}</p>
        </article>
      )}

      {!all && others.length > 0 && (
        <nav className="rp-help-more" aria-label={othersTitle}>
          <h3>{othersTitle}</h3>
          <AnswerLinks items={others} onPick={open} />
          <button type="button" className="rp-help-all" onClick={() => setAll(true)}>See all answers</button>
        </nav>
      )}

      {all && (
        <nav className="rp-help-more" aria-label="All answers">
          {topics.map((t) => (
            <section key={t} className="rp-help-group">
              <h3>{t}</h3>
              <AnswerLinks items={list.filter((a) => a.topic === t)} onPick={open} />
            </section>
          ))}
          <button type="button" className="rp-help-all" onClick={() => setAll(false)}>Show less</button>
        </nav>
      )}

      <div className="rp-help-foot">
        <a className="rp-btn" href="#help" onClick={(e) => { e.preventDefault(); onTour(0); }}>Take the tour</a>
        {askHref && <a className="rp-btn" href={askHref}>Ask a person</a>}
      </div>
    </div>
  );
}

function AnswerLinks({ items, onPick }: { items: HelpEntry[]; onPick: (id: string) => void }) {
  return (
    <ul>
      {items.map((a) => (
        <li key={a.id}>
          <button type="button" onClick={() => onPick(a.id)}><span>{a.question}</span><ArrowRight size={16} aria-hidden /></button>
        </li>
      ))}
    </ul>
  );
}
