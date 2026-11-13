import { usePlatformPlan } from "../platformPlanApi";
import { planDate, type PlatformPlan } from "../platformPlan";

// Home after the owner cancels (Julian, 12 November 2026): one apricot tile saying the day the shop closes, with the
// download and Keep my plan one tap away on Settings › Billing › Close your shop. Shown only while a cancel is waiting.
export function closingDay(plan: PlatformPlan | null | undefined): string | null {
  if (!plan || plan.access !== "open" || !plan.cancelAtPeriodEnd || !plan.endsAt) return null;
  return planDate(plan.endsAt);
}

export function ClosingTileView({ day }: { day: string }) {
  return (
    <section className="rp-run" data-closing-tile="" aria-label="Your shop is closing" style={{ background: "var(--rp-tile-apricot)" }}>
      <div className="rp-run-head">
        <span className="rp-run-kicker">{`Your shop closes on ${day}`}</span>
        <span className="rp-run-count">Plan cancelled</span>
      </div>
      <span>Download everything before then, or keep your plan.</span>
      <div className="flex flex-wrap gap-2">
        <a className="rp-btn rp-btn-primary rp-btn-sm" href="#settings/billing/close">Download your shop</a>
        <a className="rp-btn rp-btn-secondary rp-btn-sm" href="#settings/billing/close">Keep my plan</a>
      </div>
    </section>
  );
}

export function ClosingTile() {
  const { plan } = usePlatformPlan(true);
  const day = closingDay(plan);
  return day ? <ClosingTileView day={day} /> : null;
}
