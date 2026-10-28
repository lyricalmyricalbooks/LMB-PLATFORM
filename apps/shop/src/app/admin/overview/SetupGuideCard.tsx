import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { firstWeekIntro, firstWeekSteps, guideParts, openBlockers, progressToSave, showFirstWeek, type FirstWeekDoc, type FirstWeekFacts, type FirstWeekStep } from "../firstWeek";
import { GhostButton, LoadingState, PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from "../riso/components";

/**
 * Overview › Set up your shop (plan 6.9). Eight steps ordered by the sign-up answer; the ones the shop can check tick
 * themselves, the web address the owner can tick. Three show at a time and the rest wait under Later. Open your shop
 * runs Ready to sell first and takes the under-construction wall down (`onSetWall`, Dashboard's own switch with its
 * confirm). The progress is saved for the platform's trial emails (plan 6.10). Hidden for good with "Hide this guide".
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
  const { now, later, done } = guideParts(steps);

  const row = (s: FirstWeekStep, i: number) => (
    <li key={s.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: i ? "1px solid var(--rp-border)" : undefined }}>
      <span aria-hidden className="rp-mono" style={{ minWidth: 24, fontWeight: 700 }}>{s.done ? <Check size={16} /> : `${steps.indexOf(s) + 1}.`}</span>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <strong style={s.done ? { textDecoration: "line-through", opacity: 0.7 } : undefined}>{s.title}</strong>
        <span className="rp-sr-only">{s.done ? " (done)" : ""}</span>
        {!s.done && <p className="rp-hint" style={{ margin: "4px 0 0" }}>{s.why}</p>}
        {!s.done && s.id === "open" && blocked && (blocked.length
          ? <div role="alert" style={{ marginTop: 8 }}>
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
          : null)}
      </div>
      {!s.done && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {s.id === "open"
            ? <PrimaryButton size="sm" busy={saving === "open"} disabled={!!saving || !onSetWall} onClick={() => void openShop()}>{s.action}</PrimaryButton>
            : s.tab && onOpen && <SecondaryButton size="sm" onClick={() => onOpen(s.tab!)}>{s.action}</SecondaryButton>}
          {s.kind === "manual" && <GhostButton size="sm" disabled={saving === s.id} onClick={() => tick(s.id)}>{s.id === "address" ? "Keep the free address" : "Mark done"}</GhostButton>}
        </div>
      )}
    </li>
  );

  return (
    <SectionCard title="Set up your shop" description={firstWeekIntro(doc)}
      actions={<>{!loading && <StatusBadge tone={doneCount === total ? "success" : "info"}>{doneCount} of {total} done</StatusBadge>}
        <GhostButton size="sm" disabled={!!saving} onClick={hide}>Hide this guide</GhostButton></>}>
      {loading ? <LoadingState label="Checking your shop…" /> : <>
        <ol aria-label="Next steps" style={{ margin: 0, padding: 0, listStyle: "none" }}>{now.map(row)}</ol>
        {later.length > 0 && (
          <details style={{ marginTop: 8, borderTop: "1px solid var(--rp-border)", paddingTop: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 32, display: "flex", alignItems: "center" }}>Later ({later.length})</summary>
            <ol aria-label="Later steps" style={{ margin: 0, padding: 0, listStyle: "none" }}>{later.map(row)}</ol>
          </details>
        )}
        {done.length > 0 && (
          <details style={{ marginTop: 8, borderTop: "1px solid var(--rp-border)", paddingTop: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 32, display: "flex", alignItems: "center" }}>Done ({done.length})</summary>
            <ol aria-label="Done steps" style={{ margin: 0, padding: 0, listStyle: "none" }}>{done.map(row)}</ol>
          </details>
        )}
      </>}
    </SectionCard>
  );
}
