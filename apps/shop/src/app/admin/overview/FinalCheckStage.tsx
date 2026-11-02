import { useState } from "react";
import { LoadingState, PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from "../riso/components";
import { openBlockers } from "../firstWeek";
import type { ReadinessItem } from "../launchReadiness";
import type { FinalCheckMarker } from "../finalCheckStage";

/**
 * Get started, step 8 (plan 17.13): what is still missing, in plain words, the practice order (recommended, not required),
 * then Open my shop. `onOpenShop` takes the shop out of its private mode and resolves true when it has. "Finish later"
 * goes to the setup guide without recording anything, so the step comes back next time.
 */
export function FinalCheckStage({ readiness, onOpen, onOpenShop, onDone, onFinishLater }: {
  readiness: ReadinessItem[] | null;
  onOpen?: (tab: string) => void;
  onOpenShop: () => Promise<boolean>;
  onDone: (finalCheck: FinalCheckMarker) => Promise<void>;
  onFinishLater: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = "Get started · Step 8 of 8: final check and open";
  if (readiness === null) return <SectionCard title={title} collapsible={false}><LoadingState label="Checking your shop…" /></SectionCard>;

  const blockers = openBlockers(readiness);

  const open = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const opened = await onOpenShop();
      if (!opened) throw new Error("not opened");
      await onDone({ at: new Date().toISOString(), opened: true });
    } catch {
      setError("Your shop couldn't be opened yet. Check the list above and try again.");
      setBusy(false);
    }
  };

  return (
    <SectionCard title={title} description="Your shop stays private until you open it. Shoppers can't buy anything before then." collapsible={false}>
      {blockers.length > 0 ? (
        <section aria-label="Still to do">
          <h3 className="rp-card-title" style={{ fontSize: "var(--rp-text-base)", margin: "0 0 8px" }}>Still to do before you open</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
            {blockers.map(item => (
              <li key={item.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                <span><strong>{item.label}</strong>{item.detail && <span className="rp-hint"> · {item.detail}</span>}</span>
                <SecondaryButton size="sm" onClick={() => onOpen?.(item.tab)}>{item.action}</SecondaryButton>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <StatusBadge tone="success">Everything the check needs is in place</StatusBadge>
      )}

      <section aria-label="Practice order" style={{ marginTop: 18 }}>
        <p className="rp-hint" style={{ margin: 0 }}>
          We recommend placing a practice order first: it buys one item with the practice card, and no money moves.
          It isn't required.
        </p>
        <SecondaryButton size="sm" style={{ marginTop: 8 }} onClick={() => onOpen?.("payments")}>Open Payments</SecondaryButton>
      </section>

      {error && <p role="alert" className="rp-hint" style={{ margin: "14px 0 0", color: "var(--rp-danger)" }}>{error}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        {blockers.length === 0
          ? <PrimaryButton disabled={busy} onClick={open}>{busy ? "Opening…" : "Open my shop"}</PrimaryButton>
          : <PrimaryButton disabled>Open my shop</PrimaryButton>}
        <SecondaryButton disabled={busy} onClick={onFinishLater}>Finish later</SecondaryButton>
      </div>
    </SectionCard>
  );
}
