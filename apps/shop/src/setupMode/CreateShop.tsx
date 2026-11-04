// Create my shop (code plan 18.8, polished): the review a press reads before its shop is made, and the timeline it sees
// while it's being made. One tick for the terms and one button; the platform starts the plan and queues the shop, and a
// refusal comes back in plain words with the press still in setup and everything kept. The words come from createShop.ts.
import { useState } from "react";
import { Check, Circle, Clock, Store } from "lucide-react";
import { GhostButton, PrimaryButton, SectionCard } from "../app/admin/riso/components";
import { useShopWords } from "../app/admin/shopWords";
import type { OpenedShop, PlanList, SetupPress } from "./door";
import { canCreate, createChecklist, makingSteps, priceWords, whatHappensNext, type CreateNames, type CreateRow } from "./launchWords";

export type CreateShop = (choice: { plan: SetupPress["plan"]; termsVersion: string }) => Promise<OpenedShop>;

export function CreateShopCard({ press, plans, names, email, termsUrl, createShop, onCreated, onOpen }: {
  press: SetupPress; plans: PlanList | null; names: CreateNames; email: string; termsUrl: string; createShop: CreateShop;
  onCreated: (press: SetupPress) => void; onOpen: (page: string) => void;
}) {
  const w = useShopWords();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState("");
  const [trialEnd, setTrialEnd] = useState<string | null>(null);

  if (press.status !== "setup") {
    return <BeingMade press={press} trialEnd={trialEnd} waiting={press.shopMessage || waiting} email={email} />;
  }

  const rows = createChecklist(press, plans, names);
  const ready = canCreate(rows) && agreed && !!plans?.termsVersion;
  const go = async () => {
    if (!ready || busy || !plans?.termsVersion) return;
    setBusy(true); setError("");
    try {
      const made = await createShop({ plan: press.plan, termsVersion: plans.termsVersion });
      if (made.shop?.message) setWaiting(made.shop.message);
      setTrialEnd(made.shop?.trialEnd ?? null);
      onCreated(made.press);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your shop wasn't created. Everything is kept. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="create-shop" style={{ scrollMarginTop: 16 }}>
    <SectionCard title="Create my shop" collapsible={false}>
      <div style={{ display: "grid", gap: 20, maxWidth: 640 }}>
        <section aria-labelledby="create-goes-in">
          <h3 id="create-goes-in" className="rp-card-title" style={{ fontSize: "var(--rp-text-base)", margin: "0 0 4px" }}>What goes into your shop</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map((row) => <ReviewRow key={row.id} row={row} w={w} onOpen={onOpen} />)}
          </ul>
        </section>

        <section aria-labelledby="create-next">
          <h3 id="create-next" className="rp-card-title" style={{ fontSize: "var(--rp-text-base)", margin: "0 0 8px" }}>What happens next</h3>
          <ol style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 6 }}>
            {whatHappensNext(press.plan).map((line) => <li key={line}>{line}</li>)}
          </ol>
        </section>

        <div style={{ display: "grid", gap: 12, borderTop: "2px solid var(--rp-text)", paddingTop: 16 }}>
          <p style={{ margin: 0 }}><strong>{priceWords(press, plans)}</strong></p>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 44, cursor: "pointer" }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, flex: "none" }} />
            <span>I agree to the <a href={termsUrl} target="_blank" rel="noreferrer">terms of service</a>.</span>
          </label>
          {error && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>}
          {/* Asked to wait (its country hasn't opened yet): still in setup, and it can press again later. */}
          {waiting && <p role="status" style={{ margin: 0 }}>{waiting}</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <PrimaryButton icon={<Store size={16} aria-hidden />} busy={busy} disabled={!ready || busy} onClick={() => void go()}>Create my shop</PrimaryButton>
            {!canCreate(rows) && <span className="rp-hint">Fill in what's marked above first.</span>}
            {canCreate(rows) && !agreed && <span className="rp-hint">Tick the terms to create your shop.</span>}
          </div>
        </div>
      </div>
    </SectionCard>
    </div>
  );
}

function ReviewRow({ row, w, onOpen }: { row: CreateRow; w: (words: string) => string; onOpen: (page: string) => void }) {
  const needed = row.state === "needed";
  return (
    <li style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr) auto", gap: 12, alignItems: "start", padding: "12px 0", borderTop: "1px solid var(--rp-divider)" }}>
      <span aria-hidden style={{ display: "inline-flex", paddingTop: 2, color: row.state === "done" ? "var(--rp-success)" : needed ? "var(--rp-danger)" : "var(--rp-text-subtle)" }}>
        {row.state === "done" ? <Check size={18} /> : <Circle size={16} />}
      </span>
      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <strong>{w(row.label)}{needed && <span style={{ color: "var(--rp-danger)", fontWeight: 600 }}> · needed</span>}</strong>
        <span className={row.state === "done" ? undefined : "rp-hint"} style={{ overflowWrap: "anywhere" }}>{w(row.value)}</span>
      </span>
      {/* The plan is picked on this same page: its button only scrolls up to the choice. */}
      <GhostButton size="sm" onClick={() => row.id === "plan" ? document.getElementById("plan-choice")?.scrollIntoView?.({ behavior: "smooth", block: "start" }) : onOpen(row.page)}>
        {row.change}
      </GhostButton>
    </li>
  );
}

/** While the shop is made: what's done, what's happening now and what comes next. Nothing on it can be pressed. */
function BeingMade({ press, trialEnd, waiting, email }: { press: SetupPress; trialEnd: string | null; waiting: string; email: string }) {
  const steps = makingSteps(press.plan, { trialEnd, waiting, email });
  return (
    <SectionCard title={waiting ? "Your shop is in line" : "Your shop is being made"} collapsible={false}>
      <div role="status" style={{ display: "grid", gap: 16, maxWidth: 640 }}>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
          {steps.map((step, i) => (
            <li key={step.id} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 12, paddingBottom: i < steps.length - 1 ? 16 : 0, position: "relative" }}>
              {i < steps.length - 1 && <span aria-hidden style={{ position: "absolute", left: 13, top: 28, bottom: 0, width: 2, background: "var(--rp-divider)" }} />}
              <span aria-hidden style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--rp-text)",
                background: step.state === "done" ? "var(--rp-success)" : step.state === "now" ? "var(--rp-primary-tint)" : "var(--rp-surface)",
                color: step.state === "done" ? "var(--rp-surface)" : "var(--rp-text)" }}>
                {step.state === "done" ? <Check size={16} /> : step.state === "now" ? <Clock size={14} /> : null}
              </span>
              <span style={{ display: "grid", gap: 2, minWidth: 0, paddingTop: 3 }}>
                <strong style={{ color: step.state === "next" ? "var(--rp-text-muted)" : undefined }}>
                  {step.title}<span className="rp-sr-only">{step.state === "done" ? " (done)" : step.state === "now" ? " (happening now)" : " (next)"}</span>
                </strong>
                <span className="rp-hint" style={{ overflowWrap: "anywhere" }}>{step.detail}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="rp-hint" style={{ margin: 0 }}>You can close this page. Nothing you set up is lost.</p>
      </div>
    </SectionCard>
  );
}
