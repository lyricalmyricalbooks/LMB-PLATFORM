// Code plan 6.16: nothing technical reaches a press. This reads, from the platform's side, every screen, setup step, help
// answer and email a press of a Colophon shop is shown: the sign-up page, the account and Plan & billing pages, the help
// page, the status, terms and waitlist pages, the shop maker's words, the trial tips and every email. It fails on
// Firebase, Google Cloud, API, key, webhook, secret, DNS, CNAME, TXT, Resend and deploy (`banned.json`, the one list).
// The shop's admin and the stockroom are read by their own tests, from the same list (apps/shop/src/app/admin/
// platformPlainWords.test.ts, apps/stockroom/tests/platformPlainWords.test.js); the last tests here make sure those
// two exist and read the same list. The domain card and `services/domains` are row 6.15's and are not read here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BANNED, findBanned, sentencesIn, visibleText } from "./words.js";
import { TEMPLATES } from "../services/email/templates.js";
import { platformSettings } from "../services/settings.js";
import { ARTICLES, CHECKLIST_ANSWERS } from "../help/articles.js";
import { SUPPORT } from "../help/support.js";
import { renderHelp } from "../help/page.js";
import { billingWords, planChangeWords } from "../accounts/billingWords.js";
import { statusWords } from "../status/summary.js";
import { TIPS } from "../services/trial-tips/index.js";
import { createShopMaker, STEP_WORDS } from "../signup/shopMaker.js";
import { fakeSignupStores } from "../signup/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Words used in their plain, non-technical sense. Each phrase is allowed only because of the reason beside it.
const ALLOWED = [
  // Route tables name web addresses such as "POST /api/signup"; they are the platform's doors, never shown.
  // (Skipped by `isRouteLabel`, not allowed here.)
];
const isRouteLabel = (text) => /^(GET|POST|PUT|PATCH|DELETE) \//.test(text);

function problemsIn(label, text, allowed = ALLOWED) {
  return findBanned(text, allowed).map((found) => `${label} → ${found}`);
}

// ── The pages, as a press reads them ───────────────────────────────────────────────────────────────────────────────

const PAGES = ["signup/index.html", "accounts/index.html", "accounts/billing.html", "help/index.html", "experts/index.html", "status/index.html", "terms/index.html", "waitlist/index.html"];

test("every page a press opens says nothing technical", () => {
  const found = PAGES.flatMap((page) => problemsIn(page, visibleText(read(page))));
  assert.deepEqual(found, []);
});

// ── The words in each page's code and each service's replies ───────────────────────────────────────────────────────

// Files whose quoted words reach a press: the page scripts, the replies the services give them, and their words.
const PRESS_FACING_CODE = [
  "signup/app.js", "signup/form.js", "signup/signup.js", "signup/shopMaker.js", "signup/api.js",
  "accounts/accounts.js", "accounts/app.js", "accounts/billing.js", "accounts/billingWords.js", "accounts/billingRoutes.js",
  "accounts/devices.js", "accounts/recovery.js", "accounts/recoveryRoutes.js", "accounts/roles.js", "accounts/routes.js", "accounts/teamSync.js",
  "help/articles.js", "help/page.js", "help/support.js", "experts/directory.js", "experts/page.js", "status/page.js", "status/summary.js", "terms/page.js", "terms/terms.js",
  "waitlist/pricing.js", "waitlist/signup.js", "waitlist/domain-check.js",
  "services/billing/billing.js", "services/billing/closing.js", "services/billing/paymentWay.js", "services/billing/plans.js",
  "services/support/inbox.js", "services/support/routes.js", "services/payments/requirements.js",
  "services/email/templates.js", "services/email/closingTemplates.js", "services/email/reputation.js", "services/email/streams.js",
  // The steps of Connect Google, shown on the shop's Overview (6.17).
  "google/status.js", "google/service.js", "google/teardown.js", "google/gmail.js",
];
// Not read, with the reason: services/domains and the domain card are row 6.15's; the control room, health alerts and
// the backup person's emails go to Julian, not to a press; setup/steps.js names the steps for the audit log (the press
// reads STEP_WORDS instead, tested below).

test("every sentence in the code a press reads is free of technical words", () => {
  const found = [];
  for (const file of PRESS_FACING_CODE) {
    const sentences = sentencesIn(read(file));
    assert.ok(sentences.length > 0, `${file}: nothing was read, so the reader is broken for this file`);
    for (const sentence of sentences) if (!isRouteLabel(sentence)) found.push(...problemsIn(file, sentence));
  }
  assert.deepEqual(found, []);
});

