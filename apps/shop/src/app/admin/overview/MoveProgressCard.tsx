import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import type { FirstWeekDoc } from "../firstWeek";
import { MOVE_HIDDEN, moveSteps, moveUnfinished, movingShop, showMoveProgress, type MoveStep } from "../moveProgress";
import { GhostButton, SecondaryButton, SectionCard, StatusBadge } from "../riso/components";
import { jumpWhenShown } from "../settingsLayout";
import { useShopWords } from "../shopWords";

/**
 * Overview › Your move so far (plan 23.17): the five parts of an old shop that can come over, each ticked once its
 * bring-over window saved something, or by hand ("We had none") when the old shop had none. Shown under the setup
 * guide for a press that brought its shop with it. Put away with parts left, it leaves one line to show it again; with
 * every part done it says so once (plan 23.25), until closed.
 */
export function MoveProgressCard({ doc, setDoc, onOpen }: {
  doc: FirstWeekDoc;
  setDoc: (next: FirstWeekDoc) => void;
  onOpen?: (tab: string) => void;
}) {
  const w = useShopWords();
  const [saving, setSaving] = useState("");
  const movedIn = movingShop(doc) && !moveUnfinished(doc) && !doc.done?.[MOVE_HIDDEN];
  const [counts, setCounts] = useState<{ customers: number | null; giftCards: number | null; orders: number | null } | null>(null);
  useEffect(() => {
    if (!movedIn) return;
    let alive = true;
    adminApi.movedCounts().then((c) => { if (alive) setCounts(c); }).catch(() => {});
    return () => { alive = false; };
  }, [movedIn]);
  if (!movingShop(doc)) return null;

  const open = (s: MoveStep) => {
    if (!s.hash) return onOpen?.(s.tab);
    window.location.hash = s.hash;
    if (s.anchor) jumpWhenShown(s.anchor);
  };

  const tick = async (id: string) => {
    const at = new Date().toISOString();
    const before = doc;
    setDoc({ ...doc, done: { ...doc.done, [id]: at } }); setSaving(id);
    try { await adminApi.updateFirstWeek({ done: { [id]: at } }); }
    catch { setDoc(before); toast.error("That wasn't saved. Check your connection and try again."); }
    finally { setSaving(""); }
  };

  // Every part done (plan 23.25): one moment to say so, until the press closes it.
  if (!moveUnfinished(doc)) {
    if (doc.done?.[MOVE_HIDDEN]) return null;
    const links = moveSteps(doc).find((s) => s.id === "move-links")!;
    return (
      <SectionCard title="You're all moved in" description="Everything from your old shop has come over."
        actions={<StatusBadge tone="success">5 of 5 done</StatusBadge>}>
        <div className="rp-stack" style={{ gap: 12 }}>
          <p style={{ margin: 0 }}>{w("Books, customers, gift cards, past orders and your old links are all here. Anything you marked as “We had none” counts as done.")}</p>
          {counts && <MovedCounts counts={counts} />}
          <p className="rp-hint" style={{ margin: 0 }}>Before you point your web address here, check your old links once more, so no old link lands on page not found.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {onOpen && <SecondaryButton size="sm" onClick={() => open(links)}>{w(links.action)}</SecondaryButton>}
            <GhostButton size="sm" disabled={!!saving} onClick={() => void tick(MOVE_HIDDEN)}>Close</GhostButton>
          </div>
        </div>
      </SectionCard>
    );
  }

  if (!showMoveProgress(doc)) {
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
          {onOpen && <SecondaryButton size="sm" onClick={() => open(s)}>{w(s.action)}</SecondaryButton>}
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

/** "4 customers, 2 gift cards and 3 past orders came over." (plan 23.28): only the counts that read and aren't zero. */
function MovedCounts({ counts }: { counts: { customers: number | null; giftCards: number | null; orders: number | null } }) {
  const parts = ([[counts.customers, "customer", "customers"], [counts.giftCards, "gift card", "gift cards"], [counts.orders, "past order", "past orders"]] as const)
    .filter(([n]) => typeof n === "number" && n > 0)
    .map(([n, one, many]) => `${n!.toLocaleString("en")} ${n === 1 ? one : many}`);
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return <div><StatusBadge tone="success">{list} came over</StatusBadge></div>;
}
