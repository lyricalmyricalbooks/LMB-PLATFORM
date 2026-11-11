import { useState } from "react";
import { LoadingState, PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from "../riso/components";
import { openBlockers } from "../firstWeek";
import type { ReadinessItem } from "../launchReadiness";
import type { FinalCheckMarker } from "../finalCheckStage";

/**
 * Get started, the last step (plan 17.13): what is still missing, in plain words, the practice order (recommended, not required),
 * then Open my shop. `onOpenShop` takes the shop out of its private mode and resolves true when it has. "Finish later"
 * goes to the setup guide without recording anything, so the step comes back next time.
 */
/** Checks the final check suggests doing first, though they never stop the shop opening. */
const RECOMMENDED_FIRST = new Set(["sign-in"]);

export function FinalCheckStage({ readiness, address, onOpen, onOpenShop, onDone, onFinishLater }: {
  readiness: ReadinessItem[] | null;
  /** The shop's web address (its free one, or a name the press connected), shown so the press knows where it opens. */
  address?: string;
  onOpen?: (tab: string) => void;
  onOpenShop: () => Promise<boolean>;
  onDone: (finalCheck: FinalCheckMarker) => Promise<void>;
  onFinishLater: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const title = "Open your shop";
  if (readiness === null) return <SectionCard title={title} collapsible={false}><LoadingState label="Checking your shop…" /></SectionCard>;

  const blockers = openBlockers(readiness);
  // Not required to open, but worth doing first: today, protecting the owner's own sign-in.
  const recommended = readiness.filter(item => RECOMMENDED_FIRST.has(item.id) && item.status === "warn");

  const open = async () => {
    if (busy) return;
    setBusy(true); setError("");
    // Once the shop is open, a failed save of the step must not say it wasn't, and a retry only saves the step.
    if (!isOpen) {
      try {
        if (!(await onOpenShop())) throw new Error("not opened");
        setIsOpen(true);
      } catch {
        setError("Your shop couldn't be opened yet. Check the list above and try again.");
        setBusy(false);
        return;
      }
    }
    try {
      await onDone({ at: new Date().toISOString(), opened: true });
    } catch {
      setError("Your shop is open, but this step couldn't be saved. Check your connection and press the button again.");
      setBusy(false);
    }
  };

  return (
    <SectionCard title={title} description="Your shop stays private until you open it. Shoppers can't buy anything before then." collapsible={false}>
      {blockers.length > 0 ? (
        <section aria-label="Still to do">
          <h3 className="rp-card-title" style={{ fontSize: "var(--rp-text-base)", margin: "0 0 8px" }}>Still to do before you open</h3>
          <ul className="rp-run-todo">
            {blockers.map(item => (
              <li key={item.id}>
                <span><strong>{item.label}</strong>{item.detail && <span className="rp-hint">{item.detail}</span>}</span>
                <SecondaryButton size="sm" onClick={() => onOpen?.(item.tab)}>{item.action}</SecondaryButton>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <StatusBadge tone="success">Everything you need to start selling is in place</StatusBadge>
      )}

      {recommended.length > 0 && (
        <section aria-label="Recommended before you open" style={{ marginTop: 18 }}>
          <h3 className="rp-card-title" style={{ fontSize: "var(--rp-text-base)", margin: "0 0 8px" }}>Recommended before you open</h3>
          <ul className="rp-run-todo">
            {recommended.map(item => (
              <li key={item.id}>
                <span><strong>{item.label}</strong>{item.detail && <span className="rp-hint">{item.detail}</span>}</span>
                <SecondaryButton size="sm" onClick={() => onOpen?.(item.tab)}>{item.action}</SecondaryButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      {address && (
        <div className="rp-run-fact" style={{ marginTop: 18 }}>
          <span style={{ minWidth: 0 }}><span className="rp-run-fact-label">Your web address</span><span className="rp-mono" style={{ overflowWrap: "anywhere" }}>{address.replace(/^https?:\/\//, "")}</span></span>
          <SecondaryButton size="sm" onClick={() => onOpen?.("general")}>Change</SecondaryButton>
        </div>
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
      <p className="rp-hint" style={{ margin: "8px 0 0" }}>
        {blockers.length > 0
          ? `${blockers.length === 1 ? "Fix the one thing above" : `Fix the ${blockers.length} things above`}, then open your shop. Everything else can wait.`
          : "Shoppers can buy as soon as you press it. You can close the shop again any time."}
      </p>
    </SectionCard>
  );
}
