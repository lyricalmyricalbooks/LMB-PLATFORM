// The waitlist page's pricing (code plan 6.1): the three plans from the platform's `/api/plans` (signup/api.js), "free
// for 14 days, no card needed" and **Start setting up**. The 14 days start when the shop opens. It shows only when the platform says sign-up is open
// (`signupOpen`, the control room's live setting, off by default); closed, unreachable or empty, the page stays today's
// waitlist. Plain ES module with no imports, so the page loads it as is. Words here are customer-facing: never a rival.

/** One line about each plan, in the order the page shows them. */
export const PLAN_LINES = Object.freeze({
  shop: "Your website, to sell online",
  stockroom: "Track stock, sales and payouts from fairs and stores",
  both: "Your website and your stock, kept in step",
});
/** Three short points per plan, as in the pricing mockup. */
export const PLAN_FEATURES = Object.freeze({
  shop: ["Online checkout, taxes and labels", "Themes you can make your own", "Your own web address"],
  stockroom: ["Every size and colour counted", "Market and pop-up till", "Sales by week and channel"],
  both: ["Everything in Shop", "In-person sales, even offline", "One count of stock everywhere"],
});
/** Cards read Shop, Shop and stockroom (the pick, in the middle), Stockroom. */
const SHOWN = Object.freeze(["shop", "both", "stockroom"]);
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
    ? `Founding shops: ${answer.foundingOffer.percentOff}% off for as long as you stay${Number.isInteger(answer.foundingOffer.presses) && answer.foundingOffer.presses > 0 ? `, for the first ${answer.foundingOffer.presses} shops` : ""}.`
    : null;
  return {
    trialDays,
    trial: trialDays ? `Free for ${trialDays} days from the day you sign up, with your shop and stockroom both included. No card needed.` : "Free to try. No card needed.",
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
  const cards = SHOWN.map((id) => view.plans.find((p) => p.plan === id)).filter(Boolean);
  doc.getElementById("plan-cards").replaceChildren(...cards.map((p) => {
    const price = view.founding && p.foundingPriceText
      ? el("p", { className: "price" }, el("s", { textContent: p.priceText }), " ", el("strong", { textContent: p.foundingPriceText }), " a month")
      : el("p", { className: "price" }, el("strong", { textContent: p.priceText }), " a month");
    const pick = p.plan === "both";
    // "Shop and stockroom" is drawn as the one most shops pick (platform-pages.css).
    const card = el("div", { className: pick ? "card plan cp-pick" : "card plan" },
      el("h3", { textContent: p.name }), el("p", { className: "hint", textContent: p.line }), price,
      el("ul", { className: "cp-ticks" }, ...(PLAN_FEATURES[p.plan] || []).map((f) => el("li", { textContent: f }))));
    if (p.payAsYouSell) card.append(el("p", { className: "or-pay", textContent: p.payAsYouSell }));
    card.append(el("a", { className: pick ? "button primary" : "button", href: signupUrl, textContent: "Start free trial" }));
    return card;
  }));
  doc.getElementById("start-trial").href = signupUrl;
  doc.getElementById("pricing").hidden = false;
  return true;
}
