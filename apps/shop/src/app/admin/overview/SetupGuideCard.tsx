import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { GROUPS, addedSince, firstWeekIntro, firstWeekSteps, guideGroups, nextStep, openBlockers, progressToSave, showFirstWeek, type FirstWeekDoc, type FirstWeekFacts, type FirstWeekStep } from "../firstWeek";
import { GhostButton, LoadingState, PrimaryButton, StatusBadge } from "../riso/components";
import "./setupBoard.css";
import { jumpWhenShown } from "../settingsLayout";

/**
 * Overview › Set up your shop (plan 6.9, regrouped as code plan 28; laid out as a board of tiles from the design
 * handoff "Shop setup (bento)", 10 November 2026). The next step has its own ink tile with why it matters and its
 * button; beside it, what still stops a sale and Open my shop. Under them the parts (Your shop, Ready to sell, Launch,
 * Reach more shoppers) as tiles, one row per step that opens on a click, and done steps tick themselves from the shop. Open your shop runs Ready to sell first and takes the
 * under-construction wall down (`onSetWall`, Dashboard's own switch with its confirm). The progress is saved for the
 * platform's trial emails (plan 6.10). Hidden for good with "Hide this guide". Same rows as setup mode's guide
 * (setupMode/SetupAdmin.tsx), so the guide a press met before its shop existed carries on the same way.
 */
