// The admin's Help page (`#help`; v4 mockup "Help: popular answers", Julian 14 November 2026: "make the help section
// more user friendly"). One page instead of the old Help & shortcuts window:
// - Learn the admin: the walkthrough (walkthrough/AdminTour.tsx), whole or one chapter.
// - Ask a person (platform shops): a person answers in writing.
// - Search and topics over the platform's own answers (help/articles.js, bundled, so it works offline), opening in
//   place with their steps and a button to the page they talk about.
// - Keyboard shortcuts, folded, for computers.
// Words follow the shop: a shop that doesn't sell books gets the answers in its own words (articlesFor).
import { useId, useMemo, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { TOPICS, articlesFor } from "@help/articles.js";
import { PageActions, PrimaryButton, SearchField, SecondaryButton } from "./riso/components";
import { helpList, topicsOf, wherePage, type HelpEntry } from "./helpAnswers";
import type { TourChapter } from "./walkthrough/tourSteps";
import { useShopWords } from "./shopWords";
import "./help.css";

export function HelpPage({ combined, sells, chapters, askUrl, helpCentreUrl, onTour, onOpen }: {
  combined: boolean; sells: string | null;
  /** The walkthrough's chapters, with the stop each one starts at. */ chapters: { id: TourChapter; label: string; start: number; count: number }[];
  /** The platform's Ask a person page and help centre (null off the platform). */ askUrl: string | null; helpCentreUrl: string | null;
  onTour: (start: number) => void; onOpen: (page: string) => void;
}) {
  const w = useShopWords();
  const list = useMemo<HelpEntry[]>(() => articlesFor(combined ? "both" : "shop", sells), [combined, sells]);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("All");
  const [open, setOpen] = useState("");
  const base = useId();
  const topics = topicsOf(TOPICS, list);
  const shown = helpList(list, { text, topic });
  const stops = chapters.reduce((n, c) => n + c.count, 0);

  return (
    <div className="rp-help-page">
      {askUrl && <PageActions><a className="rp-btn rp-btn-primary" href={askUrl}>Ask a person</a></PageActions>}

      <div className="rp-help-tiles">
        <section className="rp-help-tile" data-tone="mint" aria-labelledby={`${base}-tour`}>
          <span className="rp-help-kicker">Guided tour · {stops} stops</span>
          <h2 id={`${base}-tour`} className="rp-help-tile-title">Learn the admin</h2>
          <p className="rp-help-tile-text">We open each page and show you what it's for. About three minutes.</p>
          <div className="rp-help-chapters" role="group" aria-label="Start from a part">
            {chapters.map((c) => (
              <button key={c.id} type="button" className="rp-help-chip" onClick={() => onTour(c.start)}>{c.label}</button>
            ))}
          </div>
          <div><PrimaryButton onClick={() => onTour(0)}>Take the tour</PrimaryButton></div>
        </section>
        {askUrl ? (
          <section className="rp-help-tile" aria-labelledby={`${base}-ask`}>
            <span className="rp-help-kicker">Still stuck?</span>
            <h2 id={`${base}-ask`} className="rp-help-tile-title">Ask a person</h2>
            <p className="rp-help-tile-text">Tell us what's going on. A person writes back by email.</p>
            <div className="rp-help-tile-actions">
              <a className="rp-btn rp-btn-primary" href={askUrl}>Ask a person</a>
              {helpCentreUrl && <a className="rp-btn" href={helpCentreUrl} target="_blank" rel="noreferrer">Help centre<ExternalLink size={14} aria-hidden /><span className="rp-sr-only"> (opens in a new tab)</span></a>}
            </div>
          </section>
        ) : null}
      </div>

      <section className="rp-help-answers" aria-labelledby={`${base}-answers`}>
        <h2 id={`${base}-answers`} className="rp-help-head">Answers</h2>
        <SearchField label="Search the answers" className="rp-help-search" placeholder="Try “shipping” or “refund”" value={text}
          onChange={(e) => { setText(e.target.value); setOpen(""); }} />
        <div className="rp-help-topics" role="group" aria-label="Topics">
          {topics.map((t) => (
            <button key={t} type="button" className="rp-help-chip" aria-pressed={topic === t} onClick={() => { setTopic(t); setOpen(""); }}>{t}</button>
          ))}
        </div>
        <p className="rp-help-count" aria-live="polite">
          {shown.heading === "popular" ? "Popular answers" : `${shown.items.length} ${shown.items.length === 1 ? "answer" : "answers"}`}
        </p>
        {shown.items.length ? (
          <ul className="rp-help-list">
            {shown.items.map((a) => {
              const isOpen = open === a.id;
              const panel = `${base}-${a.id}`;
              const places = (a.where || []).flatMap((path) => {
                const page = wherePage(path, { combined });
                return page ? [{ path, page }] : [];
              });
              return (
                <li key={a.id} className="rp-help-item" data-open={isOpen || undefined}>
                  <button type="button" className="rp-help-q" aria-expanded={isOpen} aria-controls={panel} onClick={() => setOpen(isOpen ? "" : a.id)}>
                    <span>{a.question}</span><ChevronDown size={18} aria-hidden />
                  </button>
                  {isOpen && (
                    <div id={panel} className="rp-help-a">
                      {a.answer.map((line) => <p key={line}>{line}</p>)}
                      {a.steps?.length ? <ol>{a.steps.map((s) => <li key={s}>{s}</li>)}</ol> : null}
                      {places.length > 0 && (
                        <div className="rp-help-go">
                          {places.slice(0, 3).map((p) => <SecondaryButton key={p.path} size="sm" onClick={() => onOpen(p.page)}>Go to {p.path}</SecondaryButton>)}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rp-help-none">
            <p><strong>No answers for “{text.trim()}”.</strong> Try fewer words{askUrl ? ", or ask a person." : "."}</p>
            {askUrl && <a className="rp-btn" href={askUrl}>Ask a person</a>}
          </div>
        )}
      </section>

      <details className="rp-help-keys-card">
        <summary>Keyboard shortcuts<ChevronDown size={16} aria-hidden /></summary>
        <dl className="rp-help-keys">
          <dt><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd></dt><dd>{w("Find any page, book, order or customer.")}</dd>
          <dt><kbd>J</kbd> / <kbd>K</kbd></dt><dd>Orders: next or previous order.</dd>
          <dt><kbd>/</kbd></dt><dd>Orders: jump to the search box.</dd>
          <dt><kbd>Esc</kbd></dt><dd>Close any window.</dd>
          <dt><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>S</kbd></dt><dd>Studio: save your draft.</dd>
        </dl>
      </details>
    </div>
  );
}
