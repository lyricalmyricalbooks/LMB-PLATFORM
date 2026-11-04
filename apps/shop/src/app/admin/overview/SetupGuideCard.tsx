import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Circle } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { firstWeekIntro, firstWeekSteps, guideGroups, nextStep, openBlockers, progressToSave, showFirstWeek, type FirstWeekDoc, type FirstWeekFacts, type FirstWeekStep } from "../firstWeek";
import { GhostButton, LoadingState, PrimaryButton, SectionCard } from "../riso/components";

/**
 * Overview › Set up your shop (plan 6.9, regrouped as code plan 28). The steps in three parts (Your shop, Ready to sell,
 * Launch), one row each, Shopify-style: the next step opens with why it matters and its button, any other opens on a
 * click, and done steps tick themselves from the shop. Open your shop runs Ready to sell first and takes the
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
  // The row the press opened itself; null follows the next step, "" closes every row.
  const [picked, setPicked] = useState<string | null>(null);
  const loading = !facts.books || !facts.readiness || facts.settings === undefined;
  const steps = useMemo(() => firstWeekSteps(doc, facts), [doc, facts]);
  const savedProgress = useRef("");

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

  if (!showFirstWeek(doc, steps) && !loading) return null;

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

  const total = steps.length;
  const doneCount = steps.filter(s => s.done).length;
  const next = nextStep(steps);
  const pickedStep = steps.find(s => s.id === picked);
  // A picked step that got done gives way to the next one, so finishing a step moves the guide on.
  const shown = picked === "" ? "" : pickedStep && !pickedStep.done ? pickedStep.id : next?.id ?? "";

  const row = (s: FirstWeekStep) => {
    const isOpen = s.id === shown;
    const isNext = s.id === next?.id;
    const panel = `setup-step-${s.id}`;
    return (
      <li key={s.id} aria-current={isNext ? "step" : undefined}
        style={{ borderTop: "1px solid var(--rp-divider)", margin: "0 -12px", padding: "0 12px", background: isOpen ? "var(--rp-primary-tint)" : undefined }}>
        <button type="button" aria-expanded={isOpen} aria-controls={panel} onClick={() => setPicked(isOpen ? "" : s.id)}
          style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr) auto", alignItems: "center", gap: 12, width: "100%", minHeight: 48,
            padding: "12px 0", background: "none", border: 0, color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer" }}>
          <span aria-hidden style={{ display: "inline-flex", color: s.done ? "var(--rp-success)" : isNext ? "var(--rp-text)" : "var(--rp-text-subtle)" }}>
            {s.done ? <Check size={20} /> : <Circle size={18} />}
          </span>
          <span style={{ minWidth: 0 }}>
            <strong style={{ color: s.done ? "var(--rp-text-muted)" : undefined }}>{s.title}</strong>
            {s.optional && !s.done && <span className="rp-hint"> · optional</span>}
            <span className="rp-sr-only">{s.done ? " (done)" : isNext ? " (next)" : ""}</span>
          </span>
          <ChevronDown size={18} aria-hidden style={{ transform: isOpen ? "rotate(180deg)" : undefined, color: "var(--rp-text-subtle)" }} />
        </button>
        {isOpen && (
          <div id={panel} style={{ display: "grid", gap: 10, padding: "0 0 16px 32px" }}>
            {!s.done && <p className="rp-hint" style={{ margin: 0 }}>{s.why}</p>}
            {s.id === "open" && !s.done && blocked && blocked.length > 0 && (
              <div role="alert">
                <p className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>Not yet: {blocked.length === 1 ? "one thing needs" : `${blocked.length} things need`} fixing before shoppers can buy.</p>
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
                : s.tab && onOpen && (s.done
                  ? <GhostButton size="sm" onClick={() => onOpen(s.tab!)}>Change</GhostButton>
                  : <PrimaryButton size="sm" onClick={() => onOpen(s.tab!)}>{s.action}</PrimaryButton>)}
              {s.kind === "manual" && !s.done && <GhostButton size="sm" disabled={saving === s.id} onClick={() => tick(s.id)}>{s.id === "address" ? "Keep the free address" : "Mark done"}</GhostButton>}
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <SectionCard title="Set up your shop" collapsible={false}
      description={loading ? firstWeekIntro(doc) : `${firstWeekIntro(doc)} ${doneCount} of ${total} done.`}
      actions={<GhostButton size="sm" disabled={!!saving} onClick={hide}>Hide this guide</GhostButton>}>
      {loading ? <LoadingState label="Checking your shop…" /> : <>
        <div role="progressbar" aria-label="Set up your shop" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount}
          style={{ height: 6, background: "var(--rp-divider)", marginBottom: 4 }}>
          <div style={{ width: `${(doneCount / total) * 100}%`, height: "100%", background: "var(--rp-primary)" }} />
        </div>
        {guideGroups(steps).map(g => (
          <section key={g.id} aria-labelledby={`setup-group-${g.id}`} style={{ marginTop: 16 }}>
            <h3 id={`setup-group-${g.id}`} className="rp-mono"
              style={{ display: "flex", justifyContent: "space-between", gap: 8, margin: "0 0 4px", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--rp-text-muted)" }}>
              <span>{g.title}</span><span>{g.done}/{g.steps.length}<span className="rp-sr-only"> done</span></span>
            </h3>
            <ol aria-label={g.title} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>{g.steps.map(row)}</ol>
          </section>
        ))}
      </>}
    </SectionCard>
  );
}
