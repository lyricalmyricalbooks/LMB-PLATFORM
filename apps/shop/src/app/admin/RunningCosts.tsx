import { useCallback, useEffect, useState } from "react";
import { SecondaryButton, SectionCard, TextField } from "./riso/components";
import "./runningCosts.css";
import { planDate, type PlatformPlan } from "./platformPlan";
import { alertCents, alertWords, billEstimate, billingCall, trendWords, type BillCents, type BillingStatus, type CostTracker } from "./platformBilling";

// Settings › Billing › Running costs (14 November 2026): what the shop has cost to run so far this month, where the
// month is heading, the bill that will come of it, what the money went on, the months before, and the amount the
// owner wants to be told about. Every figure is the platform's (`costs`, services/billing/costTracker.js): this card
// only lays it out. An estimate, said as one; the bill itself is on Next bill and Bills.

type Plan = PlatformPlan & { hub: string; shopId: string };
type Change = { busy: string | null; run: <T>(name: string, work: () => Promise<T>) => Promise<T | undefined> };

/** The platform's tracker for this shop: undefined while it loads, null when it couldn't be read. */
export function useCostTracker(plan: Pick<Plan, "hub" | "shopId">, on = true) {
  const [costs, setCosts] = useState<CostTracker | null | undefined>(undefined);
  const load = useCallback(async () => {
    if (!on) return;
    try { setCosts((await billingCall<{ costs: CostTracker }>(plan, "costs")).costs ?? null); } catch { setCosts(null); }
  }, [plan.hub, plan.shopId, on]);
  useEffect(() => { void load(); }, [load]);
  return { costs, load };
}

const lastDay = (costs: CostTracker) => `${costs.days} ${costs.monthName}`;

function Figures({ costs, bill }: { costs: CostTracker; bill: BillCents | null | undefined }) {
  const estimate = billEstimate(costs, bill);
  const trend = trendWords(costs);
  return (
    <div className="rp-tiles rp-rc-tiles">
      <div className="rp-tile" data-tone="mint" data-rc="so-far">
        <span className="rp-tile-label">So far in {costs.monthName}</span>
        <strong className="rp-tile-value">{costs.soFar?.text}</strong>
        <span className="rp-tile-sub">Day {costs.day} of {costs.days}</span>
      </div>
      <div className="rp-tile" data-tone="apricot" data-rc="month-end">
        <span className="rp-tile-label">By {lastDay(costs)}, about</span>
        <strong className="rp-tile-value">{costs.monthEnd?.text}</strong>
        <span className="rp-tile-sub">{trend || "At this pace"}</span>
      </div>
      {estimate && (
        <div className="rp-tile rp-rc-bill" data-rc="estimate">
          <span className="rp-tile-label">{costs.monthName}'s bill, about</span>
          <strong className="rp-tile-value">{estimate.free ? "Free" : estimate.total}</strong>
          <span className="rp-tile-sub">{estimate.free ? `Your trial covers it. After that, about ${estimate.total} a month.` : `${estimate.parts.join(" · ")}${estimate.taxLater ? " · plus tax" : ""}`}</span>
        </div>
      )}
    </div>
  );
}

