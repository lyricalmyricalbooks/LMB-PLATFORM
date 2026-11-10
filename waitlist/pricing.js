// The pricing page (code plan 6.1; pay what you use since 10 November 2026). A shop pays what it cost to run that
// month, at cost, plus a flat platform fee. The page shows the fee, three example shops priced by the platform itself
// (`/api/plans` › `usage`, from services/billing/runningCost.js), what every shop gets, and "free for 14 days, no card
// needed". It shows only when the platform says sign-up is open (`signupOpen`, the control room's live setting, off by
// default); closed, unreachable or empty, the page stays today's waitlist. Plain ES module with no imports, so the page
// loads it as is. Words here are customer-facing: never a rival.

/** What every shop gets (one product since 10 November 2026: no plan to choose). */
export const INCLUDED = Object.freeze([
  ["Your website", "Sell online, with your own look and address"],
  ["Your stockroom", "Track stock, sales and payouts from fairs and stores"],
  ["Kept in step", "Every sale, online or in person, counts down the same stock"],
]);
const EXAMPLES = Object.freeze(["quiet", "typical", "busy"]);

const text = (value, max = 80) => (typeof value === "string" ? value.slice(0, max) : "");

/**
 * What the pricing shows, from the `/api/plans` answer, or null when it shouldn't show (sign-up closed, a failed
 * answer, no fee). Only known plans, known example shops and plain text go through.
 */
export function pricingView(answer) {
  if (!answer || answer.ok === false || answer.signupOpen !== true || !Array.isArray(answer.plans)) return null;
  const usage = answer.usage;
  const feeText = text(usage?.feeText);
  if (!feeText) return null;
  const examples = (Array.isArray(usage.examples) ? usage.examples : [])
    .filter((e) => EXAMPLES.includes(e?.id) && text(e.totalText) && text(e.runningText))
    .map((e) => ({ id: e.id, name: text(e.name), line: text(e.line), runningText: text(e.runningText), totalText: text(e.totalText) }));
  const trialDays = Number.isInteger(answer.trialDays) && answer.trialDays > 0 ? answer.trialDays : null;
  const foundingFeeText = text(usage.foundingFeeText) || null;
  const percentOff = answer.foundingOffer?.percentOff;
  const founding = foundingFeeText && Number.isInteger(percentOff) && percentOff > 0
    ? `Founding shops pay ${foundingFeeText} instead of ${feeText}, for as long as they stay${Number.isInteger(answer.foundingOffer.presses) && answer.foundingOffer.presses > 0 ? ` (first ${answer.foundingOffer.presses} shops)` : ""}.`
    : null;
  return {
    feeText,
    sameFee: usage.sameFee !== false,
    lede: `Each month you pay what your shop cost to run, at cost, plus ${feeText} for Colophon.${trialDays ? ` Free for ${trialDays} days, no card needed.` : " Free to try, no card needed."}`,
    trialDays,
    founding,
    examples,
    note: `Prices in ${text(answer.currency, 3) || "CAD"}${answer.plusTax ? ", plus tax" : ""}. Running cost covers storage, web traffic, background jobs and emails. You choose an amount, and we email you if a month looks set to pass it${text(usage.alertText) ? ` (${text(usage.alertText)} unless you change it)` : ""}.`,
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
  doc.getElementById("pricing-lede").textContent = view.lede;
  const founding = doc.getElementById("pricing-founding");
  founding.textContent = view.founding ?? "";
  founding.hidden = !view.founding;
  // What three shops pay: the typical one (in the middle) drawn as the one most shops are like.
  doc.getElementById("plan-cards").replaceChildren(...view.examples.map((e) => {
    const typical = e.id === "typical";
    return el("div", { className: typical ? "card plan cp-pick cp-typical" : "card plan" },
      el("h3", { textContent: e.name }), el("p", { className: "hint", textContent: e.line }),
      el("p", { className: "price" }, el("strong", { textContent: e.totalText }), " a month"),
      el("p", { className: "or-pay", textContent: `${e.runningText} running cost + ${view.feeText} Colophon` }),
      el("a", { className: typical ? "button primary" : "button", href: signupUrl, textContent: "Start free trial" }));
  }));
  // What every shop gets: one product, nothing to choose.
  doc.getElementById("pricing-plans-title").textContent = "Everything included";
  doc.getElementById("pricing-plans").replaceChildren(...INCLUDED.map(([name, line]) => el("li", {},
    el("b", { textContent: name }), el("span", { textContent: line }))));
  doc.getElementById("pricing-note").textContent = view.note;
  doc.getElementById("start-trial").href = signupUrl;
  doc.getElementById("pricing").hidden = false;
  return true;
}
