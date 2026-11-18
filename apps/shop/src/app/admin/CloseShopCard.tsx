import { useEffect, useRef, useState, type ReactNode } from "react";
import { DestructiveButton, Dialog, PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";
import { DownloadShopButton } from "./DownloadShopCard";
import { Problem, useBillingStatus, useChange } from "./BillingHub";
import { billingCall, type BillingStatus } from "./platformBilling";
import { hubReady, planDate, storesPage, type PlatformPlan } from "./platformPlan";
import { closeShopStage, closesOn, deletedOn, type CloseStage } from "./closeShop";
import "./closeShop.css";

// Close your shop (Julian, 18 November 2026: "where do i even close the shop? … make it easy with a button"). Its own
// page, Settings › Close shop (#settings/close; the older #settings/plan/close opens it too), and the same panel on the
// locked desk of a paused or closed shop. Two tiles: take everything with you, and close (one button, a plain yes or no).
// Then the dates of what happens next. Closing, keeping and opening again are the platform's `close`, `keep` and
// `reopen` calls; the rules for the words are in closeShop.ts.

type HubPlan = PlatformPlan & { hub: string; shopId: string };
type Stop = { when: string; what: string; detail?: string; tone?: "now" | "end" };

/** What happens next, with real dates where we know them. */
function stopsFor(closes: string | null, deletes: string | null, closed: boolean, now = "Today"): Stop[] {
  return [
    { when: closed ? (closes ? `Closed ${planDate(closes)}` : "Closed") : closes ? planDate(closes) : now, what: "Closed to shoppers", detail: "You can still sign in, download everything or open it again.", tone: "now" },
    { when: "30 and 7 days before", what: "A reminder email", detail: "So the end never comes as a surprise." },
    { when: deletes ? planDate(deletes) : "After 90 days", what: "Deleted for good", detail: "Your shop and everything in it.", tone: "end" },
  ];
}

function Timeline({ stops }: { stops: Stop[] }) {
  return (
    <section className="rp-cs-tile rp-cs-next" aria-labelledby="cs-next-title">
      <h3 id="cs-next-title" className="rp-cs-title">What happens next</h3>
      <ol className="rp-cs-line">
        {stops.map((stop) => (
          <li key={stop.what} data-tone={stop.tone}>
            <span className="rp-cs-dot" aria-hidden="true" />
            <span className="rp-cs-when">{stop.when}</span>
            <strong>{stop.what}</strong>
            {stop.detail && <span className="rp-cs-detail">{stop.detail}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The closing tile and the timeline, for a shop whose plan the admin manages. */
function ManagedClose({ plan, onStage }: { plan: HubPlan; onStage: (stage: CloseStage) => void }) {
  const { answer, error, load } = useBillingStatus(plan);
  const change = useChange(load);
  const [asking, setAsking] = useState(false);
  const billing: BillingStatus | null = answer?.billing ?? null;
  const stage = closeShopStage(billing, { loaded: !!answer, failed: !answer && !!error });
  useEffect(() => { onStage(stage); }, [stage]);
  const account = storesPage(plan);

  const closes = billing && stage === "open" ? closesOn(billing) : billing?.cancelEndsAt ?? billing?.currentPeriodEnd ?? null;
  const closedAt = plan.closing?.closedAt ?? null;
  const deletes = stage === "closed" ? plan.closing?.deleteAfter ?? plan.closing?.downloadUntil ?? null : deletedOn(closes);

  const close = async () => {
    const done = await change.run("close", () => billingCall(plan, "close"));
    if (done !== undefined) setAsking(false);
  };
  const reopen = () => change.run("reopen", async () => {
    const answer = await billingCall<{ url?: string; opened?: boolean }>(plan, "reopen");
    if (answer.url) window.location.assign(answer.url);
  });

  let tile: ReactNode;
  if (stage === "loading") {
    tile = <><h3 className="rp-cs-title">Close your shop</h3><p className="rp-cs-line-text">Reading your plan…</p></>;
  } else if (stage === "unknown") {
    tile = (
      <>
        <h3 className="rp-cs-title">Close your shop</h3>
        <p className="rp-cs-line-text">Your plan couldn't be read just now.</p>
        <div className="rp-cs-actions"><SecondaryButton onClick={() => void load()}>Try again</SecondaryButton></div>
      </>
    );
  } else if (stage === "none") {
    tile = <NoPlan account={account} />;
  } else if (stage === "open") {
    tile = (
      <>
        <h3 className="rp-cs-title">Close your shop</h3>
        <p className="rp-cs-line-text">{closes ? `It stays open until ${planDate(closes)}, the end of the time you've paid for.` : "It closes to shoppers as soon as you say yes."}</p>
        <div className="rp-cs-actions"><DestructiveButton onClick={() => { change.clear(); setAsking(true); }}>Close shop</DestructiveButton></div>
      </>
    );
  } else if (stage === "cancelled") {
    tile = (
      <>
        <div className="rp-cs-head"><h3 className="rp-cs-title">{closes ? `Closes on ${planDate(closes)}` : "Closing soon"}</h3><StatusBadge tone="warning">Closing</StatusBadge></div>
        <p className="rp-cs-line-text">Shoppers can buy until then. Changed your mind?</p>
        <div className="rp-cs-actions"><PrimaryButton busy={change.busy === "keep"} onClick={() => void change.run("keep", () => billingCall(plan, "keep"))}>Keep my shop open</PrimaryButton></div>
      </>
    );
  } else {
    tile = (
      <>
        <div className="rp-cs-head"><h3 className="rp-cs-title">Your shop is closed</h3><StatusBadge tone="danger">Closed</StatusBadge></div>
        <p className="rp-cs-line-text">{deletes ? `Everything is kept until ${planDate(deletes)}. Open it again before then and it's just as you left it.` : "Open it again and it's just as you left it."}</p>
        <div className="rp-cs-actions"><PrimaryButton busy={change.busy === "reopen"} onClick={() => void reopen()}>Open my shop again</PrimaryButton></div>
      </>
    );
  }

  const deleteWords = planDate(deletedOn(closes));
  return (
    <>
      <div className="rp-cs-grid">
        <DownloadTile />
        <section className="rp-cs-tile rp-cs-close" data-stage={stage} aria-live="polite">
          <span className="rp-cs-step" aria-hidden="true">2</span>
          {tile}
          {!asking && <Problem error={change.error} />}
        </section>
      </div>
      <Timeline stops={stopsFor(stage === "closed" ? closedAt : closes, stage === "open" || stage === "cancelled" || stage === "closed" ? deletes : null, stage === "closed", stage === "open" ? "Today" : "When it closes")} />

      <Dialog open={asking} onClose={() => setAsking(false)} title="Close your shop?"
        description={closes
          ? `Shoppers can buy until ${planDate(closes)}. Then it closes, and everything is deleted on ${deleteWords} unless you open it again.`
          : `It closes to shoppers now. Everything is deleted on ${deleteWords} unless you open it again.`}
        footer={<>
          <SecondaryButton onClick={() => setAsking(false)}>No, keep it open</SecondaryButton>
          <DestructiveButton busy={change.busy === "close"} onClick={() => void close()}>Yes, close my shop</DestructiveButton>
        </>}>
        <Problem error={change.error} />
      </Dialog>
    </>
  );
}

function NoPlan({ account, link }: { account: string | null; link?: string | null }) {
  return (
    <>
      <h3 className="rp-cs-title">Close your shop</h3>
      {link
        ? <p className="rp-cs-line-text">Your plan is on your account page, so close it there.</p>
        : <p className="rp-cs-line-text">Your shop has no plan yet, so we close it for you.</p>}
      <div className="rp-cs-actions">
        {link
          ? <a className="rp-btn rp-btn-danger" href={link}>Close on your account page</a>
          : account ? <a className="rp-btn rp-btn-secondary" href={`${account}#get-help`}>Ask us to close it</a> : null}
      </div>
    </>
  );
}

function DownloadTile() {
  return (
    <section className="rp-cs-tile rp-cs-take" data-tone="mint">
      <span className="rp-cs-step" aria-hidden="true">1</span>
      <h3 className="rp-cs-title">Take everything with you</h3>
      <p className="rp-cs-line-text">Products, customers, orders, pages and photos, in one zip.</p>
      <DownloadShopButton />
    </section>
  );
}

/** The whole way out. `plan` is null on a shop with no plan document. */
export function CloseShopCard({ plan, focus }: { plan: PlatformPlan | null; focus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<CloseStage>(hubReady(plan) ? "loading" : plan?.state === "closed" ? "closed" : "none");
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  return (
    <div ref={ref} id="close-shop" className="rp-cs" data-close-shop={stage}>
      {hubReady(plan)
        ? <ManagedClose plan={plan} onStage={setStage} />
        : (
          <>
            <div className="rp-cs-grid">
              <DownloadTile />
              <section className="rp-cs-tile rp-cs-close" data-stage={stage}>
                <span className="rp-cs-step" aria-hidden="true">2</span>
                <NoPlan account={storesPage(plan)} link={plan?.link} />
              </section>
            </div>
            <Timeline stops={stopsFor(null, null, false, "When it closes")} />
          </>
        )}
    </div>
  );
}
