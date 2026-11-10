// The pricing page (code plan 6.1, pay what you use since 10 November 2026): the fee and three example shops come from
// the platform through `/api/plans`, no rival is named, the founding fee shows only when set, and with sign-up switched
// off (or unreachable) the page is today's waitlist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApi } from "../signup/api.js";
import { platformSettings } from "../services/settings.js";
import { liveSettings } from "../signup/live.js";
import { loadPricing, pricingView, renderPricing, INCLUDED } from "./pricing.js";

const page = readFileSync(new URL("./pricing.html", import.meta.url), "utf8");
const frontPage = readFileSync(new URL("./index.html", import.meta.url), "utf8");

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
  const ids = new Map(["pricing", "pricing-lede", "pricing-founding", "plan-cards", "pricing-plans-title", "pricing-plans", "pricing-note", "start-trial"].map((id) => [id, node("div")]));
  return { ids, getElementById: (id) => ids.get(id), createElement: node };
}

test("switched off (the default), the page asks nothing of the plans and stays today's waitlist", async () => {
  const answer = await plansAnswer();
  assert.equal(answer.signupOpen, false);
  assert.equal(pricingView(answer), null);
  assert.match(page, /<section id="pricing" hidden/);
  assert.match(page, /if \(PLANS_URL && SIGNUP_URL\)/);
  const config = readFileSync(new URL("./config.js", import.meta.url), "utf8");
  assert.match(config, /export const PLANS_URL = "";/);
  assert.match(config, /export const SIGNUP_URL = "";/);
  assert.match(frontPage, />Join the waitlist</);
  assert.doesNotMatch(frontPage, /id="pricing"/, "the plans have their own page");
  // Unreachable, refused or odd answers also leave the waitlist alone.
  assert.equal(await loadPricing({ fetch: async () => { throw new Error("offline"); }, url: "/api/plans" }), null);
  assert.equal(await loadPricing({ fetch: async () => ({ ok: false }), url: "/api/plans" }), null);
  assert.equal(await loadPricing({ fetch: async () => ({ ok: true, json: async () => ({ signupOpen: true, plans: [] }) }), url: "/api/plans" }), null);
  assert.equal(await loadPricing({ fetch: async () => assert.fail("no address, no ask"), url: "" }), null);
  assert.equal(renderPricing(fakeDocument(), null, { signupUrl: "/signup/" }), false);
});

test("switched on: what you pay is the running cost plus the fee, three example shops, everything included, free for 14 days", async () => {
  const answer = await plansAnswer({ SIGNUP_OPEN: "true", TRIAL_DAYS: "14", FOUNDING_PERCENT_OFF: "0" });
  const view = pricingView(answer);
  assert.equal(view.feeText, "$5.00");
  assert.equal(view.lede, "Each month you pay what your shop cost to run, at cost, plus $5.00 for Colophon. Free for 14 days, no card needed.");
  assert.deepEqual(view.examples.map((e) => [e.id, e.runningText, e.totalText]), [["quiet", "$0.51", "$5.51"], ["typical", "$2.53", "$7.53"], ["busy", "$14.95", "$19.95"]]);
  assert.equal(view.founding, null, "no founding price unless the offer is set");
  assert.match(view.note, /^Prices in CAD\. Running cost covers storage, web traffic, background jobs and emails\. .*\(\$25\.00 unless you change it\)\.$/);

  const doc = fakeDocument();
  assert.equal(renderPricing(doc, view, { signupUrl: "https://platform.example/signup/" }), true);
  assert.equal(doc.ids.get("pricing").hidden, false);
  assert.equal(doc.ids.get("start-trial").href, "https://platform.example/signup/");
  assert.equal(doc.ids.get("pricing-founding").hidden, true);
  assert.match(doc.ids.get("plan-cards").text, /^A quiet shopAbout 500 visits a month\$5\.51 a month\$0\.51 running cost \+ \$5\.00 ColophonStart free trialA typical shop/);
  assert.equal(doc.ids.get("plan-cards").children[1].className, "card plan cp-pick cp-typical", "the typical shop is the one drawn as most shops");
  // One product (10 November 2026): no plan to choose, every shop gets the website and the stockroom.
  assert.equal(doc.ids.get("pricing-plans-title").textContent, "Everything included");
  assert.match(doc.ids.get("pricing-plans").text, /^Your websiteSell online.*Your stockroomTrack stock/);
  assert.match(page, /id="start-trial"[^>]*>Start free trial</);
  assert.match(page, /Pay for what your shop uses\./);
});

test("the founding fee shows only when the offer is set, and the fee follows the settings", async () => {
  const view = pricingView(await plansAnswer({ SIGNUP_OPEN: "true", FOUNDING_PERCENT_OFF: "25", FOUNDING_PRESSES: "25" }));
  assert.equal(view.founding, "Founding shops pay $3.75 instead of $5.00, for as long as they stay (first 25 shops).");
  const doc = fakeDocument();
  renderPricing(doc, view, { signupUrl: "/signup/" });
  assert.equal(doc.ids.get("pricing-founding").hidden, false);

  const tiered = pricingView(await plansAnswer({ SIGNUP_OPEN: "true", PLAN_PRICE_BOTH: "700", FOUNDING_PERCENT_OFF: "0" }));
  assert.equal(tiered.feeText, "$7.00");
  assert.match(tiered.lede, /plus \$7\.00 for Colophon/);
});

test("an answer without the pay-what-you-use words reads as closed", () => {
  assert.equal(pricingView({ signupOpen: true, plans: [{ plan: "shop", name: "Shop", priceText: "$5.00" }] }), null);
});

test("a live-settings failure reads as closed, never as an error", async () => {
  const api = createApi({ signup: {}, verifyIdToken: async () => ({}), settings: platformSettings({}), live: async () => { throw new Error("offline"); } });
  const answer = await api({ method: "GET", path: "/api/plans" });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.signupOpen, false);
});

test("no rival is named on the page or in the pricing words", () => {
  const words = (page + readFileSync(new URL("./pricing.js", import.meta.url), "utf8") + INCLUDED.flat().join(" ")).toLowerCase();
  for (const rival of ["big cartel", "bigcartel", "shopify", "squarespace", "etsy", "wix", "woocommerce"]) assert.ok(!words.includes(rival), rival);
});
