import { useEffect, useRef, useState } from "react";
import { DestructiveButton, Dialog, PrimaryButton, SecondaryButton, SectionCard, SelectField, TextArea } from "./riso/components";
import { DownloadShopButton } from "./DownloadShopCard";
import { Problem, useBillingStatus, useChange } from "./BillingHub";
import { LEAVING_CHOICES, billingCall } from "./platformBilling";
import { hubReady, planDate, storesPage, type PlatformPlan } from "./platformPlan";
import { CLOSING_STEPS, closeShopStage, type CloseStage } from "./closeShop";

// Settings › Billing › Close your shop (#settings/billing/close): the one place a press leaves from. Three numbered
// steps, always shown whatever state the plan is in: download everything, cancel the plan, and what happens after
// (the closing timeline Julian chose, services/billing/closing.js). Pure words and the stage rule are in closeShop.ts;
// closeShop.test.ts keeps this card on the Billing page so the way out can't quietly disappear again.

type HubPlan = PlatformPlan & { hub: string; shopId: string };

/** Step 2 on a shop whose plan the admin manages: cancel, or keep a plan that's already cancelled. */
function CancelStep({ plan, onStage }: { plan: HubPlan; onStage: (stage: CloseStage) => void }) {
  const { answer, error, load } = useBillingStatus(plan);
  const change = useChange(load);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [words, setWords] = useState("");
  const billing = answer?.billing ?? null;
  const stage = closeShopStage(billing, { loaded: !!answer, failed: !answer && !!error });
  useEffect(() => { onStage(stage); }, [stage]);

  const cancel = async () => {
    const done = await change.run("cancel", () => billingCall(plan, "cancel", { reason: reason || undefined, words: words.trim() || undefined }));
    if (done !== undefined) setOpen(false);
  };
  const ends = billing ? planDate(billing.cancelEndsAt ?? (billing.status === "trialing" ? billing.trialEnd : billing.currentPeriodEnd)) : "";

  return (
    <>
      {stage === "loading" && <p className="rp-hint" style={{ margin: 0 }}>Reading your plan…</p>}
      {stage === "unknown" && (
        <div className="rp-stack" style={{ gap: 8 }}>
          <p className="rp-hint" style={{ margin: 0 }}>Your plan couldn't be read just now.</p>
          <div><SecondaryButton size="sm" onClick={() => void load()}>Try again</SecondaryButton></div>
        </div>
      )}
      {stage === "none" && <p className="rp-hint" style={{ margin: 0 }}>No plan is running, so there's nothing to cancel.</p>}
      {stage === "open" && (
        <div><DestructiveButton onClick={() => { change.clear(); setOpen(true); }}>Cancel plan</DestructiveButton></div>
      )}
      {stage === "cancelled" && (
        <div className="rp-stack" style={{ gap: 8 }}>
          <p style={{ margin: 0 }}><strong>{`Cancelled. Your shop stays open until ${ends}.`}</strong></p>
          <div><PrimaryButton size="sm" busy={change.busy === "keep"} onClick={() => void change.run("keep", () => billingCall(plan, "keep"))}>Keep my plan</PrimaryButton></div>
        </div>
      )}
      {stage === "closed" && <p style={{ margin: 0 }}><strong>Your shop is closed.</strong></p>}
      {!open && <Problem error={change.error} />}

      <Dialog open={open} onClose={() => setOpen(false)} title="Cancel your plan?"
        description={`Nothing is deleted today. Your shop stays open until ${ends}.`}
        footer={<>
          <SecondaryButton onClick={() => setOpen(false)}>Keep my plan</SecondaryButton>
          <DestructiveButton busy={change.busy === "cancel"} onClick={() => void cancel()}>Cancel plan</DestructiveButton>
        </>}>
        <div className="rp-stack" style={{ gap: 12 }}>
          <SelectField label="Why are you leaving? (optional)" value={reason} onChange={(e) => setReason(e.target.value)}>
            {LEAVING_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </SelectField>
          <TextArea label="Anything we could do better? (optional)" maxLength={500} value={words} onChange={(e) => setWords(e.target.value)} rows={3} />
          <Problem error={change.error} />
        </div>
      </Dialog>
    </>
  );
}

/** The whole way out: download, cancel, what happens after. `plan` is null on a shop with no plan document. */
export function CloseShopCard({ plan, focus }: { plan: PlatformPlan | null; focus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<CloseStage>(hubReady(plan) ? "loading" : plan?.state === "closed" ? "closed" : "none");
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);
  const account = storesPage(plan);

  return (
    <div ref={ref} id="close-shop" data-close-shop={stage} style={{ scrollMarginTop: 24 }}>
      <SectionCard title="Close your shop" description="Take everything with you, then cancel. Three steps." collapsible={false}>
        <ol className="rp-close-steps">
          <li>
            <span className="rp-close-num" aria-hidden="true">1</span>
            <div className="rp-stack" style={{ gap: 8 }}>
              <strong>Download your shop</strong>
              <p className="rp-hint" style={{ margin: 0 }}>Products, customers, orders, pages, settings and photos in one zip.</p>
              <DownloadShopButton />
            </div>
          </li>
          <li>
            <span className="rp-close-num" aria-hidden="true">2</span>
            <div className="rp-stack" style={{ gap: 8 }}>
              <strong>Cancel your plan</strong>
              {hubReady(plan)
                ? <CancelStep plan={plan} onStage={setStage} />
                : plan?.link
                  ? <div><a className="rp-btn rp-btn-secondary rp-btn-sm" href={plan.link}>Cancel on your account page</a></div>
                  : <p className="rp-hint" style={{ margin: 0 }}>No plan is running, so there's nothing to cancel.</p>}
            </div>
          </li>
          <li>
            <span className="rp-close-num" aria-hidden="true">3</span>
            <div className="rp-stack" style={{ gap: 8 }}>
              <strong>What happens next</strong>
              <ul className="rp-close-timeline">
                {CLOSING_STEPS.map((step) => (
                  <li key={step.when}><span className="rp-label">{step.when}</span><span>{step.what}</span></li>
                ))}
              </ul>
              {account && <p className="rp-hint" style={{ margin: 0 }}>Questions? <a href={`${account}#get-help`}>Ask us</a>.</p>}
            </div>
          </li>
        </ol>
      </SectionCard>
    </div>
  );
}
