// Support page (/support, Donations & tips beta): suggested amounts or the giver's own, covering the card fee, giving in
// someone's honour or memory, staying anonymous and a note, then the shop's own card page. After paying, the giver comes
// back to `?gift=…&key=…` for their thank-you. Every word is Text & labels › Support page; the look is the order slip's
// (trackingStyle.ts) plus supportStyle.ts. The server (functions/giving.js) checks every amount, the card-testing guard
// and the switches; this page only asks. A hidden field only bots fill in and the form token from `givingInfo` go back
// with the gift.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useSEO } from "../../lib/seo";
import { StoreChrome } from "./StoreChrome";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { useSiteData } from "./useSiteData";
import { getCopy } from "./storeCopy";
import { TRACKING_CSS } from "./trackingStyle";
import { SUPPORT_CSS } from "./supportStyle";
import { regionProps } from "./storefrontRegions";
import { askGiving } from "./supportAsk";
import { isBookingPreview } from "./bookTimePreview";
import { GlobalSections, TemplateSections } from "../../components/sectionRender";
import { moneyText } from "./bookTimeRules";
import { amountProblem, chargeFor, giftFromSearch, typedMinor, type GiftView, type GivingInfo } from "./supportRules";
import { currencySign } from "../../../shared/shopCurrency";

type Copy = (key: string, vars?: Record<string, string | number>) => string;

/** A link that keeps Studio's `preview=true`, so the sample answers stay. */
const kept = (path: string) => (isBookingPreview() ? `${path}${path.includes("?") ? "&" : "?"}preview=true` : path);
const pageLanguage = () => (typeof document !== "undefined" ? document.documentElement.lang || navigator.language || "en" : "en");

export default function SupportPage() {
  return <StoreChrome surface="supportPage"><SupportContent /></StoreChrome>;
}

function SupportContent() {
  const { settings, books } = useSiteData();
  const design = settings?.design;
  const c: Copy = (key, vars) => getCopy(design, key, vars);
  const { search } = useLocation();
  const gift = useMemo(() => giftFromSearch(search), [search]);
  useSEO({ title: c("supportTitle"), description: c("supportSubtitle") });

  return (
    <div data-fm-store data-studio-target="copy:Support page|style:colors" data-studio-label="Support page" className="fm-track min-h-screen fm-page text-white font-sans relative pb-24">
      <StorefrontThemeStyle design={design} />
      <style>{TRACKING_CSS}</style>
      <style>{SUPPORT_CSS}</style>
      <div {...regionProps("supportGlow")} aria-hidden="true" className="fm-track-strip" />
      <nav {...regionProps("supportHeader")} className="relative z-10 border-b-2 fm-track-rule">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between gap-4">
          <Link to="/" className="fm-track-link fm-track-mono"><ArrowLeft size={14} aria-hidden="true" /> {c("supportBack")}</Link>
          <span className="fm-track-mono">{c("supportEyebrow")}</span>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 relative z-10">
        {gift ? <Thanks key={gift.id} id={gift.id} giftKey={gift.key} c={c} /> : <Give c={c} />}
      </main>
      <TemplateSections design={design} templateId="supportPage" books={books} />
      <GlobalSections design={design} books={books} />
    </div>
  );
}

function Intro({ c, children, title }: { c: Copy; children?: React.ReactNode; title?: string }) {
  return (
    <div {...regionProps("supportIntro")} className="mb-10 max-w-3xl">
      <p className="fm-track-mono mb-3">{c("supportEyebrow")}</p>
      <h1 tabIndex={-1} className="fm-track-display text-5xl sm:text-6xl outline-none">{title || c("supportTitle")}</h1>
      {children ?? <p className="mt-4 text-base leading-7 fm-muted">{c("supportSubtitle")}</p>}
    </div>
  );
}

