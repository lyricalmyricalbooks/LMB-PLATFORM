// Membership page (/membership, Memberships beta): the shop's plans, each with its price, free trial, perks and Join.
// Joining needs the customer's own sign-in: a guest is sent to the account page (`/account/membership?join=<plan>`),
// which finishes the join after signing in (AccountMembership.tsx). Join opens the shop's own card page; the card
// provider sends them back to the account. Every word is Text & labels › Membership page; the look is the order slip's
// (trackingStyle.ts) plus membershipStyle.ts. The server (functions/memberships.js) checks the plan, the switch and
// whether they are a member already; this page only asks.
// Gifts (M5): a plan the owner lets people give shows Give as a gift, which opens a form under the plans (how long,
// their name and email, a message) and pays once on the card page; the card provider sends the buyer back here with
// `?gift=<id>`, and the thank-you asks the server until the payment reads paid.
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
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
import { askMembership, type GiftStatus, type MembershipInfo, type PublicPlan } from "./membershipAsk";
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
  const [giving, setGiving] = useState<PublicPlan | null>(null);

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
      <GiftThanks c={c} />
      {info.ready === false && <div {...regionProps("membershipNotice")} className="fm-track-notice mb-8" role="status"><p>{c("membershipNotReady")}</p></div>}
      <ul {...regionProps("membershipPlans")} className="fm-mbr-plans">
        {plans.map((plan) => {
          const price = moneyText(plan.priceMinor, plan.currency || info.currency || "CAD");
          return (
            <li key={plan.id} className="fm-track-card fm-mbr-plan">
              <h2>{plan.name}</h2>
              <p className="fm-mbr-price"><strong translate="no">{price}</strong> <span className="fm-muted">{c(planEveryKey(plan.interval))}</span></p>
              {plan.trialDays > 0 && <p className="fm-track-mono">{c("membershipTrial", { days: plan.trialDays })}</p>}
              {(plan.memberPercent || 0) > 0 && <p className="fm-mbr-member-price">{c("membershipMemberPrice", { percent: plan.memberPercent || 0 })}</p>}
              {plan.box && <p className="fm-mbr-member-price">{c("membershipBoxLine")}</p>}
              {plan.description && <p className="fm-mbr-desc">{plan.description}</p>}
              {plan.perks.length > 0 && (
                <ul className="fm-mbr-perks" aria-label={c("membershipPerksLabel", { name: plan.name })}>
                  {plan.perks.map((perk, i) => <li key={i}>{perk}</li>)}
                </ul>
              )}
              <div className="fm-mbr-plan-actions">
                <button type="button" className="fm-track-btn" disabled={!!busy || info.ready === false} aria-busy={busy === plan.id} onClick={() => join(plan)}>
                  {busy === plan.id ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                  {plan.trialDays > 0 ? c("membershipStartTrial") : c("membershipJoin")}
                </button>
                {!!plan.gifts?.length && (
                  <button type="button" className="fm-track-btn fm-track-btn-ghost" aria-expanded={giving?.id === plan.id} disabled={!!busy} onClick={() => setGiving(giving?.id === plan.id ? null : plan)}>
                    {c("membershipGift")}
                  </button>
                )}
              </div>
              {problem?.plan === plan.id && (
                <p role="alert" className="fm-mbr-error">
                  {c(problem.key)}{problem.key === "membershipErrorMember" ? <> <Link to="/account/membership" className="fm-track-link">{c("membershipSeeAccount")}</Link></> : null}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {giving && <GiftForm key={giving.id} c={c} plan={giving} currency={giving.currency || info.currency || "CAD"} onClose={() => setGiving(null)} />}
      <p {...regionProps("membershipFinePrint")} className="fm-mbr-note">{c("membershipFinePrint")}</p>
    </>
  );
}

function GiftForm({ c, plan, currency, onClose }: { c: Copy; plan: PublicPlan; currency: string; onClose: () => void }) {
  const lengths = plan.gifts || [];
  const [months, setMonths] = useState(lengths[0]?.months || 3);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ field: string; key: string } | null>(null);
  const [signIn, setSignIn] = useState(false);
  const box = useRef<HTMLFormElement>(null);
  useEffect(() => { box.current?.scrollIntoView({ block: "start", behavior: "smooth" }); box.current?.querySelector("h2")?.focus(); }, []);
  const chosen = lengths.find((l) => l.months === months) || lengths[0];
  const price = chosen ? moneyText(chosen.priceMinor, currency) : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setProblem(null);
    if (!form.email.trim()) { setProblem({ field: "email", key: "membershipErrorGiftEmail" }); return; }
    // Studio's preview shows the form and its checks; no card page opens.
    if (isBookingPreview()) return;
    setBusy(true);
    try {
      const user = await restoredUser(4000);
      if (!user) { setSignIn(true); return; }
      const answer = await askMembership("membershipGift", { planId: plan.id, gift: { months, email: form.email, name: form.name, message: form.message } }, user);
      if (answer.url) { window.location.assign(String(answer.url)); return; }
      setProblem({ field: "form", key: "membershipErrorGeneric" });
    } catch (err: any) {
      if (err?.code === "sign_in") { setSignIn(true); return; }
      const self = err?.code === "email" && /someone else/i.test(String(err?.message || ""));
      setProblem({ field: err?.code === "email" ? "email" : "form", key: self ? "membershipErrorGiftSelf" : membershipErrorKey(err?.code, err?.status) });
    } finally {
      setBusy(false);
    }
  };

  const emailProblem = problem?.field === "email";
  return (
    <form ref={box} {...regionProps("membershipGiftForm")} className="fm-track-card fm-mbr-gift" onSubmit={submit} noValidate>
      <h2 tabIndex={-1} className="outline-none">{c("membershipGiftHeading", { name: plan.name })}</h2>
      <fieldset>
        <legend>{c("membershipGiftLength")}</legend>
        <div className="fm-mbr-lengths">
          {lengths.map((l) => (
            <label key={l.months} className="fm-mbr-length">
              <input type="radio" name="gift-months" value={l.months} checked={months === l.months} onChange={() => setMonths(l.months)} />
              <span translate="no">{c("membershipGiftMonths", { months: l.months, price: moneyText(l.priceMinor, currency) })}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="fm-mbr-gift-grid">
        <div className="fm-mbr-field">
          <label htmlFor="gift-name">{c("membershipGiftToName")}</label>
          <input id="gift-name" className="fm-track-input" autoComplete="off" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="fm-mbr-field">
          <label htmlFor="gift-email">{c("membershipGiftToEmail")}</label>
          <input id="gift-email" className="fm-track-input" type="email" inputMode="email" autoComplete="off" maxLength={254} required value={form.email} aria-invalid={emailProblem || undefined}
            aria-describedby={emailProblem ? "gift-email-hint gift-email-problem" : "gift-email-hint"} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <p id="gift-email-hint" className="fm-mbr-hint">{c("membershipGiftEmailHint")}</p>
          {emailProblem && <p id="gift-email-problem" role="alert" className="fm-mbr-error">{c(problem.key)}</p>}
        </div>
        <div className="fm-mbr-field fm-mbr-wide">
          <label htmlFor="gift-message">{c("membershipGiftMessage")}</label>
          <textarea id="gift-message" className="fm-track-input" maxLength={300} rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </div>
      </div>
      <p className="fm-mbr-hint">{c("membershipGiftNote")}</p>
      {signIn && <p role="alert" className="fm-track-notice">{c("membershipGiftSignIn")} <Link to="/account/membership" className="fm-track-link">{c("membershipGiftSignInLink")}</Link></p>}
      {problem && !emailProblem && <p role="alert" className="fm-mbr-error">{c(problem.key)}</p>}
      <div className="fm-mbr-gift-foot">
        <button type="submit" className="fm-track-btn" disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
          <span translate="no">{c("membershipGiftPay", { price })}</span>
        </button>
        <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={onClose}>{c("membershipGiftCancel")}</button>
      </div>
    </form>
  );
}

/** After paying for a gift (`?gift=<id>`): asks until the payment reads paid, a few times, then says thank you. */
function GiftThanks({ c }: { c: Copy }) {
  const { search } = useLocation();
  const id = new URLSearchParams(search).get("gift") || "";
  const [gift, setGift] = useState<GiftStatus | null>(null);
  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return;
    let stop = false, tries = 0;
    const ask = async () => {
      try {
        const user = await restoredUser(4000);
        if (!user || stop) return;
        const answer = await askMembership("membershipGiftStatus", { id }, user);
        const g = answer.gift as GiftStatus;
        if (stop) return;
        setGift(g);
        if (g.state === "pending" && ++tries < 8) setTimeout(ask, 2500);
      } catch { /* nothing to show: the email still goes */ }
    };
    void ask();
    return () => { stop = true; };
  }, [id]);
  if (!gift) return null;
  const words = gift.state === "paid" ? c("membershipGiftThanks", { to: gift.to, months: gift.months, plan: gift.plan })
    : gift.state === "ended" ? c("membershipGiftUnpaid") : c("membershipGiftWaiting");
  return <div {...regionProps("membershipNotice")} className="fm-track-notice fm-mbr-gift-thanks" role="status"><p>{words}</p></div>;
}
