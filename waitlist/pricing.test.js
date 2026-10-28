// The waitlist page's pricing (code plan 6.1): the plans come from the platform's settings through `/api/plans`, no
// rival is named, the founding price and the second way to pay show only when set, and with sign-up switched off (or
// unreachable) the page is today's waitlist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApi } from "../signup/api.js";
import { platformSettings } from "../services/settings.js";
import { liveSettings } from "../signup/live.js";
import { loadPricing, pricingView, renderPricing, PLAN_LINES } from "./pricing.js";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");

async function plansAnswer(env = {}) {
  const api = createApi({ signup: {}, verifyIdToken: async () => ({}), settings: platformSettings(env), live: () => liveSettings({ env }) });
  return (await api({ method: "GET", path: "/api/plans" })).body;
}

/** A tiny pretend page: enough of the DOM for renderPricing. */
function fakeDocument() {
  const node = (tag) => ({
    tag, children: [], hidden: true, textContent: "", href: "",
    append(...kids) { this.children.push(...kids); },
    replaceChildren(...kids) { this.children = kids; },
    get text() { return [this.textContent, ...this.children.map((c) => (typeof c === "string" ? c : c.text))].join(""); },
  });
  const ids = new Map(["pricing", "pricing-trial", "pricing-founding", "plan-cards", "start-trial", "not-ready"].map((id) => [id, node("div")]));
  return { ids, getElementById: (id) => ids.get(id), createElement: node };
}

test("switched off (the default), the page asks nothing of the plans and stays today's waitlist", async () => {
  const answer = await plansAnswer();
  assert.equal(answer.signupOpen, false);
  assert.equal(pricingView(answer), null);
  assert.match(page, /<section id="pricing" hidden/);
  assert.match(page, /<h2 id="not-ready" class="section" hidden>/);
  assert.match(page, /if \(PLANS_URL && SIGNUP_URL\)/);
  const config = readFileSync(new URL("./config.js", import.meta.url), "utf8");
  assert.match(config, /export const PLANS_URL = "";/);
  assert.match(config, /export const SIGNUP_URL = "";/);
  assert.match(page, />Join the waitlist</);
  // Unreachable, refused or odd answers also leave the waitlist alone.
  assert.equal(await loadPricing({ fetch: async () => { throw new Error("offline"); }, url: "/api/plans" }), null);
  assert.equal(await loadPricing({ fetch: async () => ({ ok: false }), url: "/api/plans" }), null);
  assert.equal(await loadPricing({ fetch: async () => ({ ok: true, json: async () => ({ signupOpen: true, plans: [] }) }), url: "/api/plans" }), null);
  assert.equal(await loadPricing({ fetch: async () => assert.fail("no address, no ask"), url: "" }), null);
  assert.equal(renderPricing(fakeDocument(), null, { signupUrl: "/signup/" }), false);
});

test("switched on, the three plans and prices come from the settings, free for 14 days, with Start your free trial", async () => {
  const answer = await plansAnswer({ SIGNUP_OPEN: "on", PLAN_PRICE_SHOP: "3100", TRIAL_DAYS: "14" });
  const view = pricingView(answer);
  assert.deepEqual(view.plans.map((p) => [p.plan, p.name, p.priceText]), [["shop", "Shop", "$31.00"], ["stockroom", "Stockroom", "$19.00"], ["both", "Shop and stockroom", "$39.00"]]);
  assert.equal(view.trial, "Free for 14 days, no card needed.");
  assert.equal(view.founding, null, "no founding price unless the offer is set");
  assert.ok(view.plans.every((p) => !p.foundingPriceText && !p.payAsYouSell));

  const doc = fakeDocument();
  assert.equal(renderPricing(doc, view, { signupUrl: "https://platform.example/signup/" }), true);
  assert.equal(doc.ids.get("pricing").hidden, false);
  assert.equal(doc.ids.get("not-ready").hidden, false, "the waitlist stays, for presses not ready yet");
  assert.equal(doc.ids.get("start-trial").href, "https://platform.example/signup/");
  assert.equal(doc.ids.get("pricing-founding").hidden, true);
  assert.match(doc.ids.get("plan-cards").text, /Shop\$31\.00 a month/);
  assert.match(page, /id="start-trial"[^>]*>Start your free trial</);
  assert.match(page, /Free for 14 days, no card needed\./);
});

test("the founding price shows only when the offer is set", async () => {
  const view = pricingView(await plansAnswer({ SIGNUP_OPEN: "on", FOUNDING_PERCENT_OFF: "25", FOUNDING_PRESSES: "25" }));
  assert.equal(view.founding, "Founding presses: 25% off for as long as you stay, for the first 25 presses.");
  assert.deepEqual(view.plans.map((p) => p.foundingPriceText), ["$21.75", "$14.25", "$29.25"]);
  const doc = fakeDocument();
  renderPricing(doc, view, { signupUrl: "/signup/" });
  assert.equal(doc.ids.get("pricing-founding").hidden, false);
  assert.match(doc.ids.get("plan-cards").text, /\$29\.00 \$21\.75 a month/);
});

test("pay as you sell shows under the plans with a website, capped at the plan's price, and hides at 0", async () => {
  const view = pricingView(await plansAnswer({ SIGNUP_OPEN: "on", PAY_AS_YOU_SELL_BASIS_POINTS: "200" }));
  assert.deepEqual(view.plans.map((p) => p.payAsYouSell), [
    "or 2% of your website sales, never more than $29.00 a month",
    null,
    "or 2% of your website sales, never more than $39.00 a month",
  ]);
  assert.equal(pricingView(await plansAnswer({ SIGNUP_OPEN: "on", PAY_AS_YOU_SELL_BASIS_POINTS: "250" })).plans[0].payAsYouSell, "or 2.5% of your website sales, never more than $29.00 a month");
  assert.ok(pricingView(await plansAnswer({ SIGNUP_OPEN: "on", PAY_AS_YOU_SELL_BASIS_POINTS: "0" })).plans.every((p) => p.payAsYouSell === null));
});

test("a live-settings failure reads as closed, never as an error", async () => {
  const api = createApi({ signup: {}, verifyIdToken: async () => ({}), settings: platformSettings({}), live: async () => { throw new Error("offline"); } });
  const answer = await api({ method: "GET", path: "/api/plans" });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.signupOpen, false);
});

test("no rival is named on the page or in the pricing words", () => {
  const words = (page + readFileSync(new URL("./pricing.js", import.meta.url), "utf8") + Object.values(PLAN_LINES).join(" ")).toLowerCase();
  for (const rival of ["big cartel", "bigcartel", "shopify", "squarespace", "etsy", "wix", "woocommerce"]) assert.ok(!words.includes(rival), rival);
});