function Give({ c }: { c: Copy }) {
  const navigate = useNavigate();
  const [info, setInfo] = useState<GivingInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<number | "other" | null>(null);
  const [typed, setTyped] = useState("");
  const [cover, setCover] = useState(true);
  const [honourOn, setHonourOn] = useState(false);
  const [honourKind, setHonourKind] = useState<"honour" | "memory">("honour");
  const [honourName, setHonourName] = useState("");
  const [form, setForm] = useState({ name: "", email: "", anonymous: false, note: "", website: "" });
  const [problems, setProblems] = useState<{ amount?: string; name?: string; email?: string; honour?: string }>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setFailed(false);
    askGiving("givingInfo").then((answer) => {
      const next = answer as GivingInfo;
      setInfo(next);
      // Start on a middle amount, so the Give button and the total read at once; the giver can still pick any other.
      const amounts = next.amounts || [];
      setPicked((now) => now ?? (amounts.length ? amounts[Math.min(1, amounts.length - 1)] : next.otherAmount ? "other" : null));
    }).catch(() => setFailed(true));
  };
  useEffect(load, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  if (failed) {
    return (
      <><Intro c={c} />
        <div className="fm-track-notice" data-tone="danger" role="alert">
          <p>{c("supportLoadError")}</p>
          <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={load}>{c("supportRetry")}</button>
        </div></>
    );
  }
  if (!info) return <><Intro c={c} /><p role="status" className="fm-sup-empty fm-track-mono"><Loader2 size={16} className="animate-spin inline-block" aria-hidden="true" /> {c("supportLoading")}</p></>;
  if (!info.on) return <><Intro c={c} /><div {...regionProps("supportNotice")} className="fm-track-notice" role="status"><p>{c("supportClosed")}</p></div></>;

  const currency = info.currency || "CAD";
  const money = (minor: number) => moneyText(minor, currency);
  const amounts = info.amounts || [];
  const other = info.otherAmount !== false;
  // With no suggested amounts the other-amount box is the only choice, so it's open from the start.
  const choice = picked ?? (amounts.length ? null : "other");
  const minor = choice === "other" ? typedMinor(typed) : choice;
  const covering = !!info.coverFee && cover;
  const { feeMinor, totalMinor } = chargeFor(minor && minor > 0 ? minor : 0, covering);
  const limits = { min: money(info.minMinor || 500), max: money(info.maxMinor || 1_000_000) };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountKey = amountProblem(minor, info.minMinor, info.maxMinor);
    const next: typeof problems = {
      amount: amountKey ? c(amountKey, limits) : undefined,
      name: form.name.trim() ? undefined : c("supportNeedName"),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()) ? undefined : c("supportNeedEmail"),
      honour: honourOn && !honourName.trim() ? c("supportNeedHonourName") : undefined,
    };
    setProblems(next);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    setError("");
    try {
      const answer = await askGiving("giftStart", {
        amountMinor: minor, coverFee: covering, form: info.form, website: form.website, locale: pageLanguage(),
        giver: { name: form.name, email: form.email, anonymous: form.anonymous, note: form.note, honour: honourOn ? { kind: honourKind, name: honourName } : null },
      });
      if (answer.url) { window.location.assign(String(answer.url)); return; }
      if (answer.giftId && answer.key) { navigate(kept(`/support?gift=${encodeURIComponent(answer.giftId)}&key=${encodeURIComponent(answer.key)}`)); return; }
      setError(c("supportError"));
    } catch (err: any) {
      // The server's own words for a refused gift (lowest amount, too many tries, cards not set up); ours otherwise.
      setError(err?.code && err?.message && !/^\d+$/.test(err.message) ? err.message : c("supportError"));
      // A form token used up or too old: a fresh one for the next try.
      if (err?.code === "form") askGiving("givingInfo").then((answer) => {
      const next = answer as GivingInfo;
      setInfo(next);
      // Start on a middle amount, so the Give button and the total read at once; the giver can still pick any other.
      const amounts = next.amounts || [];
      setPicked((now) => now ?? (amounts.length ? amounts[Math.min(1, amounts.length - 1)] : next.otherAmount ? "other" : null));
    }).catch(() => {});
    } finally { setBusy(false); }
  };

  return (
    <>
      <Intro c={c} />
      {!info.cardsReady && <div {...regionProps("supportNotice")} className="fm-track-notice mb-8" role="status"><p>{c("supportNotReady")}</p></div>}
      <form onSubmit={submit} noValidate className="fm-sup-layout">
        <section {...regionProps("supportAmounts")} className="fm-track-card p-5 sm:p-8" aria-labelledby="sup-amount">
          <h2 id="sup-amount" className="fm-track-mono mb-5">{c("supportAmountHeading")}</h2>
          {amounts.length > 0 && (
            <ul className="fm-sup-amounts">
              {amounts.map((a) => (
                <li key={a}><button type="button" className="fm-sup-amount" aria-pressed={choice === a} translate="no"
                  onClick={() => { setPicked(a); setProblems({ ...problems, amount: undefined }); }}>{money(a)}</button></li>
              ))}
              {other && <li><button type="button" className="fm-sup-amount" aria-pressed={choice === "other"} onClick={() => { setPicked("other"); setProblems({ ...problems, amount: undefined }); }}>{c("supportOther")}</button></li>}
            </ul>
          )}
          {choice === "other" && (
            <div className="fm-sup-other">
              <label htmlFor="sup-other" className="fm-track-mono">{c("supportOtherLabel")}</label>
              <div className="fm-sup-money">
                <span aria-hidden="true">{currencySign(currency)}</span>
                <input id="sup-other" className="fm-track-input" inputMode="decimal" autoComplete="off" value={typed} maxLength={12} autoFocus={amounts.length > 0}
                  aria-invalid={!!problems.amount} aria-describedby={problems.amount ? "sup-amount-err" : "sup-other-hint"}
                  onChange={(e) => { setTyped(e.target.value); setProblems({ ...problems, amount: undefined }); }} />
              </div>
              {!problems.amount && <p id="sup-other-hint" className="fm-sup-note">{c("supportOtherHint", limits)}</p>}
            </div>
          )}
          {problems.amount && <p id="sup-amount-err" className="fm-sup-error" role="alert">{problems.amount}</p>}
          <div className="fm-sup-form mt-6">
            {info.coverFee && (
              <label className="fm-sup-check">
                <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} />
                <span>{minor && minor > 0 && !amountProblem(minor, info.minMinor, info.maxMinor) ? c("supportCoverFeeAmount", { amount: money(chargeFor(minor, true).feeMinor) }) : c("supportCoverFee")}</span>
              </label>
            )}
            {info.honour && (
              <>
                <label className="fm-sup-check">
                  <input type="checkbox" checked={honourOn} onChange={(e) => { setHonourOn(e.target.checked); setProblems({ ...problems, honour: undefined }); }} />
                  <span>{c("supportHonour")}</span>
                </label>
                {honourOn && (
                  <fieldset className="fm-sup-honour">
                    <legend className="sr-only">{c("supportHonour")}</legend>
                    <div className="fm-sup-kinds">
                      <label><input type="radio" name="sup-honour-kind" checked={honourKind === "honour"} onChange={() => setHonourKind("honour")} /> {c("supportInHonour")}</label>
                      <label><input type="radio" name="sup-honour-kind" checked={honourKind === "memory"} onChange={() => setHonourKind("memory")} /> {c("supportInMemory")}</label>
                    </div>
                    <Field id="sup-honour-name" label={c("supportHonourName")} problem={problems.honour}>
                      <input id="sup-honour-name" className="fm-track-input" maxLength={100} value={honourName} aria-invalid={!!problems.honour}
                        aria-describedby={problems.honour ? "sup-honour-name-err" : undefined} onChange={(e) => { setHonourName(e.target.value); setProblems({ ...problems, honour: undefined }); }} />
                    </Field>
                  </fieldset>
                )}
              </>
            )}
            <p className="fm-sup-note">{c("supportNoTax")}</p>
          </div>
        </section>

        <section {...regionProps("supportForm")} className="fm-track-card p-5 sm:p-8 fm-sup-form" aria-labelledby="sup-you">
          <h2 id="sup-you" className="fm-track-mono">{c("supportYourDetails")}</h2>
          {error && <div ref={errorRef} tabIndex={-1} className="fm-track-notice outline-none" data-tone="danger" role="alert"><p>{error}</p></div>}
          <Field id="sup-name" label={c("supportName")} problem={problems.name}>
            <input id="sup-name" className="fm-track-input" autoComplete="name" maxLength={100} value={form.name} aria-invalid={!!problems.name}
              aria-describedby={problems.name ? "sup-name-err" : undefined} onChange={(e) => { setForm({ ...form, name: e.target.value }); setProblems({ ...problems, name: undefined }); }} />
          </Field>
          <Field id="sup-email" label={c("supportEmail")} problem={problems.email} hint={c("supportEmailHint")}>
            <input id="sup-email" type="email" className="fm-track-input" autoComplete="email" inputMode="email" maxLength={320} value={form.email} aria-invalid={!!problems.email}
              aria-describedby={problems.email ? "sup-email-err" : "sup-email-hint"} onChange={(e) => { setForm({ ...form, email: e.target.value }); setProblems({ ...problems, email: undefined }); }} />
          </Field>
          <Field id="sup-note" label={c("supportNote")}>
            <textarea id="sup-note" className="fm-track-input" maxLength={500} rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <label className="fm-sup-check">
            <input type="checkbox" checked={form.anonymous} onChange={(e) => setForm({ ...form, anonymous: e.target.checked })} />
            <span>{c("supportAnonymous")}</span>
          </label>
          {/* Only bots fill this in: people never see it, and screen readers skip it. */}
          <div className="fm-sup-trap" aria-hidden="true">
            <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
          <div {...regionProps("supportSummary")} className="fm-track-ledger">
            {feeMinor > 0 && <Row label={c("supportGiftRow")} value={money(minor || 0)} />}
            {feeMinor > 0 && <Row label={c("supportFeeRow")} value={money(feeMinor)} />}
            <div className="fm-track-total">
              <span className="fm-track-mono">{c("supportTotal")}</span>
              <strong translate="no">{totalMinor > 0 ? money(totalMinor) : "–"}</strong>
            </div>
          </div>
          <button type="submit" className="fm-track-btn w-full" disabled={busy || !info.cardsReady}>
            {busy ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> {c("supportWorking")}</> : totalMinor > 0 ? c("supportGive", { amount: money(totalMinor) }) : c("supportGiveNoAmount")}
          </button>
          <p className="fm-sup-note">{c("supportPayNote")}</p>
        </section>
      </form>
    </>
  );
}

