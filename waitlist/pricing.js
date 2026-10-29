// The waitlist page's pricing (code plan 6.1): the three plans from the platform's `/api/plans` (signup/api.js), "free
// for 14 days, no card needed" and **Start your free trial**. It shows only when the platform says sign-up is open
// (`signupOpen`, the control room's live setting, off by default); closed, unreachable or empty, the page stays today's
// waitlist. Plain ES module with no imports, so the page loads it as is. Words here are customer-facing: never a rival.

/** One line about each plan, in the order the page shows them. */
export const PLAN_LINES = Object.freeze({
  shop: "Your own website for your books, zines and prints, with checkout and shipping.",
  stockroom: "One count of every copy, online and at fairs, even offline at a table.",
  both: "The shop and the stockroom, selling from the same count of every copy.",
});
const ORDER = Object.freeze(["shop", "stockroom", "both"]);

const text = (value, max = 80) => (typeof value === "string" ? value.slice(0, max) : "");

/**
 * What the pricing shows, from the `/api/plans` answer, or null when it shouldn't show (sign-up closed, a failed
 * answer, no plans). Only known plans and plain text go through.
 */
export function pricingView(answer) {
  if (!answer || answer.ok === false || answer.signupOpen !== true || !Array.isArray(answer.plans)) return null;
  const byPlan = new Map(answer.plans.filter((p) => ORDER.includes(p?.plan) && text(p.priceText)).map((p) => [p.plan, p]));
  const plans = ORDER.filter((id) => byPlan.has(id)).map((id) => {
    const p = byPlan.get(id);
    return {
      plan: id,
      name: text(p.name) || id,
      line: PLAN_LINES[id],
      priceText: text(p.priceText),
      foundingPriceText: text(p.foundingPriceText) || null,
      payAsYouSell: p.payAsYouSell && text(p.payAsYouSell.percentText) && text(p.payAsYouSell.capText)
        ? `or ${text(p.payAsYouSell.percentText)} of your website sales, never more than ${text(p.payAsYouSell.capText)} a month`
        : null,
    };
  });
  if (!plans.length) return null;
  const trialDays = Number.isInteger(answer.trialDays) && answer.trialDays > 0 ? answer.trialDays : null;
  const founding = Number.isInteger(answer.foundingOffer?.percentOff) && answer.foundingOffer.percentOff > 0 && plans.some((p) => p.foundingPriceText)
    ? `Founding presses: ${answer.foundingOffer.percentOff}% off for as long as you stay${Number.isInteger(answer.foundingOffer.presses) && answer.foundingOffer.presses > 0 ? `, for the first ${answer.foundingOffer.presses} presses` : ""}.`
    : null;
  return {
    trial: trialDays ? `Free for ${trialDays} days, no card needed.` : "Free to try, no card needed.",
    founding,
    plans,
  };
}

/** Asks the platform for its plans. Any failure means "show the waitlist as it is". */
export async function loadPricing({ fetch, url }) {
  if (!url) return null;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return pricingView(await response.json());
  } catch {
    return null;
  }
}

/** Fills the page's hidden pricing section and shows it. */
export function renderPricing(doc, view, { signupUrl }) {
  if (!view || !signupUrl) return false;
  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(doc.createElement(tag), props);
    node.append(...children);
    return node;
  };
  doc.getElementById("pricing-trial").textContent = view.trial;
  const founding = doc.getElementById("pricing-founding");
  founding.textContent = view.founding ?? "";
  founding.hidden = !view.founding;
  doc.getElementById("plan-cards").replaceChildren(...view.plans.map((p) => {
    const price = view.founding && p.foundingPriceText
      ? el("p", { className: "price" }, el("s", { textContent: p.priceText }), " ", el("strong", { textContent: p.foundingPriceText }), " a month")
      : el("p", { className: "price" }, el("strong", { textContent: p.priceText }), " a month");
    // "Shop and stockroom" is drawn as the one most presses pick (platform-pages.css).
    const card = el("div", { className: p.plan === "both" ? "card plan cp-pick" : "card plan" }, el("div", { className: "cp-kicker", textContent: p.name }), price, el("p", { className: "hint", textContent: p.line }));
    if (p.payAsYouSell) card.append(el("p", { className: "or-pay", textContent: p.payAsYouSell }));
    return card;
  }));
  doc.getElementById("start-trial").href = signupUrl;
  doc.getElementById("pricing").hidden = false;
  doc.getElementById("not-ready").hidden = false;
  return true;
}
