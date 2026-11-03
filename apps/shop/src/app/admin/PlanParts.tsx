import { LogOut } from "lucide-react";
import { adminApi } from "./api";
import { BackupsExportCard } from "./BackupsExportCard";
import { bannerPage, hubReady, planBanner, planFacts, type PlatformPlan } from "./platformPlan";
import { BillingPage, HubNotReady, PlanPage } from "./BillingHub";
import { usePlatformPlan } from "./platformPlanApi";
import { EmptyState, ErrorState, LoadingState, PageHeader, SecondaryButton, SectionCard, StatusBadge } from "./riso/components";

// The shop's plan in the admin (code plan 6.6, 6.7): the banner over every page, Settings › Plan, Settings › Billing and
// the locked desk a paused or closed plan opens on. Since 22.3 the plan and the bills are managed right here
// (BillingHub.tsx), the way Shopify keeps them in Settings › Plan and Settings › Billing; a plan document from before
// that (no `hub`) still links to the platform's Plan & billing page. Admin-only words.

const TONE_GLYPH = { info: "i", warning: "!", danger: "!" } as const;

/** A link styled as a button, to the platform's Plan & billing page. */
function BillingLink({ plan, label, primary }: { plan: PlatformPlan; label: string; primary?: boolean }) {
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

const STATE_BADGE = {
  trial: { tone: "info", word: "Free trial" },
  active: { tone: "success", word: "Open" },
  "payment-problem": { tone: "danger", word: "Payment declined" },
  paused: { tone: "warning", word: "Paused" },
  closed: { tone: "danger", word: "Closed" },
} as const;

/** The plan's facts and the button to Plan & billing. */
export function PlanCard({ plan, now }: { plan: PlatformPlan; now?: number }) {
  const badge = STATE_BADGE[plan.state];
  return (
    <SectionCard title="Your plan" description="Your plan, card and invoices live on Plan & billing. Changes there show here within a minute."
      actions={<StatusBadge tone={badge.tone}>{badge.word}</StatusBadge>}>
      <div className="rp-stack" style={{ gap: 16 }}>
        <dl style={{ margin: 0, display: "grid", gap: 10 }}>
          {planFacts(plan, now).map((fact) => (
            <div key={fact.label} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 35%) 1fr", gap: 12 }}>
              <dt className="rp-label">{fact.label}</dt>
              <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-3">
          <BillingLink plan={plan} label={plan.hasCard ? "Open Plan & billing" : "Add a card on Plan & billing"} primary />
        </div>
        {!plan.link && <p className="rp-hint" style={{ margin: 0 }}>Plan & billing opens from your account on the platform's website.</p>}
      </div>
    </SectionCard>
  );
}

/** Settings › Plan. */
export function PlanSettings() {
  const { plan, failed } = usePlatformPlan(true);
  if (plan === undefined) return <LoadingState label="Reading your plan…" />;
  if (!plan && failed) return <ErrorState title="Plan not loaded" description="Your plan couldn't be read just now. Check your connection, then open this page again." />;
  if (!plan) {
    return (
      <SectionCard title="Your plan">
        <EmptyState inline title="No plan details yet" description="They show here once your plan has started. Your shop works as normal meanwhile." />
      </SectionCard>
    );
  }
  return hubReady(plan) ? <PlanPage plan={plan} /> : <PlanCard plan={plan} />;
}

/** Settings › Billing: the next bill, saved cards, billing details and past bills (BillingHub.tsx). */
export function BillingSettings() {
  const { plan, failed } = usePlatformPlan(true);
  if (plan === undefined) return <LoadingState label="Reading your billing…" />;
  if (!plan && failed) return <ErrorState title="Billing not loaded" description="Your billing couldn't be read just now. Check your connection, then open this page again." />;
  if (!plan) {
    return (
      <SectionCard title="Billing">
        <EmptyState inline title="No bills yet" description="Your bills and cards show here once your plan has started." />
      </SectionCard>
    );
  }
  return hubReady(plan) ? <BillingPage plan={plan} /> : <HubNotReady plan={plan} />;
}

/**
 * What a paused or closed plan opens on instead of the admin: the plan with its button to Plan & billing, and the
 * downloads, so the press can take everything with them. The shop opens again by itself once the plan is open.
 */
export function PlanDesk({ plan, email, appearance }: { plan: PlatformPlan; email: string | null; appearance: "light" | "dark" }) {
  const closed = plan.state === "closed";
  return (
    <div className="rp" data-rp-appearance={appearance}>
      <main className="rp-main" style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px" }} data-plan-desk={plan.state}>
        <PageHeader
          title="Plan & billing"
          description={closed
            ? "Your shop is closed. Shoppers see a closed page, and the rest of the admin opens again when you start a plan."
            : "Your shop is taking a short break: shoppers see a short-break page and can't order. Add a card and everything opens again within a minute."}
          actions={<SecondaryButton icon={<LogOut size={16} aria-hidden />} onClick={() => { void adminApi.logout(); }}>Log out</SecondaryButton>}
        />
        <div className="rp-stack" style={{ gap: 16 }}>
          <PlanBannerBar plan={plan} />
          {hubReady(plan) ? <><PlanPage plan={plan} /><BillingPage plan={plan} /></> : <PlanCard plan={plan} />}
          <BackupsExportCard />
          {email && <p className="rp-hint" style={{ margin: 0 }}>Signed in as {email}.</p>}
        </div>
      </main>
    </div>
  );
}
