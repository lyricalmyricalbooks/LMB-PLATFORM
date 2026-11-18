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
import { amountForReward, amountProblem, chargeFor, fundraiserFacts, giftFromSearch, rewardStock, storyParagraphs, typedMinor, type GiftView, type GivingInfo } from "./supportRules";
import { cleanShipTo, type PublicFundraiser, type PublicReward, type ShipTo } from "../../../shared/fundraiserRules";
import { currencySign } from "../../../shared/shopCurrency";
import { cleanReceiptAddress, receiptAddressLine, type Charity, type Receipt, type ReceiptAddress } from "../../../shared/charityReceipts";

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

function Intro({ c, children, title, bare }: { c: Copy; children?: React.ReactNode; title?: string; bare?: boolean }) {
  return (
    <div {...regionProps("supportIntro")} className="mb-10 max-w-3xl">
      <p className="fm-track-mono mb-3">{c("supportEyebrow")}</p>
      <h1 tabIndex={-1} className="fm-track-display text-5xl sm:text-6xl outline-none">{title || c("supportTitle")}</h1>
      {bare ? null : children ?? <p className="mt-4 text-base leading-7 fm-muted">{c("supportSubtitle")}</p>}
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
  const [wallMe, setWallMe] = useState(false);
  const [rewardId, setRewardId] = useState("");
  const [rewardNote, setRewardNote] = useState("");
  const [shipTo, setShipTo] = useState<ShipTo>({ name: "", street: "", street2: "", city: "", state: "", zip: "", country: "" });
  const [receiptOn, setReceiptOn] = useState(false);
  const [receiptAddress, setReceiptAddress] = useState<ReceiptAddress>({ street: "", street2: "", city: "", state: "", zip: "", country: "CA" });
  const [problems, setProblems] = useState<{ amount?: string; name?: string; email?: string; honour?: string; reward?: string; address?: string; receipt?: string }>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const fetchInfo = () => askGiving("givingInfo").then((answer) => {
    const next = answer as GivingInfo;
    setInfo(next);
    // Start on a middle amount, so the Give button and the total read at once; the giver can still pick any other.
    const amounts = next.amounts || [];
    setPicked((now) => now ?? (amounts.length ? amounts[Math.min(1, amounts.length - 1)] : next.otherAmount ? "other" : null));
  });
  const load = () => { setFailed(false); fetchInfo().catch(() => setFailed(true)); };
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
  const fund = info.fundraiser && info.fundraiser.state === "live" ? info.fundraiser : null;
  const rewards = fund?.rewards || [];
  const reward = rewards.find((r) => r.id === rewardId && !r.gone) || null;
  // A tax receipt (registered charities only): never with a reward, and a Canadian one needs the giver's address.
  const receipts = info.receipts || null;
  const asksReceipt = !!receipts && !reward && receiptOn;
  const needsAddress = asksReceipt && receipts?.kind === "ca";
  const pickReward = (r: PublicReward | null) => {
    setRewardId(r?.id || "");
    setRewardNote("");
    setProblems({ ...problems, reward: undefined, address: undefined });
    if (!r) return;
    // A gift below the reward's smallest is raised to it, and the giver is told.
    const raise = amountForReward(minor, r, amounts);
    if (!raise) return;
    setPicked(raise.picked);
    if (raise.typed) setTyped(raise.typed);
    setRewardNote(c("supportRewardRaised", { amount: money(r.minMinor) }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountKey = amountProblem(minor, info.minMinor, info.maxMinor);
    const next: typeof problems = {
      amount: amountKey ? c(amountKey, limits) : undefined,
      name: form.name.trim() ? undefined : c("supportNeedName"),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()) ? undefined : c("supportNeedEmail"),
      honour: honourOn && !honourName.trim() ? c("supportNeedHonourName") : undefined,
      reward: reward && (!minor || minor < reward.minMinor) ? c("supportRewardTooSmall", { amount: money(reward.minMinor) }) : undefined,
      receipt: needsAddress && !cleanReceiptAddress(receiptAddress) ? c("supportReceiptNeedAddress") : undefined,
      address: reward?.ships && "problem" in cleanShipTo({ ...shipTo, name: shipTo.name.trim() || form.name }) ? c("supportNeedAddress") : undefined,
    };
    setProblems(next);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    setError("");
    try {
      const answer = await askGiving("giftStart", {
        amountMinor: minor, coverFee: covering, form: info.form, website: form.website, locale: pageLanguage(),
        ...(fund ? { fundraiserId: fund.id, wall: fund.showWall && wallMe && !form.anonymous } : {}),
        ...(fund && reward ? { rewardId: reward.id, ...(reward.ships ? { shipTo: { ...shipTo, name: shipTo.name.trim() || form.name } } : {}) } : {}),
        ...(asksReceipt ? { receipt: true, ...(needsAddress ? { receiptAddress } : {}) } : {}),
        giver: { name: form.name, email: form.email, anonymous: form.anonymous, note: form.note, honour: honourOn ? { kind: honourKind, name: honourName } : null },
      });
      if (answer.url) { window.location.assign(String(answer.url)); return; }
      if (answer.giftId && answer.key) { navigate(kept(`/support?gift=${encodeURIComponent(answer.giftId)}&key=${encodeURIComponent(answer.key)}`)); return; }
      setError(c("supportError"));
    } catch (err: any) {
      // The server's own words for a refused gift (lowest amount, too many tries, cards not set up); ours otherwise.
      setError(err?.code && err?.message && !/^\d+$/.test(err.message) ? err.message : c("supportError"));
      // A form token used up or too old: a fresh one for the next try.
      // The fundraiser ended while the page was open: say so, and show the page without it so the gift can go to the shop.
      if (err?.code === "fundraiser_ended") setError(c("supportFundEnded"));
      if (err?.code === "receiptAddress") { setError(""); setProblems((p) => ({ ...p, receipt: c("supportReceiptNeedAddress") })); }
      // The reward ran out (or the owner changed it) while the page was open: fresh counts, and the giver picks again.
      const rewardGone = ["reward_gone", "reward_unknown", "reward_min"].includes(err?.code);
      if (rewardGone) { setError(c("supportRewardChanged")); setRewardId(""); }
      if (err?.code === "form" || err?.code === "fundraiser_ended" || rewardGone) fetchInfo().catch(() => {});
    } finally { setBusy(false); }
  };

  return (
    <>
      <Intro c={c} title={fund?.title} bare={!!fund} />
      {fund && <Fundraiser f={fund} today={info.today || new Date().toISOString().slice(0, 10)} money={money} c={c} />}
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
          {rewards.length > 0 && (
            <fieldset {...regionProps("supportRewards")} className="fm-sup-rewards" aria-describedby={problems.reward ? "sup-reward-err" : rewardNote ? "sup-reward-note" : undefined}>
              <legend className="fm-track-mono">{c("supportRewardHeading")}</legend>
              <label className="fm-sup-reward" data-picked={!reward || undefined}>
                <input type="radio" name="sup-reward" checked={!reward} onChange={() => pickReward(null)} />
                <span className="fm-sup-reward-name">{c("supportRewardNone")}</span>
              </label>
              {rewards.map((r) => {
                const stock = rewardStock(r);
                return (
                  <label key={r.id} className="fm-sup-reward" data-picked={reward?.id === r.id || undefined} data-gone={r.gone || undefined}>
                    <input type="radio" name="sup-reward" checked={reward?.id === r.id} disabled={r.gone} onChange={() => pickReward(r)} />
                    <span className="fm-sup-reward-body">
                      <span className="fm-sup-reward-name">{r.title}</span>
                      <span className="fm-sup-reward-from" translate="no">{c("supportRewardFrom", { amount: money(r.minMinor) })}</span>
                      {r.description && <span className="fm-sup-reward-text">{r.description}</span>}
                      {(r.when || stock) && (
                        <span className="fm-sup-reward-facts fm-track-mono">
                          {r.when && <span>{c("supportRewardWhen", { when: r.when })}</span>}
                          {stock && <span>{c(...stock)}</span>}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
              {rewardNote && !problems.reward && <p id="sup-reward-note" className="fm-sup-note" role="status">{rewardNote}</p>}
              {problems.reward && <p id="sup-reward-err" className="fm-sup-error" role="alert">{problems.reward}</p>}
            </fieldset>
          )}
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
          {reward?.ships && (
            <fieldset className="fm-sup-ship">
              <legend className="fm-track-mono">{c("supportShipHeading")}</legend>
              {problems.address && <p className="fm-sup-error" role="alert">{problems.address}</p>}
              {([
                ["name", "supportShipName", "shipping name", 80], ["street", "supportShipStreet", "shipping address-line1", 120],
                ["street2", "supportShipStreet2", "shipping address-line2", 120], ["city", "supportShipCity", "shipping address-level2", 80],
                ["state", "supportShipState", "shipping address-level1", 60], ["zip", "supportShipZip", "shipping postal-code", 20],
                ["country", "supportShipCountry", "shipping country-name", 60],
              ] as const).map(([key, label, auto, max]) => (
                <Field key={key} id={`sup-ship-${key}`} label={c(label)}>
                  <input id={`sup-ship-${key}`} className="fm-track-input" autoComplete={auto} maxLength={max}
                    value={key === "name" && !shipTo.name ? "" : shipTo[key]} placeholder={key === "name" ? form.name : undefined}
                    onChange={(e) => { setShipTo({ ...shipTo, [key]: e.target.value }); setProblems({ ...problems, address: undefined }); }} />
                </Field>
              ))}
            </fieldset>
          )}
          {receipts && (reward ? <p className="fm-sup-note">{c("supportReceiptNoReward")}</p> : (
            <div {...regionProps("supportReceipt")} className="fm-sup-receipt-ask">
              <label className="fm-sup-check">
                <input type="checkbox" checked={receiptOn} onChange={(e) => { setReceiptOn(e.target.checked); setProblems({ ...problems, receipt: undefined }); }} />
                <span>{c("supportReceiptAsk")}</span>
              </label>
              <p className="fm-sup-note">{c("supportReceiptAskHint")}</p>
              {needsAddress && (
                <fieldset className="fm-sup-ship" aria-describedby={problems.receipt ? "sup-receipt-err" : undefined}>
                  <legend className="fm-track-mono">{c("supportReceiptAddressHeading")}</legend>
                  {problems.receipt && <p id="sup-receipt-err" className="fm-sup-error" role="alert">{problems.receipt}</p>}
                  {([
                    ["street", "supportShipStreet", "address-line1", 120], ["street2", "supportShipStreet2", "address-line2", 120],
                    ["city", "supportShipCity", "address-level2", 80], ["state", "supportShipState", "address-level1", 40],
                    ["zip", "supportShipZip", "postal-code", 20], ["country", "supportReceiptCountry", "country", 2],
                  ] as const).map(([key, label, auto, max]) => (
                    <Field key={key} id={`sup-receipt-${key}`} label={c(label)}>
                      <input id={`sup-receipt-${key}`} className="fm-track-input" autoComplete={auto} maxLength={max} value={receiptAddress[key]}
                        onChange={(e) => { setReceiptAddress({ ...receiptAddress, [key]: key === "country" ? e.target.value.toUpperCase() : e.target.value }); setProblems({ ...problems, receipt: undefined }); }} />
                    </Field>
                  ))}
                </fieldset>
              )}
            </div>
          ))}
          <label className="fm-sup-check">
            <input type="checkbox" checked={form.anonymous} onChange={(e) => setForm({ ...form, anonymous: e.target.checked })} />
            <span>{c("supportAnonymous")}</span>
          </label>
          {fund?.showWall && !form.anonymous && (
            <label className="fm-sup-check">
              <input type="checkbox" checked={wallMe} onChange={(e) => setWallMe(e.target.checked)} />
              <span>{c("supportWallMe")}</span>
            </label>
          )}
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

/** The fundraiser on top of the page: how much is in, the bar, supporters and time left, the owner's story and the wall. */
function Fundraiser({ f, today, money, c }: { f: PublicFundraiser; today: string; money: (minor: number) => string; c: Copy }) {
  const facts = fundraiserFacts(f, today);
  const story = storyParagraphs(f.story);
  return (
    <div className="fm-sup-fund mb-10">
      <section {...regionProps("supportFundraiser")} className="fm-track-card p-5 sm:p-8" aria-label={f.title}>
        <p className="fm-sup-raised"><strong translate="no">{money(f.raisedMinor)}</strong> <span>{c("supportFundRaised", { goal: money(f.goalMinor) })}</span></p>
        <div className="fm-sup-bar" role="progressbar" aria-label={c("supportFundBar")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={facts.bar}>
          <span style={{ width: `${facts.bar}%` }} />
        </div>
        <p className="fm-sup-facts fm-track-mono">
          <span>{c(...facts.supporters)}</span>
          <span>{facts.reached ? c("supportFundReached") : c(...facts.when)}</span>
        </p>
        {story.length > 0 && <div className="fm-sup-story">{story.map((p, i) => <p key={i}>{p}</p>)}</div>}
      </section>
      {f.showWall && f.wall.length > 0 && (
        <section {...regionProps("supportWall")} className="fm-sup-wall" aria-labelledby="sup-wall">
          <h2 id="sup-wall" className="fm-track-mono">{c("supportWallTitle")}</h2>
          <ul>{f.wall.map((w, i) => <li key={`${w.name}-${i}`}>{w.name}</li>)}</ul>
        </section>
      )}
    </div>
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
  const [charity, setCharity] = useState<Charity | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const tries = useRef(0);

  const load = () => askGiving("giftView", { giftId: id, key: giftKey }).then((answer) => {
    setFailed(false);
    setGift(answer.gift as GiftView);
    setCharity((answer.charity as Charity | null) || null);
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
          {gift.reward && <Row label={c("supportRewardRow")} value={gift.reward.when ? `${gift.reward.title} · ${c("supportRewardWhen", { when: gift.reward.when })}` : gift.reward.title} />}
          <div className="fm-track-total">
            <span className="fm-track-mono">{c("supportPaidRow")}</span>
            <strong translate="no">{money(gift.chargedMinor)}</strong>
          </div>
        </div>
        {gift.anonymous && <p className="fm-sup-note">{c("supportAnonymousNote")}</p>}
        <Link to={kept("/")} className="fm-track-btn">{c("supportBackToShop")}</Link>
      </section>
      {gift.receipt && charity && <TaxReceipt receipt={gift.receipt} charity={charity} money={money} c={c} />}
    </>
  );
}

/** The giver's tax receipt (G3), laid out to print on its own: the charity's wording for its kind. */
function TaxReceipt({ receipt, charity, money, c }: { receipt: Receipt; charity: Charity; money: (minor: number) => string; c: Copy }) {
  const ca = charity.kind !== "us";
  const cancelled = receipt.status === "cancelled";
  return (
    <section {...regionProps("supportReceiptCard")} className="fm-track-card p-5 sm:p-8 fm-sup-receipt max-w-xl mt-8" aria-labelledby="sup-receipt" data-cancelled={cancelled || undefined}>
      <h2 id="sup-receipt" className="fm-track-mono">{c("supportReceiptHeading")}</h2>
      <p className="fm-sup-receipt-title">{c(ca ? "supportReceiptTitleCa" : "supportReceiptTitleUs")}</p>
      {receipt.test && <div className="fm-track-notice" data-tone="danger" role="note"><p>{c("supportReceiptTest")}</p></div>}
      {cancelled && <div className="fm-track-notice" data-tone="danger" role="note"><p>{c("supportReceiptCancelled")}</p></div>}
      <div className="fm-track-ledger">
        <Row label={c("supportReceiptNumber")} value={receipt.number} />
        {receipt.replaces && <Row label={c("supportReceiptReplaces")} value={receipt.replaces} />}
        <Row label={c("supportReceiptIssued")} value={receipt.issuedOn} />
        <Row label={c("supportReceiptReceived")} value={receipt.receivedOn} />
        <Row label={c("supportReceiptDonor")} value={[receipt.name, receiptAddressLine(receipt.address)].filter(Boolean).join(", ")} />
        <Row label={c("supportGiftRow")} value={money(receipt.eligibleMinor)} />
        {ca && <Row label={c("supportReceiptEligible")} value={money(receipt.eligibleMinor)} />}
        <Row label={c("supportReceiptCharity")} value={`${charity.name}, ${charity.address}`} />
        <Row label={c(ca ? "supportReceiptCharityNoCa" : "supportReceiptCharityNoUs")} value={charity.number} />
        {ca && charity.signer && <Row label={c("supportReceiptSigned")} value={charity.signer} />}
      </div>
      <p className="fm-sup-note">{c(ca ? "supportReceiptCra" : "supportReceiptNoGoods")}</p>
      {!cancelled && <button type="button" className="fm-track-btn fm-track-btn-ghost fm-sup-print" onClick={() => window.print()}>{c("supportReceiptPrint")}</button>}
    </section>
  );
}
