// The admin's Help page (`#help`). Julian, 14 November 2026: "still needlessly complicated". So: one search box, a short
// list of the most useful answers that open in place (steps + a button to the page), and two plain lines at the foot:
// take the tour, ask a person. Answers are the platform's own (help/articles.js, bundled), in the shop's own words.
import { useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { articlesFor } from "@help/articles.js";
import { SearchField, SecondaryButton } from "./riso/components";
import { helpList, wherePage, type HelpEntry } from "./helpAnswers";
import "./help.css";

export function HelpPage({ combined, sells, askUrl, onTour, onOpen }: {
  combined: boolean; sells: string | null;
  /** The platform's Ask a person page (null off the platform). */ askUrl: string | null;
  onTour: (start: number) => void; onOpen: (page: string) => void;
}) {
  const list = useMemo<HelpEntry[]>(() => articlesFor(combined ? "both" : "shop", sells), [combined, sells]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState("");
  const base = useId();
  const shown = helpList(list, { text, topic: "All" });

  return (
    <div className="rp-help-page">
      <SearchField label="Search help" className="rp-help-search" placeholder="Search help" value={text}
        onChange={(e) => { setText(e.target.value); setOpen(""); }} />
      {shown.items.length ? (
        <ul className="rp-help-list" aria-live="polite">
          {shown.items.map((a) => {
            const isOpen = open === a.id;
            const panel = `${base}-${a.id}`;
            const page = (a.where || []).map((p) => ({ path: p, page: wherePage(p, { combined }) })).find((p) => p.page);
            return (
              <li key={a.id} className="rp-help-item" data-open={isOpen || undefined}>
                <button type="button" className="rp-help-q" aria-expanded={isOpen} aria-controls={panel} onClick={() => setOpen(isOpen ? "" : a.id)}>
                  <span>{a.question}</span><ChevronDown size={18} aria-hidden />
                </button>
                {isOpen && (
                  <div id={panel} className="rp-help-a">
                    {a.answer.map((line) => <p key={line}>{line}</p>)}
                    {a.steps?.length ? <ol>{a.steps.map((s) => <li key={s}>{s}</li>)}</ol> : null}
                    {page?.page && <div><SecondaryButton size="sm" onClick={() => onOpen(page.page!)}>Go to {page.path}</SecondaryButton></div>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rp-help-none">Nothing found for “{text.trim()}”. Try one word.</p>
      )}
      <p className="rp-help-foot">
        <button type="button" className="rp-help-link" onClick={() => onTour(0)}>Take the tour</button>
        {askUrl && <> · <a className="rp-help-link" href={askUrl}>Ask a person</a></>}
      </p>
    </div>
  );
}
