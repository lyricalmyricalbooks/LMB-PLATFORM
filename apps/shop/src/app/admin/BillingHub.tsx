import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CreditCard, ExternalLink, Plus } from "lucide-react";
import {
  DataTable, DestructiveButton, Dialog, EmptyState, ErrorState, LoadingState, PrimaryButton, SecondaryButton, SectionCard, SelectField,
  StatusBadge, TextArea, TextField, useConfirm,
} from "./riso/components";
import { hubReady, planDate, type PlatformPlan } from "./platformPlan";
import {
  BillingCallError, LEAVING_CHOICES, PROVINCES, appsInWords, billState, billingCall, previewWords, statusBadge,
  type Bill, type BillingDetails, type PaymentWayView, type PlanId, type PlanPreview, type SavedCard, type StatusAnswer, type UpcomingBill,
} from "./platformBilling";

// The billing hub inside the shop admin (code plan 22.3), where Shopify keeps it:
//   Settings › Plan     the plan, comparing and changing plans, how you pay, cancelling or keeping it
//   Settings › Billing  a payment problem with Pay now, the next bill, saved cards, billing details, past bills
// Every call goes to the platform (platformBilling.ts), which checks this is the shop's owner. On a paid plan the
// changes need two-step sign-in, which this admin's sign-in doesn't offer yet: those answers carry the account page,
// and the hub sends the owner there to finish. Admin-only words, plain and with no technical terms.

type Hub = { plan: PlatformPlan & { hub: string; shopId: string } };

/** The platform's answer to "where does this shop's plan stand?", read again after every change. */
function useBillingStatus(plan: Hub["plan"]) {
  const [answer, setAnswer] = useState<StatusAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setAnswer(await billingCall<StatusAnswer>(plan, "status"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Billing couldn't be read.");
    }
  }, [plan.hub, plan.shopId]);
  // The plan document changes after every billing change (a card added on Stripe's page, an event): read again then.
  useEffect(() => { void load(); }, [load, plan.state, plan.hasCard, plan.cancelAtPeriodEnd, plan.paymentWay, plan.nextPaymentAt]);
  return { answer, error, load };
}

/** A problem from a call: plain words, and on a paid plan's change the button that finishes it on the account page. */
function Problem({ error }: { error: BillingCallError | Error | null }) {
  if (!error) return null;
  const twoStep = error instanceof BillingCallError && error.twoStep && error.accountPage;
  return (
    <div role="alert" className="rp-alert" data-tone={twoStep ? "warning" : "danger"}>
      <span className="rp-alert-glyph" aria-hidden="true">!</span>
      <div className="rp-alert-text"><span className="rp-alert-detail">{error.message}</span></div>
      {twoStep && (
        <div className="rp-alert-actions">
          <a className="rp-btn rp-btn-primary rp-btn-sm" href="#settings/security">Set up two-step sign-in</a>
          <a className="rp-btn rp-btn-secondary rp-btn-sm" href={error.accountPage!}><ExternalLink size={14} aria-hidden /> Or use your account page</a>
        </div>
      )}
    </div>
  );
}

/** Runs one change: busy while it runs, the problem kept to show, and the status read again after. */
function useChange(after: () => Promise<void> | void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const run = useCallback(async <T,>(name: string, work: () => Promise<T>): Promise<T | undefined> => {
    setBusy(name);
    setError(null);
    try {
      const result = await work();
      await after();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      return undefined;
    } finally {
      setBusy(null);
    }
  }, [after]);
  return { busy, error, run, clear: () => setError(null) };
}

const Facts = ({ rows }: { rows: Array<[string, ReactNode]> }) => (
  <dl style={{ margin: 0, display: "grid", gap: 10 }}>
    {rows.map(([label, value]) => (
      <div key={label} style={{ display: "grid", gridTemplateColumns: "minmax(96px, 35%) minmax(0, 1fr)", gap: 12 }}>
        <dt className="rp-label">{label}</dt>
        <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{value}</dd>
      </div>
    ))}
  </dl>
);

/** A note shown once, up front, when this plan's changes finish on the account page. */
function TwoStepNote({ answer }: { answer: StatusAnswer }) {
  if (!answer.changesNeedTwoStep) return null;
  return (
    <p className="rp-hint" style={{ margin: 0 }} data-two-step-note="">
      Your plan is paid, so changes to your plan, cards and billing details need two-step sign-in. Turn it on under <a href="#settings/security">Settings › Security</a>, then sign in again with your code.
    </p>
  );
}