export function SetupGuideCard({ doc, setDoc, facts, onOpen, onSetWall }: {
  doc: FirstWeekDoc;
  setDoc: (next: FirstWeekDoc) => void;
  /** Null parts are still loading. */
  facts: FirstWeekFacts;
  onOpen?: (tab: string) => void;
  onSetWall?: (on: boolean) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState("");
  const [blocked, setBlocked] = useState<ReturnType<typeof openBlockers> | null>(null);
  // The row the press opened itself (rows open only on a click: the next step has its own tile). `pickedDone`: it was done
  // already when opened (to Change it), so it stays open; a row that gets done while open gives way to the next.
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedDone, setPickedDone] = useState(false);
  const loading = !facts.books || !facts.readiness || facts.settings === undefined;
  const steps = useMemo(() => firstWeekSteps(doc, facts), [doc, facts]);
  const savedProgress = useRef("");
  // Steps new since the press last saw the guide, fixed when the card first shows: saving the progress below makes
  // them old for the next visit, not while the press is looking.
  const [added] = useState(() => addedSince(doc, steps));

  // The platform reads the progress for the trial emails: saved once the facts are in, and again only when it changes.
  useEffect(() => {
    if (loading) return;
    const progress = progressToSave(doc, steps, new Date().toISOString());
    if (!progress) return;
    const key = `${progress.steps.join()}|${progress.done.join()}`;
    if (savedProgress.current === key) return;
    savedProgress.current = key;
    adminApi.updateFirstWeek({ progress }).catch(() => { savedProgress.current = ""; });
  }, [loading, doc, steps]);

  if (!showFirstWeek(doc, steps, added) && !loading) return null;

  const change = async (what: string, next: FirstWeekDoc, write: Parameters<typeof adminApi.updateFirstWeek>[0]) => {
    const before = doc;
    setDoc(next); setSaving(what);
    try { await adminApi.updateFirstWeek(write); }
    catch { setDoc(before); toast.error("That wasn't saved. Check your connection and try again."); }
    finally { setSaving(""); }
  };
  const tick = (id: string) => {
    const at = new Date().toISOString();
    setPicked(null);
    void change(id, { ...doc, done: { ...doc.done, [id]: at } }, { done: { [id]: at } });
  };
  const hide = () => {
    const at = new Date().toISOString();
    void change("hide", { ...doc, hiddenAt: at }, { hiddenAt: at });
  };
  const openShop = async () => {
    const blockers = openBlockers(facts.readiness);
    setBlocked(blockers);
    if (blockers.length || !onSetWall) return;
    setSaving("open");
    try { await onSetWall(false); } finally { setSaving(""); }
  };

  // A step that names a sub tab and a card opens right at it (the policies, say); others open their page.
  const go = (s: FirstWeekStep) => {
    if (s.hash) { window.location.hash = s.hash; if (s.anchor) jumpWhenShown(s.anchor); return; }
    if (s.tab) onOpen?.(s.tab);
  };

  // "3 of 12 done" counts every row shown, optional ones too, as setup mode's guide does.
  const total = steps.length;
  const doneCount = steps.filter(s => s.done).length;
  const next = nextStep(steps);
  // The new steps still to do: a tag on each row and one line above the parts.
  const fresh = new Set(added.filter(id => steps.some(s => s.id === id && !s.done)));
  const freshTitles = steps.filter(s => fresh.has(s.id)).map(s => s.title);
  const pickedStep = steps.find(s => s.id === picked);
  // A picked step that got done closes, so finishing a step moves the guide on.
  const shown = pickedStep && (!pickedStep.done || pickedDone) ? pickedStep.id : "";

  const groupOf = (s: FirstWeekStep) => GROUPS.find(g => g.id === s.group)?.title ?? "";
  // What stops a sale, shown before the press asks, so Open my shop never surprises (Ready to sell's blocks).
  const blockers = loading ? [] : openBlockers(facts.readiness);
  const openStep = steps.find(s => s.id === "open");

  const row = (s: FirstWeekStep) => {
    const isOpen = s.id === shown;
    const isNext = s.id === next?.id;
    const panel = `setup-step-${s.id}`;
    return (
      <li key={s.id} className="rp-sb-step" aria-current={isNext ? "step" : undefined} data-open={isOpen} data-done={s.done} data-next={isNext && !s.done}>
        <button type="button" aria-expanded={isOpen} aria-controls={panel} onClick={() => { setPicked(isOpen ? "" : s.id); setPickedDone(s.done); }}>
          <span className="rp-sb-dot" aria-hidden>{s.done && <Check size={12} strokeWidth={3} />}</span>
          <span style={{ minWidth: 0 }}>
            <strong className="rp-sb-step-title" style={{ fontWeight: "inherit" }}>{s.title}</strong>
            {fresh.has(s.id) && <>{" "}<StatusBadge tone="info" glyph={false}>New</StatusBadge></>}
            <span className="rp-sr-only">{s.done ? " (done)" : isNext ? " (next)" : ""}</span>
          </span>
          {s.optional && !s.done ? <span className="rp-sb-tag">Optional</span> : <span />}
        </button>
        {isOpen && (
          <div id={panel} className="rp-sb-panel">
            {!s.done && <p>{s.why}</p>}
            {s.id === "open" && !s.done && blocked && blocked.length > 0 && (
              <div role="alert">
                <p style={{ color: "var(--rp-danger)" }}>Not yet: {blocked.length === 1 ? "one thing needs" : `${blocked.length} things need`} fixing before shoppers can buy.</p>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {blocked.map(b => (
                    <li key={b.id} className="rp-hint" style={{ marginTop: 4 }}>
                      {b.label}{" "}
                      {onOpen && b.tab && <GhostButton size="sm" onClick={() => onOpen(b.tab)}>{b.action || "Open"}</GhostButton>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              {s.id === "open"
                ? !s.done && <PrimaryButton size="sm" busy={saving === "open"} disabled={!!saving || !onSetWall} onClick={() => void openShop()}>{s.action}</PrimaryButton>
                : (s.hash || (s.tab && onOpen)) && (s.done
                  ? <GhostButton size="sm" onClick={() => go(s)}>Change</GhostButton>
                  : <PrimaryButton size="sm" onClick={() => go(s)}>{s.action}</PrimaryButton>)}
              {s.kind === "manual" && !s.done && <GhostButton size="sm" disabled={saving === s.id} onClick={() => tick(s.id)}>{s.tickLabel || "Mark done"}</GhostButton>}
            </div>
          </div>
        )}
      </li>
    );
  };

  // The next step's own tile: the open step names its blockers there instead of a page to go to.
  const nextTile = next && (
    <section className="rp-sb-tile rp-sb-big rp-sb-next" aria-labelledby="setup-next-title">
      <p className="rp-sb-eyebrow">Next · {groupOf(next)}</p>
      <h2 id="setup-next-title">{next.title}</h2>
      <p>{next.why}</p>
      <div className="rp-sb-actions">
        {next.id === "open"
          ? <button type="button" className="rp-sb-go" disabled={!!saving || !onSetWall} onClick={() => void openShop()}>{next.action}</button>
          : (next.hash || (next.tab && onOpen)) && <button type="button" className="rp-sb-go" onClick={() => go(next)}>{next.action}</button>}
        {next.kind === "manual" && <button type="button" className="rp-sb-link" disabled={saving === next.id} onClick={() => tick(next.id)}>{next.tickLabel || "Mark done"}</button>}
      </div>
    </section>
  );
  const openTile = openStep && !openStep.done && (
    <section className="rp-sb-tile rp-sb-big" aria-labelledby="setup-open-title">
      <p className="rp-sb-eyebrow">Open your shop</p>
      <h2 id="setup-open-title">{blockers.length === 0 ? "Ready to open" : blockers.length === 1 ? "1 thing to do before a sale" : `${blockers.length} things to do before a sale`}</h2>
      {blockers.length > 0
        ? <ul className="rp-sb-blockers">{blockers.map(b => <li key={b.id}>{onOpen && b.tab ? <button type="button" onClick={() => onOpen(b.tab)}>{b.label}</button> : b.label}</li>)}</ul>
        : <p style={{ color: "var(--rp-text-muted)" }}>Shoppers can buy as soon as you open it.</p>}
      <div className="rp-sb-actions">
        <PrimaryButton busy={saving === "open"} disabled={blockers.length > 0 || !!saving || !onSetWall} onClick={() => void openShop()}>Open my shop</PrimaryButton>
      </div>
    </section>
  );

  return (
    <div className="rp-sb" role="region" aria-labelledby="setup-title">
      <header className="rp-sb-head">
        <div>
          <p className="rp-sb-eyebrow">Private · only you can see it</p>
          <h2 id="setup-title" className="rp-sb-title">Set up your shop</h2>
          <p className="rp-sb-lede">{firstWeekIntro(doc)}</p>
        </div>
        <div className="rp-sb-count">
          {!loading && <span><span aria-hidden>{doneCount} / {total}</span><span className="rp-sr-only">{doneCount} of {total} done.</span></span>}
          <GhostButton size="sm" disabled={!!saving} onClick={hide}>Hide this guide</GhostButton>
        </div>
      </header>
      {loading ? <LoadingState label="Checking your shop…" /> : <>
        <div className="rp-sb-bar" role="progressbar" aria-label="Set up your shop" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount}>
          <span style={{ width: `${(doneCount / total) * 100}%` }} />
        </div>
        {freshTitles.length > 0 && (
          <p className="rp-hint" style={{ margin: 0 }}>
            <strong>{freshTitles.length === 1 ? "A new step" : `${freshTitles.length} new steps`}:</strong> {listWords(freshTitles)}.
          </p>
        )}
        {(nextTile || openTile) && <div className="rp-sb-row" style={nextTile && openTile ? undefined : { gridTemplateColumns: "minmax(0, 1fr)" }}>{nextTile}{openTile}</div>}
        <div className="rp-sb-groups">
          {guideGroups(steps).map(g => (
            <section key={g.id} className="rp-sb-tile rp-sb-group" aria-labelledby={`setup-group-${g.id}`}>
              <h3 id={`setup-group-${g.id}`} className="rp-sb-group-head">
                <span>{g.title}</span><span>{g.done}/{g.total}<span className="rp-sr-only"> done</span></span>
              </h3>
              <ol aria-label={g.title} className="rp-sb-steps">{g.steps.map(row)}</ol>
            </section>
          ))}
        </div>
      </>}
    </div>
  );
}

/** "a", "a and b", "a, b and c". */
const listWords = (items: string[]) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