// ── Help, billing and status, drawn the way the pages draw them ────────────────────────────────────────────────────

test("help: every answer, what our help includes, and the page for each plan", () => {
  const found = [];
  for (const a of ARTICLES) found.push(...problemsIn(`help/${a.id}`, [a.question, ...a.answer, ...(a.steps || []), ...(a.where || [])].join(" ")));
  found.push(...problemsIn("help/support", [SUPPORT.title, ...SUPPORT.includes, ...SUPPORT.excludes].join(" ")));
  for (const plan of ["shop", "stockroom", "both"]) found.push(...problemsIn(`help page for ${plan}`, visibleText(renderHelp({ plan }))));
  found.push(...problemsIn("help page, nothing found", visibleText(renderHelp({ search: "zzzz" }))));
  assert.ok(Object.keys(CHECKLIST_ANSWERS).length > 5);
  assert.deepEqual(found, []);
});

test("Plan & billing: every state of the plan, the card and the cancel cards", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const base = { price: "$39.00", plusTax: true, hasCard: true, card: { brand: "visa", last4: "4242", expMonth: 3, expYear: 2028 }, currentPeriodEnd: "2026-12-01T00:00:00Z", nextPaymentAt: "2026-12-01T00:00:00Z", trialEnd: "2026-11-10T00:00:00Z" };
  const states = [
    { ...base, status: "active", access: "open" },
    { ...base, status: "trialing", access: "open", hasCard: false, card: null },
    { ...base, status: "trialing", access: "open" },
    { ...base, status: "past_due", access: "open" },
    { ...base, status: "active", access: "open", cancelAtPeriodEnd: true },
    { ...base, status: "paused", access: "paused", hasCard: false, card: null },
    { ...base, status: "paused", access: "paused" },
    { ...base, status: "canceled", access: "closed" },
    { ...base, status: "active", access: "open", appsClosing: { apps: ["stockroom"], at: "2026-12-01T00:00:00Z" } },
  ];
  const found = states.flatMap((billing, i) => problemsIn(`billing state ${i}`, Object.values(billingWords(billing, now)).join(" ")));
  const previews = [
    { planName: "Shop", price: "$29.00", adds: ["shop"], closes: ["stockroom"], immediate: false, closesAt: "2026-12-01T00:00:00Z", downloadUntil: "2027-03-01T00:00:00Z", prorated: { text: "$4.00" } },
    { planName: "Both", price: "$39.00", adds: ["stockroom"], closes: [], immediate: true },
    { planName: "Stockroom", price: "$19.00", adds: [], closes: ["shop"], immediate: true, downloadUntil: "2027-02-01T00:00:00Z" },
  ];
  for (const preview of previews) found.push(...problemsIn("plan change", planChangeWords(preview, { status: "trialing", plusTax: true }).join(" ")));
  assert.deepEqual(found, []);
});

test("status: every state of the public status page", () => {
  const now = () => new Date("2026-11-01T12:00:00Z");
  const parts = (state) => [{ id: "pages", name: "Shop and stockroom pages", state, affected: 1, total: 4 }, { id: "webhook", name: "Payments", state, affected: 1, total: 4 }];
  const found = [];
  for (const overall of ["working", "some", "most"]) {
    const words = statusWords({ checkedAt: "2026-11-01T11:58:00Z", overall, parts: parts(overall === "working" ? "working" : overall) }, { now });
    found.push(...problemsIn(`status ${overall}`, [words.headline, ...words.parts.flatMap((p) => [p.name, p.words])].join(" ")));
  }
  found.push(...problemsIn("status late", statusWords({ checkedAt: "2026-11-01T09:00:00Z", overall: "working", parts: parts("working") }, { now }).headline));
  found.push(...problemsIn("status not started", statusWords({}, { now }).headline));
  assert.deepEqual(found, []);
});

// ── Setup steps: what the press sees while its shop is made ────────────────────────────────────────────────────────