function Groups({ costs }: { costs: CostTracker }) {
  const most = Math.max(1, ...costs.groups.map((g) => g.cents));
  return (
    <div className="rp-rc-part" data-rc="groups">
      <h3 className="rp-rc-head">Where it goes</h3>
      <ul className="rp-rc-groups">
        {costs.groups.map((g) => (
          <li key={g.id} className="rp-rc-group">
            <span className="rp-rc-name">{g.words}<span className="rp-hint rp-rc-used">{g.used || (g.id === "records" ? "Counted when the month closes" : "Nothing yet")}</span></span>
            <span className="rp-rc-amount">{g.text}</span>
            <span className="rp-rc-bar" aria-hidden="true">{g.cents > 0 && <span style={{ width: `${Math.round((g.cents / most) * 100)}%` }} />}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Months({ costs }: { costs: CostTracker }) {
  const known = costs.trend.filter((t) => t.cents !== null);
  if (known.length < 2) return (
    <div className="rp-rc-part" data-rc="months">
      <h3 className="rp-rc-head">Month by month</h3>
      <p className="rp-hint" style={{ margin: 0 }}>Your past months show here after your first bill.</p>
    </div>
  );
  const most = Math.max(1, ...known.map((t) => t.cents ?? 0));
  // Months before the shop's first bill aren't drawn as gaps.
  const shown = costs.trend.slice(costs.trend.findIndex((t) => t.cents !== null));
  return (
    <div className="rp-rc-part" data-rc="months">
      <h3 className="rp-rc-head">Month by month{costs.average ? <span className="rp-hint"> · usually {costs.average.text}</span> : null}</h3>
      <ol className="rp-rc-months" aria-label="Running cost by month">
        {shown.map((t) => (
          <li key={t.month} className="rp-rc-month" data-now={t.now ? "" : undefined} data-empty={t.cents === null ? "" : undefined}>
            <span className="rp-rc-month-amount">{t.cents === null ? "" : t.text}</span>
            <span className="rp-rc-month-bar" aria-hidden="true" style={{ height: `${t.cents === null ? 0 : Math.max(4, Math.round((t.cents / most) * 100))}%` }} />
            <span className="rp-rc-month-name">{t.words}{t.now ? <span className="rp-sr-only"> (estimate)</span> : null}</span>
          </li>
        ))}
      </ol>
      <p className="rp-hint" style={{ margin: 0 }}>{costs.monthName} is an estimate.</p>
    </div>
  );
}

/** Pay what you use: the tracker, and the "email me if a month may pass" amount. */
export function RunningCostCard({ plan, usage, bill, change }: { plan: Plan; usage: NonNullable<BillingStatus["usage"]>; bill?: BillCents | null; change: Change }) {
  const { costs, load } = useCostTracker(plan);
  const [typed, setTyped] = useState(() => (usage.alert.cents / 100).toFixed(2));
  const [saved, setSaved] = useState(false);
  const cents = alertCents(typed);
  const save = async () => {
    if (cents === null) return;
    setSaved(false);
    const done = await change.run("cost-alert", () => billingCall(plan, "cost-alert", { cents }));
    if (done !== undefined) { setSaved(true); void load(); }
  };
  const watch = costs && cents === usage.alert.cents ? alertWords(costs.alert) : null;
  const measured = costs?.measured === true && costs.soFar !== null;
  return (
    <SectionCard title="Running costs" description="What your shop costs to run, at cost. Added to your next bill." collapsible={false}>
      <div data-running-cost="" className="rp-rc" data-state={costs === undefined ? "loading" : measured ? "measured" : "plain"}>
        {measured && <Figures costs={costs!} bill={bill} />}
        {measured && (
          <div className="rp-rc-split">
            <Groups costs={costs!} />
            <Months costs={costs!} />
          </div>
        )}
        {!measured && (
          <dl className="rp-rc-facts">
            <div><dt className="rp-label">This month</dt><dd>{costs === undefined ? "Reading…" : "Shows here within a day of your shop being used"}</dd></div>
            <div><dt className="rp-label">Last month</dt><dd>{usage.lastMonth ? `${usage.lastMonth.text} for ${usage.lastMonth.monthWords}` : "Shows after your first paid month"}</dd></div>
            <div><dt className="rp-label">Platform fee</dt><dd>{usage.fee} a month</dd></div>
          </dl>
        )}
        <div className="rp-rc-alert" data-tone={watch?.tone}>
          <div className="rp-rc-alert-field">
            <TextField label="Email me if a month's bill may pass" inputMode="decimal" value={typed} style={{ maxWidth: 140 }}
              onChange={(e) => { setTyped(e.target.value); setSaved(false); }}
              error={cents === null ? "Type an amount, like 25 or 25.50. 0 turns the email off." : undefined}
              hint={saved ? "Saved." : cents === 0 ? "Off: we won't email you." : undefined} />
            <SecondaryButton size="sm" disabled={cents === null || cents === usage.alert.cents} busy={change.busy === "cost-alert"} onClick={() => void save()}>Save</SecondaryButton>
          </div>
          {watch && watch.tone !== "off" && (
            <div className="rp-rc-watch">
              {costs!.alert.used !== null && <span className="rp-rc-meter" aria-hidden="true"><span style={{ width: `${Math.round(costs!.alert.used * 100)}%` }} /></span>}
              <span className="rp-rc-watch-words" role="status">{watch.words}</span>
            </div>
          )}
        </div>
        {measured && costs!.updatedAt && <p className="rp-hint" style={{ margin: 0 }}>Counted up to {planDate(costs!.updatedAt)}. Estimates until the month closes.</p>}
      </div>
    </SectionCard>
  );
}
