// Membership page (/membership, Memberships beta): the shop's plans, each with its price, free trial, perks and Join.
// Joining needs the customer's own sign-in: a guest is sent to the account page (`/account/membership?join=<plan>`),
// which finishes the join after signing in (AccountMembership.tsx). Join opens the shop's own card page; the card
// provider sends them back to the account. Every word is Text & labels › Membership page; the look is the order slip's
// (trackingStyle.ts) plus membershipStyle.ts. The server (functions/memberships.js) checks the plan, the switch and
// whether they are a member already; this page only asks.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useSEO } from "../../lib/seo";
import { restoredUser } from "../../../lib/authSession";
import { StoreChrome } from "./StoreChrome";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { useSiteData } from "./useSiteData";
import { getCopy } from "./storeCopy";
import { TRACKING_CSS } from "./trackingStyle";
import { MEMBERSHIP_CSS } from "./membershipStyle";
import { regionProps } from "./storefrontRegions";
import { askMembership, type MembershipInfo, type PublicPlan } from "./membershipAsk";
import { isBookingPreview } from "./bookTimePreview";
import { GlobalSections, TemplateSections } from "../../components/sectionRender";
import { moneyText } from "./bookTimeRules";
import { membershipErrorKey, planEveryKey } from "./membershipWords";

type Copy = (key: string, vars?: Record<string, string | number>) => string;

export default function MembershipPage() {
  return <StoreChrome surface="membershipPage"><MembershipContent /></StoreChrome>;
}

function MembershipContent() {
  const { settings, books } = useSiteData();
  const design = settings?.design;
  const c: Copy = (key, vars) => getCopy(design, key, vars);
  useSEO({ title: c("membershipTitle"), description: c("membershipSubtitle") });

  return (
    <div data-fm-store data-studio-target="copy:Membership page|style:colors" data-studio-label="Membership page" className="fm-track min-h-screen fm-page text-white font-sans relative pb-24">
      <StorefrontThemeStyle design={design} />
      <style>{TRACKING_CSS}</style>
      <style>{MEMBERSHIP_CSS}</style>
      <div {...regionProps("membershipGlow")} aria-hidden="true" className="fm-track-strip" />
      <nav {...regionProps("membershipHeader")} className="relative z-10 border-b-2 fm-track-rule">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between gap-4">
          <Link to="/" className="fm-track-link fm-track-mono"><ArrowLeft size={14} aria-hidden="true" /> {c("membershipBack")}</Link>
          <span className="fm-track-mono">{c("membershipEyebrow")}</span>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 relative z-10">
        <div {...regionProps("membershipIntro")} className="mb-10 max-w-3xl">
          <p className="fm-track-mono mb-3">{c("membershipEyebrow")}</p>
          <h1 tabIndex={-1} className="fm-track-display text-5xl sm:text-6xl outline-none">{c("membershipTitle")}</h1>
          <p className="mt-4 text-base leading-7 fm-muted">{c("membershipSubtitle")}</p>
        </div>
        <Plans c={c} />
      </main>
      <TemplateSections design={design} templateId="membershipPage" books={books} />
      <GlobalSections design={design} books={books} />
    </div>
  );
}

function Plans({ c }: { c: Copy }) {
  const navigate = useNavigate();
  const [info, setInfo] = useState<MembershipInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState<{ plan: string; key: string } | null>(null);

  const load = () => { setFailed(false); askMembership("membershipInfo").then((a) => setInfo(a as MembershipInfo)).catch(() => setFailed(true)); };
  useEffect(load, []);

  if (failed) {
    return (
      <div {...regionProps("membershipNotice")} className="fm-track-notice" data-tone="danger" role="alert">
        <p>{c("membershipLoadError")}</p>
        <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={load}>{c("membershipRetry")}</button>
      </div>
    );
  }
  if (!info) return <p role="status" className="fm-track-mono"><Loader2 size={16} className="animate-spin inline-block" aria-hidden="true" /> {c("membershipLoading")}</p>;
  const plans = info.plans || [];
  if (!info.on || !plans.length) return <div {...regionProps("membershipNotice")} className="fm-track-notice" role="status"><p>{c("membershipClosed")}</p></div>;

  const join = async (plan: PublicPlan) => {
    if (busy) return;
    setProblem(null);
    if (isBookingPreview()) return;
    setBusy(plan.id);
    try {
      const user = await restoredUser(4000);
      if (!user) { navigate(`/account/membership?join=${encodeURIComponent(plan.id)}`); return; }
      const answer = await askMembership("membershipJoin", { planId: plan.id }, user);
      if (answer.url) { window.location.assign(String(answer.url)); return; }
      setProblem({ plan: plan.id, key: "membershipErrorGeneric" });
    } catch (err: any) {
      if (err?.code === "sign_in") { navigate(`/account/membership?join=${encodeURIComponent(plan.id)}`); return; }
      setProblem({ plan: plan.id, key: membershipErrorKey(err?.code, err?.status) });
      if (err?.code === "plan") load();
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      {info.ready === false && <div {...regionProps("membershipNotice")} className="fm-track-notice mb-8" role="status"><p>{c("membershipNotReady")}</p></div>}
      <ul {...regionProps("membershipPlans")} className="fm-mbr-plans">
        {plans.map((plan) => {
          const price = moneyText(plan.priceMinor, plan.currency || info.currency || "CAD");
          return (
            <li key={plan.id} className="fm-track-card fm-mbr-plan">
              <h2>{plan.name}</h2>
              <p className="fm-mbr-price"><strong translate="no">{price}</strong> <span className="fm-muted">{c(planEveryKey(plan.interval))}</span></p>
              {plan.trialDays > 0 && <p className="fm-track-mono">{c("membershipTrial", { days: plan.trialDays })}</p>}
              {plan.description && <p className="fm-mbr-desc">{plan.description}</p>}
              {plan.perks.length > 0 && (
                <ul className="fm-mbr-perks" aria-label={c("membershipPerksLabel", { name: plan.name })}>
                  {plan.perks.map((perk, i) => <li key={i}>{perk}</li>)}
                </ul>
              )}
              <button type="button" className="fm-track-btn" disabled={!!busy || info.ready === false} aria-busy={busy === plan.id} onClick={() => join(plan)}>
                {busy === plan.id ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                {plan.trialDays > 0 ? c("membershipStartTrial") : c("membershipJoin")}
              </button>
              {problem?.plan === plan.id && (
                <p role="alert" className="fm-mbr-error">
                  {c(problem.key)}{problem.key === "membershipErrorMember" ? <> <Link to="/account/membership" className="fm-track-link">{c("membershipSeeAccount")}</Link></> : null}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p {...regionProps("membershipFinePrint")} className="fm-mbr-note">{c("membershipFinePrint")}</p>
    </>
  );
}