test("setup steps: every step has plain words, and a stuck shop says nothing technical", async () => {
  const found = [];
  const steps = Object.entries(STEP_WORDS);
  assert.equal(steps.length, 16, "a new setup step needs its plain words in signup/shopMaker.js STEP_WORDS");
  for (const [n, words] of steps) found.push(...problemsIn(`step ${n}`, words));

  const messages = [];
  for (const [failedStep] of steps) {
    for (const error of ["the project could not be created", "the project is marked for deletion; restore it in the Google Cloud console"]) {
      const stores = fakeSignupStores();
      const maker = createShopMaker({
        signups: stores.signups, registry: fakeRegistry(), run: async () => ({ ok: false, failedStep: Number(failedStep), error }),
        now: () => new Date("2026-11-01T12:00:00Z"),
      });
      await stores.signups.set("moth-press-k3f9q", { shopId: "moth-press-k3f9q", accountId: "a1", status: "queued", pressName: "Moth Press", ownerEmail: "owner@example.com", plan: "both", country: "CA", currency: "CAD" });
      const row = await maker.make("moth-press-k3f9q");
      messages.push(row.message);
    }
  }
  assert.ok(messages.every((m) => m && m.length > 20), "every stuck shop explains itself");
  found.push(...messages.flatMap((message) => problemsIn("shop maker message", message)));
  assert.deepEqual(found, []);
});

test("trial tips: every tip email, and the setup-step answers they point to", () => {
  const found = Object.entries(TIPS).flatMap(([step, tip]) => problemsIn(`tip ${step}`, [tip.subject, ...tip.paragraphs, tip.action].join(" ")));
  assert.ok(Object.keys(TIPS).length >= 9);
  assert.deepEqual(found, []);
});

// ── Emails ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const LINK = "https://platform.example/account/billing?shop=moth-press";
const SHOP_LINKS = { shopAdmin: "https://moth-press.web.app/admin", stockroom: "https://moth-press-stockroom.web.app" };
const BILLING = { planName: "Shop and stockroom", price: "$39.00", date: "14 November 2026", nextTry: "17 November 2026", link: LINK };

// One sample for each kind of platform email a press can receive; each may be rendered several ways.
const PRESS_EMAILS = {
  "owner-welcome": [{ links: SHOP_LINKS }, { links: { shopAdmin: SHOP_LINKS.shopAdmin } }],
  "sign-in-link": [{ link: LINK }],
  "shop-starting": [{ pressName: "Moth Press", link: LINK }],
  "waitlist-invite": [{ link: LINK }],
  "platform-fee-changing": [{ fromPercent: 0, toPercent: 2, startsOn: "1 January 2027", refunded: true, link: LINK }, { fromPercent: 2, toPercent: 0, startsOn: "1 January 2027", refunded: false, link: LINK }],
  invite: [{ pressName: "Moth Press", invitedBy: "owner@example.com", roleWords: "a manager", link: LINK, days: 7 }],
  "support-received": [{ ticketId: "T-1", subject: "A question", body: "How do I add a book?" }],
  "support-reply": [{ ticketId: "T-1", subject: "A question", body: "Open Books and press Add book." }],
  "trial-ending": [{ ...BILLING, hasCard: false }, { ...BILLING, hasCard: true }],
  "card-needed": [{ link: LINK }],
  "newsletter-paused": [{ problems: ["3 people marked it as spam (1.5%)", "12 addresses bounced (6%)"], days: 7 }],
  "own-email-paused": [{ domain: "yourpress.example" }],
  "domain-live": [{ domain: "yourpress.example", link: SHOP_LINKS.shopAdmin }],
  "payment-failed": [{ ...BILLING }, { ...BILLING, nextTry: null }],
  "subscription-cancelled": [{ ...BILLING }],
  "subscription-ended": [{ ...BILLING }],
  "payments-past-due": [{ provider: "Stripe", needs: ["your bank details"], link: SHOP_LINKS.shopAdmin }, { provider: "Stripe", needs: ["your bank details", "your date of birth"], link: SHOP_LINKS.shopAdmin }],
  "plan-changed": [{ ...BILLING, prorated: true }, { ...BILLING, prorated: false, closing: "the stockroom", date: "1 December 2026", now: false }, { ...BILLING, closing: "the stockroom", now: true }],
  "card-expiring": [{ card: "Visa ending 4242", month: "November", link: LINK }, { card: "", date: "30 November 2026", link: LINK }],
  "new-device": [{ browser: "Chrome on Mac", at: "2026-11-01 12:00" }],
  "payments-moved": [{ to: "own", ready: true }, { to: "own", ready: false }, { to: "square", ready: true }, { to: "square", ready: false }, { to: "platform" }],
  "recovery-asked": [{ newEmail: "new@example.com" }],
  "recovery-received": [{ oldEmail: "old@example.com" }],
  "recovery-stopped": [{ requestId: "R-1", by: "the old owner" }],
  "recovery-approved": [{ oldEmail: "old@example.com", newEmail: "new@example.com", holdUntil: "4 November 2026" }],
  "recovery-denied": [{ oldEmail: "old@example.com", reason: "We couldn't check who you are." }],
  "recovery-applied": [{ oldEmail: "old@example.com", newEmail: "new@example.com" }],
  "trial-tip": Object.values(TIPS).map((tip) => ({ subject: tip.subject, paragraphs: tip.paragraphs, action: tip.action, link: LINK, offLink: LINK })),
  "shop-closed": [{ date: "30 January 2027", link: LINK }],
  "shop-deletion-warning": [{ date: "30 January 2027", days: 30, link: LINK }, { date: "30 January 2027", days: 7, link: LINK }],
  "shop-deleted": [{}],
};
// Emails that go to Julian or to the support address, never to a press.
const PLATFORM_ONLY = ["health-alert", "backup-access-used", "recovery-new", "support-new"];

