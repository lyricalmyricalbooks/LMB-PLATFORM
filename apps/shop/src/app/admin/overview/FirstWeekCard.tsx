import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { firstWeekIntro, firstWeekSteps, showFirstWeek, type FirstWeekDoc } from "../firstWeek";
import type { ReadinessItem } from "../launchReadiness";
import { GhostButton, SecondaryButton, SectionCard, StatusBadge } from "../riso/components";

/**
 * Overview › Your first week (plan 3.3). Steps shaped by the sign-up answer; the ones the shop can check tick
 * themselves, the rest the owner ticks. Hidden for good with "Hide this list", and gone once every step is done.
 */
export function FirstWeekCard({ books, readiness, onOpen }: { books: any[] | null; readiness: ReadinessItem[] | null; onOpen?: (tab: string) => void }) {
  const [doc, setDoc] = useState<FirstWeekDoc | null>(null);
  const [saving, setSaving] = useState("");
  useEffect(() => {
    let live = true;
    adminApi.getFirstWeek().then(d => { if (live) setDoc(d); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const steps = useMemo(() => (doc ? firstWeekSteps(doc, { books, readiness }) : []), [doc, books, readiness]);
  if (!doc || !showFirstWeek(doc, steps)) return null;

  const left = steps.filter(s => !s.done).length;
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

  return (
    <SectionCard title="Your first week" description={firstWeekIntro(doc)}
      actions={<><StatusBadge tone={left ? "info" : "success"}>{steps.length - left} of {steps.length} done</StatusBadge>
        <GhostButton size="sm" disabled={!!saving} onClick={hide}>Hide this list</GhostButton></>}>
      <ol aria-label="First week steps" style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 0 }}>
        {steps.map((s, i) => (
          <li key={s.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: i ? "1px solid var(--rp-border)" : undefined }}>
            <span aria-hidden className="rp-mono" style={{ minWidth: 24, fontWeight: 700 }}>{s.done ? <Check size={16} /> : `${i + 1}.`}</span>
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <strong style={s.done ? { textDecoration: "line-through", opacity: 0.7 } : undefined}>{s.title}</strong>
              <span className="rp-sr-only">{s.done ? " (done)" : ""}</span>
              {!s.done && <p className="rp-hint" style={{ margin: "4px 0 0" }}>{s.why}</p>}
            </div>
            {!s.done && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {s.tab && onOpen && <SecondaryButton size="sm" onClick={() => onOpen(s.tab!)}>{s.action}</SecondaryButton>}
                {s.kind === "manual" && <GhostButton size="sm" disabled={saving === s.id} onClick={() => tick(s.id)}>Mark done</GhostButton>}
              </div>
            )}
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
