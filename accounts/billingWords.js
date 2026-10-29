// The Plan & billing page's words (code plan 6.5), from the billing status (services/billing `status`) and a plan
// change preview (`changePlan({ preview: true })`). Shared by the page (billing.js) and its test, so it uses nothing
// from Node and nothing from the browser.

const APP_WORDS = { shop: "the shop", stockroom: "the stockroom" };
const BRANDS = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover", jcb: "JCB", diners: "Diners Club", unionpay: "UnionPay" };

/** "14 November 2026", Toronto time, as the billing emails say it. */
export function day(isoTime) {
  if (!isoTime) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", day: "numeric", month: "long", year: "numeric" }).format(new Date(isoTime));
}

const appList = (apps = []) => apps.map((app) => APP_WORDS[app] ?? app).join(" and ");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Every line of the page's plan, card and cancel cards. */
export function billingWords(billing, now = new Date()) {
  const until = billing.status === "trialing" ? billing.trialEnd : billing.currentPeriodEnd;
  const tax = billing.plusTax ? ", plus tax" : "";
  let state = "Active";
  let when = "";
  if (billing.access === "closed") {
    state = "Closed";
    when = "This plan has ended and the shop is closed. Your books, orders and settings are kept.";
  } else if (billing.access === "paused") {
    state = "Paused";
    when = billing.hasCard ? "Your shop is paused until the payment goes through." : "Your shop is paused. Add a card and it opens again straight away. Nothing is deleted.";
  } else if (billing.cancelAtPeriodEnd) {
    state = "Cancelled";
    when = `Your shop stays open until ${day(until)}. You won't be charged again.`;
  } else if (billing.status === "trialing") {
    state = "Free trial";
    const left = billing.trialDaysLeft ?? Math.max(0, Math.ceil((Date.parse(billing.trialEnd) - now.getTime()) / 86400_000));
    when = billing.hasCard
      ? `Free trial: ${plural(left, "day")} left. Your first payment of ${billing.price}${tax} is on ${day(billing.trialEnd)}.`
      : `Free trial: ${plural(left, "day")} left, until ${day(billing.trialEnd)}. Add a card to keep your shop open after that.`;
  } else if (billing.status === "past_due") {
    state = "Payment problem";
    when = "We couldn't take your last payment. Your shop is still open; update your card so it stays that way.";
  } else if (billing.nextPaymentAt) {
    when = `Next payment: ${billing.price}${tax} on ${day(billing.nextPaymentAt)}.`;
  }

  const closing = billing.appsClosing?.apps?.length
    ? `Your new plan doesn't have ${appList(billing.appsClosing.apps)}. It stays open until ${day(billing.appsClosing.at)}, then closes. You can download everything in it for 90 days after that.`
    : "";
  const card = billing.card ? `${BRANDS[billing.card.brand] ?? "Card"} ending ${billing.card.last4}, runs out ${String(billing.card.expMonth).padStart(2, "0")}/${billing.card.expYear}.` : billing.hasCard ? "A card is on file." : billing.status === "trialing" ? "No card yet. Your trial needs none; add one to keep your shop open after it." : "No card on file. Add one to keep your shop open.";
  const cancel = billing.cancelAtPeriodEnd
    ? `Changed your mind? Keep your plan any time before ${day(until)}.`
    : billing.access === "closed" ? "" : `Your shop stays open until ${day(until)}, and you won't be charged again. You can keep your plan until then.`;
  const cancelAsk = `Cancel your plan? Your shop stays open until ${day(until)}, then closes. Nothing is deleted.`;
  return { state, when, closing, card, cancel, cancelAsk };
}

/** What a plan change does, in a few lines, before the press confirms it. */
export function planChangeWords(preview, billing) {
  const tax = billing?.plusTax ? ", plus tax" : "";
  const lines = [`You move to the ${preview.planName} plan, ${preview.price} a month${tax}.`];
  if (preview.adds?.length) lines.push(`${appList(preview.adds).replace(/^t/, "T")} ${preview.adds.length > 1 ? "open" : "opens"} straight away.`);
  if (preview.closes?.length) {
    lines.push(preview.immediate
      ? `${appList(preview.closes).replace(/^t/, "T")} ${preview.closes.length > 1 ? "close" : "closes"} now. You can download everything in it until ${day(preview.downloadUntil)}.`
      : `${appList(preview.closes).replace(/^t/, "T")} ${preview.closes.length > 1 ? "stay" : "stays"} open until ${day(preview.closesAt)}, the end of the month you've paid for, then ${preview.closes.length > 1 ? "close" : "closes"}. You can download everything in it until ${day(preview.downloadUntil)}.`);
  }
  if (preview.immediate) lines.push(billing?.status === "trialing" ? "You're in your free trial, so this happens now and costs nothing today." : "This happens now.");
  else if (preview.prorated) lines.push(`For the rest of this month you pay ${preview.prorated.text}${tax}, added to your next bill.`);
  else lines.push("Your new price starts with your next payment.");
  return lines;
}