test("every kind of email is either read here or goes only to the platform's own people", () => {
  const kinds = Object.keys(TEMPLATES).sort();
  assert.deepEqual(kinds, [...Object.keys(PRESS_EMAILS), ...PLATFORM_ONLY].sort(), "a new email kind must be added to PRESS_EMAILS (read) or PLATFORM_ONLY");
});

test("every email a press receives, in every version, says nothing technical", () => {
  const settings = platformSettings({});
  const found = [];
  let rendered = 0;
  for (const [kind, samples] of Object.entries(PRESS_EMAILS)) {
    for (const data of samples) {
      const parts = TEMPLATES[kind](data, { settings, pressName: "Moth Press" });
      rendered += 1;
      found.push(...problemsIn(`email ${kind} subject`, parts.subject), ...problemsIn(`email ${kind} text`, parts.text), ...problemsIn(`email ${kind} html`, visibleText(parts.html)));
    }
  }
  assert.ok(rendered > 40);
  assert.deepEqual(found, []);
});

// ── The checker itself ─────────────────────────────────────────────────────────────────────────────────────────────

test("the checker catches every banned word, and a plain use needs an allowed phrase", () => {
  const samples = {
    Firebase: "Your Firebase project is ready.", "Google Cloud": "Open Google Cloud console.", API: "Turn on the API.", key: "Paste your key here.",
    webhook: "The webhook failed.", secret: "A signing secret.", DNS: "Change your DNS records.", CNAME: "Add a CNAME record.", TXT: "Add a TXT record.",
    Resend: "Sent through Resend.", deploy: "We will deploy it.",
  };
  assert.deepEqual(BANNED.map((b) => b.word).sort(), Object.keys(samples).sort(), "a new banned word needs a sample here");
  for (const [word, sentence] of Object.entries(samples)) {
    assert.equal(findBanned(sentence).length, 1, `${word} is not caught in "${sentence}"`);
    assert.match(findBanned(sentence)[0], new RegExp(`^${word}:`));
  }
  assert.equal(findBanned("Use the arrow keys to move.").length, 1);
  assert.equal(findBanned("Use the arrow keys to move.", ["arrow keys"]).length, 0);
  assert.equal(findBanned("Keyboard shortcuts and the keyword box.").length, 0, "whole words only");
  // The code reader keeps words, and skips comments, identifiers and web addresses.
  assert.deepEqual(sentencesIn('const a = "Paste your key here."; // not "this one"\nconst b = "x-device-id"; const c = "https://x.example/a";'), ["Paste your key here."]);
  assert.deepEqual(sentencesIn("const c = `Hello ${name}, add a TXT record`;"), ["Hello  , add a TXT record"]);
});

test("the shop's admin test and the stockroom's test exist and read this same list", () => {
  for (const file of ["apps/shop/src/app/admin/platformPlainWords.test.ts", "apps/stockroom/tests/platformPlainWords.test.js"]) {
    const source = read(file);
    assert.match(source, /plain-words\/banned\.json/, `${file} must read plain-words/banned.json`);
  }
});