/** Settings › Plan. */
export function PlanPage({ plan }: Hub) {
  const { answer, error, load } = useBillingStatus(plan);
  const change = useChange(load);
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [words, setWords] = useState("");
  const [way, setWay] = useState<PaymentWayView | null>(null);

  const loadWay = useCallback(async () => {
    try { setWay((await billingCall<{ view: PaymentWayView }>(plan, "payment-way")).view); } catch { setWay(null); }
  }, [plan.hub, plan.shopId]);
  useEffect(() => { void loadWay(); }, [loadWay, answer?.billing?.paymentWay]);

  if (!answer && error) return <ErrorState title="Plan not loaded" description={error} onRetry={() => void load()} />;
  if (!answer) return <LoadingState label="Reading your plan…" />;
  const billing = answer.billing;
  if (!billing) return <SectionCard title="Your plan"><EmptyState inline title="No plan yet" description="Your plan shows here once it has started." /></SectionCard>;
  const badge = statusBadge(billing);
  const ended = ["canceled", "incomplete_expired"].includes(billing.status);
  const price = billing.founding?.price
    ? <><s className="rp-hint">{billing.price}</s> {billing.founding.price} a month{billing.plusTax ? " plus tax" : ""}<span style={{ display: "block", marginTop: 6 }}><StatusBadge tone="success">Founding: {billing.founding.percentOff}% off for good</StatusBadge></span></>
    : `${billing.price} a month${billing.plusTax ? " plus tax" : ""}`;

  const facts: Array<[string, ReactNode]> = [["Plan", billing.planName || "Not chosen yet"], ["Price", price]];
  if (billing.status === "trialing" && billing.trialEnd) facts.push(["Free trial ends", `${planDate(billing.trialEnd)}${billing.trialDaysLeft !== null ? ` (${billing.trialDaysLeft <= 1 ? "last day" : `${billing.trialDaysLeft} days left`})` : ""}`]);
  if (billing.nextPaymentAt) facts.push(["Next payment", planDate(billing.nextPaymentAt)]);
  if (billing.cancelAtPeriodEnd && !ended) facts.push(["Plan ends", planDate(billing.status === "trialing" ? billing.trialEnd : billing.currentPeriodEnd)]);
  // Changed your mind: one click takes the plan back to one with every app open now (keep-closing-apps).
  if (billing.appsClosing) facts.push(["Closing", <>
    <span style={{ display: "block" }}>{`${appsInWords(billing.appsClosing.apps).replace(/^./, (c) => c.toUpperCase())} on ${planDate(billing.appsClosing.at)}`}</span>
    {!ended && <span style={{ display: "block", marginTop: 6 }}><SecondaryButton size="sm" busy={change.busy === "keep-closing"} onClick={() => void change.run("keep-closing", () => billingCall(plan, "keep-closing-apps"))}>{`Keep ${appsInWords(billing.appsClosing.apps)}`}</SecondaryButton></span>}
  </>]);
  facts.push(["Card", billing.card?.words ?? (billing.paymentWay === "payAsYouSell" ? "Not needed while you pay as you sell" : "No card yet")]);

  const askPreview = (to: PlanId) => change.run("preview", async () => {
    setPreview((await billingCall<{ preview: PlanPreview }>(plan, "change-plan", { plan: to, preview: true })).preview);
  });
  const confirmPlan = async () => {
    if (!preview) return;
    const done = await change.run("change", () => billingCall(plan, "change-plan", { plan: preview.plan }));
    if (done !== undefined) setPreview(null);
  };
  const cancel = async () => {
    const done = await change.run("cancel", () => billingCall(plan, "cancel", { reason: reason || undefined, words: words.trim() || undefined }));
    if (done !== undefined) setCancelOpen(false);
  };

  return (
    <div className="rp-stack" style={{ gap: 16 }} data-billing-hub="plan">
      <SectionCard title="Your plan" actions={<StatusBadge tone={badge.tone}>{badge.word}</StatusBadge>} collapsible={false}>
        <div className="rp-stack" style={{ gap: 16 }}>
          <Facts rows={facts} />
          {billing.cancelAtPeriodEnd && !ended && (
            <div className="flex flex-wrap gap-3 items-center">
              <PrimaryButton busy={change.busy === "keep"} onClick={() => void change.run("keep", () => billingCall(plan, "keep"))}>Keep my plan</PrimaryButton>
              <span className="rp-hint">Your shop stays open until then either way.</span>
            </div>
          )}
          <TwoStepNote answer={answer} />
        </div>
      </SectionCard>

      <Problem error={change.error} />

      {!ended && (
        <SectionCard title="Change plan" description="Switch at any time. Adding an app starts right away; dropping one keeps it open to the end of the month you've paid for." collapsible={false}>
          <div className="rp-choices" role="radiogroup" aria-label="Plans">
            {billing.plans.map((option) => (
              <label key={option.plan} className="rp-choice" data-plan-option={option.plan}>
                <input type="radio" name="colophon-plan" value={option.plan} checked={billing.plan === option.plan} disabled={change.busy !== null}
                  onChange={() => { if (option.plan !== billing.plan) void askPreview(option.plan); }} />
                <span>
                  <span className="rp-choice-label">{option.name}{billing.plan === option.plan ? " (your plan)" : ""}</span>
                  <span className="rp-hint" style={{ display: "block" }}>{option.price} a month{billing.plusTax ? " plus tax" : ""}. Opens {appsInWords(option.apps)}.</span>
                </span>
              </label>
            ))}
          </div>
        </SectionCard>
      )}

      {way && (
        <SectionCard title={way.title} collapsible={false}>
          <div className="rp-stack" style={{ gap: 12 }}>
            {way.lines.map((line) => <p key={line} style={{ margin: 0 }}>{line}</p>)}
            {way.note && <p className="rp-hint" style={{ margin: 0 }}>{way.note}</p>}
            {way.button && (
              <div><SecondaryButton busy={change.busy === "way"} onClick={() => void change.run("way", async () => { await billingCall(plan, "payment-way/switch", { to: way.button!.to }); await loadWay(); })}>{way.button.label}</SecondaryButton></div>
            )}
          </div>
        </SectionCard>
      )}

      {!ended && !billing.cancelAtPeriodEnd && (
        <SectionCard title="Cancel your plan" description="Your shop stays open to the end of the month you've paid for (or your trial), and you can change your mind until then." collapsible={false}>
          <div><DestructiveButton onClick={() => setCancelOpen(true)}>Cancel plan</DestructiveButton></div>
        </SectionCard>
      )}

      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview ? `Switch to ${preview.planName}?` : ""}
        footer={<>
          <SecondaryButton onClick={() => setPreview(null)}>Not now</SecondaryButton>
          <PrimaryButton busy={change.busy === "change"} onClick={() => void confirmPlan()}>Switch plan</PrimaryButton>
        </>}>
        <div className="rp-stack" style={{ gap: 10 }}>
          {preview && previewWords(preview, planDate).map((line) => <p key={line} style={{ margin: 0 }}>{line}</p>)}
          <Problem error={change.error} />
        </div>
      </Dialog>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel your plan?"
        description="Nothing is deleted when you cancel. You can download everything for 90 days after your shop closes."
        footer={<>
          <SecondaryButton onClick={() => setCancelOpen(false)}>Keep my plan</SecondaryButton>
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
    </div>
  );
}

