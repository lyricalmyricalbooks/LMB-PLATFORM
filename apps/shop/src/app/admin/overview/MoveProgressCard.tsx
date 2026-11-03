import { useState } from "react";
import { Check } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import type { FirstWeekDoc } from "../firstWeek";
import { MOVE_HIDDEN, moveSteps, moveUnfinished, showMoveProgress, type MoveStep } from "../moveProgress";
import { GhostButton, SecondaryButton, SectionCard, StatusBadge } from "../riso/components";
import { useShopWords } from "../shopWords";

/**
 * Overview › Your move so far (plan 23.17): the five parts of an old shop that can come over, each ticked once its
 * bring-over window saved something, or by hand ("We had none") when the old shop had none. Shown under the setup
 * guide for a press that brought its shop with it, until every part is done. Put away with parts left, it leaves one
 * line to show it again.
 */
export function MoveProgressCard({ doc, setDoc, onOpen }: {
  doc: FirstWeekDoc;
  setDoc: (next: FirstWeekDoc) => void;
  onOpen?: (tab: string) => void;
}) {
  const w = useShopWords();
  const [saving, setSaving] = useState("");
  if (!showMoveProgress(doc)) {
    if (!moveUnfinished(doc)) return null;
    // Put away with parts still left (plan 23.19): one quiet line brings it back.
    const reopen = async () => {
      const before = doc;
      const done = { ...doc.done };
      delete done[MOVE_HIDDEN];
      setDoc({ ...doc, done }); setSaving(MOVE_HIDDEN);
      try { await adminApi.untickFirstWeek(MOVE_HIDDEN); }
      catch { setDoc(before); toast.error("That wasn't saved. Check your connection and try again."); }
      finally { setSaving(""); }
    };
    return (
      <p className="rp-hint" style={{ margin: "0 0 16px" }}>
        Your move so far is hidden.{" "}
        <GhostButton size="sm" disabled={!!saving} onClick={() => void reopen()}>Show it again</GhostButton>
      </p>
    );
  }
  const steps = moveSteps(doc);
  const doneCount = steps.filter((s) => s.done).length;

  const tick = async (id: string) => {
    const at = new Date().toISOString();
    const before = doc;
    setDoc({ ...doc, done: { ...doc.done, [id]: at } }); setSaving(id);
    try { await adminApi.updateFirstWeek({ done: { [id]: at } }); }
    catch { setDoc(before); toast.error("That wasn't saved. Check your connection and try again."); }
    finally { setSaving(""); }
  };

  const row = (s: MoveStep, i: number) => (
    <li key={s.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: i ? "1px solid var(--rp-border)" : undefined }}>
      <span aria-hidden className="rp-mono" style={{ minWidth: 24, fontWeight: 700 }}>{s.done ? <Check size={16} /> : `${i + 1}.`}</span>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <strong style={s.done ? { textDecoration: "line-through", opacity: 0.7 } : undefined}>{w(s.title)}</strong>
        <span className="rp-sr-only">{s.done ? " (done)" : ""}</span>
        {!s.done && <p className="rp-hint" style={{ margin: "4px 0 0" }}>{w(s.why)}</p>}
      </div>
      {!s.done && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {onOpen && <SecondaryButton size="sm" onClick={() => onOpen(s.tab)}>{w(s.action)}</SecondaryButton>}
          <GhostButton size="sm" disabled={!!saving} onClick={() => void tick(s.id)}>We had none</GhostButton>
        </div>
      )}
    </li>
  );

  return (
    <SectionCard title="Your move so far" description="What has come over from your old shop. Each part is optional and safe to repeat."
      actions={<><StatusBadge tone="info">{doneCount} of {steps.length} done</StatusBadge>
        <GhostButton size="sm" disabled={!!saving} onClick={() => void tick(MOVE_HIDDEN)}>Hide this list</GhostButton></>}>
      <ol aria-label="Parts of your old shop" style={{ margin: 0, padding: 0, listStyle: "none" }}>{steps.map(row)}</ol>
    </SectionCard>
  );
}