function Field({ id, label, problem, hint, children }: { id: string; label: string; problem?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="fm-track-mono block">{label}</label>
      {children}
      {hint && !problem && <p id={`${id}-hint`} className="text-sm fm-muted">{hint}</p>}
      {problem && <p id={`${id}-err`} className="fm-sup-error">{problem}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="fm-track-row"><span className="fm-track-mono">{label}</span><span className="text-right" translate="no">{value}</span></div>;
}

// ── The giver's own page ───────────────────────────────────────────────────────────────────────────────────────────

function Thanks({ id, giftKey, c }: { id: string; giftKey: string; c: Copy }) {
  const [gift, setGift] = useState<GiftView | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const tries = useRef(0);

  const load = () => askGiving("giftView", { giftId: id, key: giftKey }).then((answer) => {
    setFailed(false);
    setGift(answer.gift as GiftView);
  }).catch((err: any) => { if (err?.code === "not_found" || err?.status === 404) setMissing(true); else setFailed(true); });
  useEffect(() => { void load(); }, []);
  // The card page comes back a moment before the payment is confirmed: look again for a minute or so.
  const waiting = gift?.status === "held";
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => { tries.current += 1; if (tries.current > 20) window.clearInterval(timer); else void load(); }, 3000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  if (missing) return <><Intro c={c} /><div {...regionProps("supportNotice")} className="fm-track-notice" data-tone="danger" role="alert"><p>{c("supportGiftNotFound")}</p></div></>;
  if (failed && !gift) {
    return (
      <><Intro c={c} />
        <div className="fm-track-notice" data-tone="danger" role="alert">
          <p>{c("supportLoadError")}</p>
          <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => { setFailed(false); void load(); }}>{c("supportRetry")}</button>
        </div></>
    );
  }
  if (!gift) return <><Intro c={c} /><p role="status" className="fm-sup-empty fm-track-mono"><Loader2 size={16} className="animate-spin inline-block" aria-hidden="true" /> {c("supportLoading")}</p></>;

  const money = (minor: number) => moneyText(minor, gift.currency || "CAD");
  if (gift.status === "held") {
    return <><Intro c={c} /><p role="status" className="fm-sup-empty fm-track-mono"><Loader2 size={16} className="animate-spin inline-block" aria-hidden="true" /> {c("supportConfirming")}</p></>;
  }
  if (gift.status === "cancelled") {
    return (
      <><Intro c={c} />
        <div {...regionProps("supportNotice")} className="fm-track-notice" role="status">
          <p>{c("supportNotPaid")}</p>
          <Link to={kept("/support")} className="fm-track-btn fm-track-btn-ghost">{c("supportTryAgain")}</Link>
        </div></>
    );
  }
  const first = gift.name.split(" ")[0] || gift.name;
  return (
    <>
      <Intro c={c} title={c("supportThanksTitle", { name: first })}>
        <p className="mt-4 text-base leading-7 fm-muted">{gift.refunded ? c("supportRefunded") : c("supportThanksText", { amount: money(gift.amountMinor) })}</p>
      </Intro>
      <section {...regionProps("supportThanks")} className="fm-track-card p-5 sm:p-8 fm-sup-thanks max-w-xl">
        <div className="fm-track-ledger">
          <Row label={c("supportGiftRow")} value={money(gift.amountMinor)} />
          {gift.feeMinor > 0 && <Row label={c("supportFeeRow")} value={money(gift.feeMinor)} />}
          {gift.honour && <Row label={c(gift.honour.kind === "memory" ? "supportInMemory" : "supportInHonour")} value={gift.honour.name} />}
          <div className="fm-track-total">
            <span className="fm-track-mono">{c("supportPaidRow")}</span>
            <strong translate="no">{money(gift.chargedMinor)}</strong>
          </div>
        </div>
        {gift.anonymous && <p className="fm-sup-note">{c("supportAnonymousNote")}</p>}
        <Link to={kept("/")} className="fm-track-btn">{c("supportBackToShop")}</Link>
      </section>
    </>
  );
}