const EMPTY_ADDRESS = { line1: "", line2: "", city: "", state: "ON", postalCode: "", country: "CA" };

/** Settings › Billing. */
export function BillingPage({ plan }: Hub) {
  const { answer, error, load } = useBillingStatus(plan);
  const [cards, setCards] = useState<SavedCard[] | null>(null);
  const [bill, setBill] = useState<UpcomingBill | null | undefined>(undefined);
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [details, setDetails] = useState<BillingDetails | null>(null);
  const [draft, setDraft] = useState<{ name: string; email: string; address: typeof EMPTY_ADDRESS; taxNumber: string } | null>(null);
  const [saved, setSaved] = useState(false);
  // A part that couldn't be read says so, rather than looking empty ("No card yet" while a card is saved).
  const [failed, setFailed] = useState<Partial<Record<"cards" | "bill" | "bills" | "details", string>>>({});
  const [confirm, dialog] = useConfirm();

  const loadParts = useCallback(async () => {
    const [c, u, b, d] = await Promise.allSettled([
      billingCall<{ cards: SavedCard[] }>(plan, "payment-methods"),
      billingCall<{ bill: UpcomingBill | null }>(plan, "upcoming"),
      billingCall<{ invoices: Bill[] }>(plan, "invoices"),
      billingCall<{ details: BillingDetails }>(plan, "details"),
    ]);
    const why = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : "Something went wrong. Try again in a minute.") : undefined);
    setFailed({ cards: why(c), bill: why(u), bills: why(b), details: why(d) });
    if (c.status === "fulfilled") setCards(c.value.cards);
    if (u.status === "fulfilled") setBill(u.value.bill);
    if (b.status === "fulfilled") setBills(b.value.invoices);
    if (d.status === "fulfilled") {
      setDetails(d.value.details);
      setDraft({ name: d.value.details.name, email: d.value.details.email, address: d.value.details.address ? { ...EMPTY_ADDRESS, ...d.value.details.address } : { ...EMPTY_ADDRESS }, taxNumber: d.value.details.taxNumber });
    }
  }, [plan.hub, plan.shopId]);
  const reload = useCallback(async () => { await Promise.all([load(), loadParts()]); }, [load, loadParts]);
  const change = useChange(reload);
  useEffect(() => { void loadParts(); }, [loadParts, plan.hasCard, plan.state]);

  // Back from Stripe's card page: the card can take a moment to arrive.
  const [cardBack] = useState(() => typeof window !== "undefined" && /[?&]card=added/.test(window.location.search));

  if (!answer && error) return <ErrorState title="Billing not loaded" description={error} onRetry={() => void reload()} />;
  if (!answer) return <LoadingState label="Reading your billing…" />;
  const billing = answer.billing;
  if (!billing) return <SectionCard title="Billing"><EmptyState inline title="No bills yet" description="Your bills and cards show here once your plan has started." /></SectionCard>;
  const problem = billing.paymentProblem;

  const addCard = () => change.run("card", async () => {
    const { url } = await billingCall<{ url: string }>(plan, "card");
    if (/^https:\/\//.test(url)) window.location.assign(url);
  });
  const remove = async (card: SavedCard) => {
    if (!(await confirm({ title: "Remove this card?", message: `${card.words} will be taken off your account.`, confirmLabel: "Remove card" }))) return;
    await change.run(`remove-${card.id}`, () => billingCall(plan, "payment-methods/remove", { cardId: card.id }));
  };
  const payNow = () => change.run("pay", async () => {
    const result = await billingCall<{ paid?: boolean; needsConfirming?: boolean; url?: string | null }>(plan, "pay-now");
    if (result.needsConfirming && result.url) window.location.assign(result.url);
  });
  const saveDetails = async () => {
    if (!draft) return;
    setSaved(false);
    const hasAddress = draft.address.line1 || draft.address.city || draft.address.postalCode;
    const done = await change.run("details", () => billingCall(plan, "details/save", { name: draft.name, email: draft.email, taxNumber: draft.taxNumber, address: hasAddress ? draft.address : null }));
    if (done !== undefined) setSaved(true);
  };
  const setAddress = (patch: Partial<typeof EMPTY_ADDRESS>) => setDraft((d) => (d ? { ...d, address: { ...d.address, ...patch } } : d));

  return (
    <div className="rp-stack" style={{ gap: 16 }} data-billing-hub="billing">
      {cardBack && <div role="status" className="rp-alert"><span className="rp-alert-glyph" aria-hidden="true">i</span><div className="rp-alert-text"><span className="rp-alert-detail">Thanks, your card is saved. It can take a minute to show here.</span></div></div>}
      {problem && (
        <div role="alert" className="rp-alert" data-tone="danger" data-payment-problem={problem.kind}>
          <span className="rp-alert-glyph" aria-hidden="true">!</span>
          <div className="rp-alert-text">
            <span className="rp-alert-kicker">Billing</span>
            <strong className="rp-alert-title">{problem.kind === "confirm" ? "Your bank wants you to confirm a payment." : `We couldn't take your ${problem.amount} payment.`}</strong>
            <span className="rp-alert-detail">{problem.kind === "confirm"
              ? "It's a normal safety step some banks take. Your shop stays open meanwhile."
              : `Your shop stays open while we sort it out.${problem.nextTry ? ` We'll try again on ${planDate(problem.nextTry)}.` : ""} Pay now, or add another card first.`}</span>
          </div>
          <div className="rp-alert-actions">
            {problem.kind === "confirm" && problem.pageUrl
              ? <a className="rp-btn rp-btn-primary rp-btn-sm" href={problem.pageUrl}>Confirm the payment</a>
              : billing.canPayNow && <PrimaryButton size="sm" busy={change.busy === "pay"} onClick={() => void payNow()}>Pay now</PrimaryButton>}
          </div>
        </div>
      )}
      {billing.cardRunsOut && !problem && (
        <div role="status" className="rp-alert" data-tone="warning" data-card-runs-out>
          <span className="rp-alert-glyph" aria-hidden="true">!</span>
          <div className="rp-alert-text">
            <span className="rp-alert-kicker">Card</span>
            <strong className="rp-alert-title">{billing.cardRunsOut.expired ? `Your ${billing.card?.words ?? "card"} has run out.` : `Your ${billing.card?.words ?? "card"} runs out on ${planDate(billing.cardRunsOut.ends)}.`}</strong>
            <span className="rp-alert-detail">Add a new card so your next payment goes through and your shop stays open.</span>
          </div>
          <div className="rp-alert-actions"><PrimaryButton size="sm" busy={change.busy === "card"} onClick={() => void addCard()}>Add a card</PrimaryButton></div>
        </div>
      )}
      <Problem error={change.error} />
      <TwoStepNote answer={answer} />

      <SectionCard title="Next bill" collapsible={false}>
        {failed.bill && bill === undefined ? <ErrorState title="Next bill not loaded" description={failed.bill} onRetry={() => void loadParts()} />
          : bill === undefined ? <LoadingState label="Working out your next bill…" />
          : !bill ? <p className="rp-hint" style={{ margin: 0 }}>{billing.paymentWay === "payAsYouSell" ? "You pay as you sell: a small share comes out of each website sale, so there's no monthly bill." : billing.cancelAtPeriodEnd ? "No more bills: your plan ends at the end of this period." : "No bill is coming."}</p>
          : (
            <Facts rows={[
              ["Date", bill.date ? planDate(bill.date) : "When your trial ends"],
              ...bill.lines.map((line, i): [string, ReactNode] => [i === 0 ? "For" : "", `${line.words}: ${line.amount}`]),
              ...(bill.discount ? [["Founding discount", `−${bill.discount}`] as [string, ReactNode]] : []),
              ...(bill.tax ? [["Tax", bill.tax] as [string, ReactNode]] : billing.plusTax ? [["Tax", "Added when the bill is made"] as [string, ReactNode]] : []),
              ["Total", <strong key="t">{bill.total}</strong>],
            ]} />
          )}
      </SectionCard>

      <SectionCard title="Payment methods" description="The primary card pays your plan. Cards are saved by our payment partner; we never see the full number."
        actions={<SecondaryButton size="sm" icon={<Plus size={14} aria-hidden />} busy={change.busy === "card"} onClick={() => void addCard()}>Add a card</SecondaryButton>} collapsible={false}>
        {failed.cards && cards === null ? <ErrorState title="Cards not loaded" description={failed.cards} onRetry={() => void loadParts()} />
          : cards === null ? <LoadingState label="Reading your cards…" />
          : !cards.length ? <EmptyState inline icon={<CreditCard size={20} aria-hidden />} title="No card yet" description={billing.status === "trialing" ? "Add one before your trial ends so your shop stays open. You won't be charged until then." : "Add a card to keep your shop open."} />
          : (
            <ul className="rp-stack" style={{ gap: 0, listStyle: "none", margin: 0, padding: 0 }}>
              {cards.map((card) => (
                <li key={card.id} className="flex flex-wrap items-center gap-3" style={{ padding: "12px 0", borderTop: "1px solid var(--rp-divider)" }} data-card={card.id}>
                  <CreditCard size={18} aria-hidden />
                  <span style={{ flex: "1 1 160px", minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{card.words}</span>
                    <span className="rp-hint" style={{ display: "block" }}>{card.expMonth && card.expYear ? `Expires ${String(card.expMonth).padStart(2, "0")}/${card.expYear}` : ""}</span>
                  </span>
                  {card.primary && <StatusBadge tone="success">Primary</StatusBadge>}
                  {card.expired && <StatusBadge tone="danger">Expired</StatusBadge>}
                  {!card.primary && (
                    <span className="flex gap-2">
                      <SecondaryButton size="sm" busy={change.busy === `primary-${card.id}`} onClick={() => void change.run(`primary-${card.id}`, () => billingCall(plan, "payment-methods/primary", { cardId: card.id }))}>Make primary</SecondaryButton>
                      <SecondaryButton size="sm" busy={change.busy === `remove-${card.id}`} onClick={() => void remove(card)}>Remove</SecondaryButton>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
      </SectionCard>

      <SectionCard title="Billing details" description="Printed on every bill. Bills and billing emails go to this address." collapsible={false}>
        {failed.details && !draft ? <ErrorState title="Billing details not loaded" description={failed.details} onRetry={() => void loadParts()} />
          : !draft ? <LoadingState label="Reading your billing details…" /> : (
          <form className="rp-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); void saveDetails(); }}>
            <TextField label="Business name" autoComplete="organization" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <TextField label="Email for bills" type="email" autoComplete="email" required value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            <TextField label="Street address" autoComplete="address-line1" value={draft.address.line1} onChange={(e) => setAddress({ line1: e.target.value })} />
            <TextField label="Apartment, suite (optional)" autoComplete="address-line2" value={draft.address.line2} onChange={(e) => setAddress({ line2: e.target.value })} />
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <TextField label="City" autoComplete="address-level2" value={draft.address.city} onChange={(e) => setAddress({ city: e.target.value })} />
              <SelectField label="Province or territory" value={draft.address.state} onChange={(e) => setAddress({ state: e.target.value })}>
                {PROVINCES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </SelectField>
              <TextField label="Postal code" autoComplete="postal-code" value={draft.address.postalCode} onChange={(e) => setAddress({ postalCode: e.target.value })} />
            </div>
            <TextField label="GST/HST or QST number (optional)" hint="Printed on your bills so you can claim the tax back. For example 123456789 RT 0001." value={draft.taxNumber} onChange={(e) => setDraft({ ...draft, taxNumber: e.target.value })} />
            {details?.plusTax && <p className="rp-hint" style={{ margin: 0 }}>Prices are plus tax. The tax is worked out from this address.</p>}
            <div className="flex flex-wrap items-center gap-3">
              <PrimaryButton type="submit" busy={change.busy === "details"}>Save billing details</PrimaryButton>
              {saved && <span role="status" className="rp-hint">Saved.</span>}
            </div>
          </form>
        )}
      </SectionCard>

      <SectionCard title="Bills" description="Every bill, newest first, with a copy to download." collapsible={false}>
        {failed.bills && bills === null ? <ErrorState title="Bills not loaded" description={failed.bills} onRetry={() => void loadParts()} />
          : bills === null ? <LoadingState label="Reading your bills…" /> : (
          <DataTable<Bill> caption="Your bills" rows={bills} rowKey={(b) => b.id} stackOnPhone
            empty={<EmptyState inline title="No bills yet" description={billing.status === "trialing" ? "Your first bill comes when your trial ends." : "Your bills show here."} />}
            columns={[
              { key: "date", header: "Date", lead: true, render: (b) => (b.date ? planDate(b.date) : "") },
              { key: "number", header: "Bill", render: (b) => b.number || "—" },
              { key: "amount", header: "Amount", numeric: true, render: (b) => <>{b.amount}{b.tax ? <span className="rp-hint" style={{ display: "block" }}>incl. {b.tax} tax</span> : null}</> },
              { key: "status", header: "Status", render: (b) => { const s = billState(b.status); return <StatusBadge tone={s.tone}>{s.word}</StatusBadge>; } },
              { key: "copy", header: "Copy", render: (b) => (b.pdfUrl ? <a href={b.pdfUrl} target="_blank" rel="noopener noreferrer">Download</a> : b.pageUrl ? <a href={b.pageUrl} target="_blank" rel="noopener noreferrer">View</a> : "") },
            ]} />
        )}
      </SectionCard>
      {dialog}
    </div>
  );
}

/** A Settings page for a plan document that predates the hub: the old link to the account page. */
export function HubNotReady({ plan }: { plan: PlatformPlan }) {
  return (
    <SectionCard title="Plan and billing">
      <div className="rp-stack" style={{ gap: 12 }}>
        <p style={{ margin: 0 }}>Your plan, cards and bills are on your account page for now. They'll show here after your plan's next update.</p>
        {plan.link && <div><a className="rp-btn rp-btn-primary rp-btn-sm" href={plan.link}>Open your account page</a></div>}
      </div>
    </SectionCard>
  );
}

export const canUseHub = hubReady;
