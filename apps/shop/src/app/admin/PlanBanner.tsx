import { bannerPage, hubReady, planBanner, type PlatformPlan } from "./platformPlan";

// The plan banner over every admin page (code plan 6.6). Kept apart from PlanParts.tsx so the admin shell loads only
// the banner; Settings › Plan, Settings › Billing and the locked desk load with their pages.

const TONE_GLYPH = { info: "i", warning: "!", danger: "!" } as const;

/** A link styled as a button, to the platform's Plan & billing page. */
export function BillingLink({ plan, label, primary }: { plan: PlatformPlan; label: string; primary?: boolean }) {
  if (!plan.link) return null;
  return <a className={`rp-btn ${primary ? "rp-btn-primary" : "rp-btn-secondary"} rp-btn-sm`} href={plan.link} data-plan-link="">{label}</a>;
}

/** The trial, payment-problem, ending, paused or closed banner; nothing for an active plan or a shop with no plan. */
export function PlanBannerBar({ plan, now }: { plan: PlatformPlan | null | undefined; now?: number }) {
  const banner = planBanner(plan ?? null, now);
  if (!plan || !banner) return null;
  return (
    <div role="status" className="rp-alert" data-tone={banner.tone === "info" ? undefined : banner.tone} data-plan-banner={plan.state}>
      <span className="rp-alert-glyph" aria-hidden="true">{TONE_GLYPH[banner.tone]}</span>
      <div className="rp-alert-text">
        <span className="rp-alert-kicker">{banner.kicker}</span>
        <strong className="rp-alert-title">{banner.title}</strong>
        <span className="rp-alert-detail">{banner.detail}</span>
      </div>
      <div className="rp-alert-actions">
        {hubReady(plan)
          ? <a className="rp-btn rp-btn-primary rp-btn-sm" href={`#settings/${bannerPage(banner)}`} data-plan-link="">{banner.action}</a>
          : <BillingLink plan={plan} label={banner.action} primary />}
      </div>
    </div>
  );
}
