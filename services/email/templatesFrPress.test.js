// The French twins of the press-facing emails (templatesFrPress.js): every email a press or its people receive has a
// French twin (the closing ones live in templatesFr.js), every twin is an English kind, keeps the English one's links,
// leaves no English or empty values behind (apart from words the data brings in English), and refuses the same bad
// data the English one refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES } from "./templates.js";
import { PRESS_TEMPLATES_FR, frenchMoment, frenchMoney, planNameFr } from "./templatesFrPress.js";
import { PLAN_NAMES } from "../settings.js";
import { platformSettings } from "../settings.js";
import { TIPS } from "../trial-tips/index.js";
import { START_NUDGE_WORDS } from "../trial-tips/startNudges.js";
import { ROLE_WORDS } from "../../accounts/roles.js";
import { browserWords } from "../../accounts/devices.js";
import { requirementWords } from "../payments/requirements.js";

const settings = platformSettings({});
const words = { settings, pressName: "Moth Press" };

// Emails that go to the platform's own people, never to a press (plain-words/plainWords.test.js PLATFORM_ONLY).
const PLATFORM_ONLY = ["health-alert", "backup-access-used", "recovery-new", "support-new", "job-late", "apps-deleting-soon", "chitchats-late", "switch-stuck"];
// The closing emails, whose French twins are in templatesFr.js.
const CLOSING = ["shop-closed", "shop-deletion-warning", "shop-deleted", "app-closing-soon", "app-closed", "app-download-ending", "app-records-deleted"];

// The samples of plain-words/plainWords.test.js PRESS_EMAILS, for the kinds translated here.
const LINK = "https://platform.example/account/billing?shop=moth-press";
const SHOP_LINKS = { shopAdmin: "https://moth-press.web.app/admin", stockroom: "https://moth-press-stockroom.web.app" };
const BILLING = { planName: "Shop and stockroom", price: "$39.00", date: "14 November 2026", nextTry: "17 November 2026", link: LINK };
const SAMPLES = {
  "owner-welcome": [{ links: SHOP_LINKS }, { links: { shopAdmin: SHOP_LINKS.shopAdmin } }],
  "app-added": [{ links: { stockroom: SHOP_LINKS.stockroom } }, { links: { shopAdmin: SHOP_LINKS.shopAdmin } }, { links: SHOP_LINKS }],
  "sign-in-link": [{ link: LINK }],
  "sign-in-code": [{ code: "042917" }],
  "shop-starting": [{ pressName: "Moth Press", link: LINK }],
  "waitlist-invite": [{ link: LINK }],
  "setup-ending": [{ pressName: "Moth Press", daysLeft: 30, date: "December 3, 2026", link: LINK }, { pressName: "", daysLeft: 7, date: "December 3, 2026", link: LINK }],
  "platform-fee-changing": [{ fromPercent: 0, toPercent: 2, startsOn: "1 January 2027", refunded: true, link: LINK }, { fromPercent: 2, toPercent: 0, startsOn: "1 January 2027", refunded: false, link: LINK }],
  invite: [{ pressName: "Moth Press", invitedBy: "owner@example.com", roleWords: "a manager", link: LINK, days: 7 }, ...Object.values(ROLE_WORDS).map((roleWords) => ({ pressName: "Moth Press", invitedBy: "owner@example.com", roleWords, link: LINK, days: 7 }))],
  "support-received": [{ ticketId: "T-1", subject: "A question", body: "How do I add a book?" }],
  "support-reply": [{ ticketId: "T-1", subject: "A question", body: "Open Books and press Add book." }],
  "trial-ending": [{ ...BILLING, hasCard: false }, { ...BILLING, hasCard: true }],
  "card-needed": [{ link: LINK }],
  "newsletter-paused": [{ problems: ["3 people marked it as spam (1.5%)", "12 addresses bounced (6%)"], days: 7 }],
  "own-email-paused": [{ domain: "yourpress.example" }],
  "domain-live": [{ domain: "yourpress.example", link: SHOP_LINKS.shopAdmin }],
  "free-address-live": [{ domain: "moth-press.shops.example", link: SHOP_LINKS.shopAdmin }],
  "payments-switched": [{ pressName: "Moth Press", from: "stripe", to: "square", link: "https://moth-press.web.app/admin#settings/payments" }, { pressName: "Moth Press", from: "square", to: "stripe", link: null }],
  "chitchats-waiting": [{ pressName: "Moth Press", late: ["1041", "1042"], lateCount: 2, problems: [], problemCount: 0, days: 3, link: "https://moth-press.web.app/admin#orders" }, { pressName: "Moth Press", late: ["1041"], lateCount: 1, problems: [{ order: "77", words: "The order has no full shipping address." }, { order: "78", words: null }], problemCount: 3, days: 3, link: null }, { pressName: "Moth Press", late: [], lateCount: 0, problems: [], problemCount: 0, refused: "The access token was refused.", days: 3, link: "https://moth-press.web.app/admin#settings/apps" }],
  "quiet-shop": [{ pressName: "Moth Press", link: SHOP_LINKS.shopAdmin, helpLink: "https://platform.example/help/" }],
  "domain-expiring": [{ domain: "yourpress.example", daysLeft: 30, date: "December 3, 2026", seller: "Example Names", own: "lmb-test-shop.web.app" }, { domain: "yourpress.example", daysLeft: 1, date: "December 3, 2026", seller: null, own: "lmb-test-shop.web.app" }],
  "domain-not-pointing": [{ domain: "yourpress.example", own: "lmb-test-shop.web.app", link: SHOP_LINKS.shopAdmin }],
  "payment-failed": [{ ...BILLING }, { ...BILLING, nextTry: null }],
  "subscription-cancelled": [{ ...BILLING }],
  "subscription-ended": [{ ...BILLING }],
  "payments-past-due": [{ provider: "Stripe", needs: ["your bank details"], link: SHOP_LINKS.shopAdmin }, { provider: "Stripe", needs: ["your bank details", "your date of birth"], link: SHOP_LINKS.shopAdmin }],
  "plan-changed": [{ ...BILLING, prorated: true }, { ...BILLING, prorated: false, closing: "the stockroom", date: "1 December 2026", now: false }, { ...BILLING, closing: "the stockroom", now: true }, { ...BILLING, closing: "the shop and the stockroom", date: "1 December 2026", now: false }],
  "card-expiring": [{ card: "Visa ending 4242", month: "November", link: LINK }, { card: "", date: "30 November 2026", link: LINK }],
  "new-device": [{ browser: "Chrome on Mac", at: "2026-11-01 12:00" }],
  "account-deleted": [{ shops: ["Moth Press"] }, {}],
  "payments-moved": [{ to: "own", ready: true }, { to: "own", ready: false }, { to: "square", ready: true }, { to: "square", ready: false }, { to: "platform" }],
  "recovery-asked": [{ newEmail: "new@example.com" }],
  "recovery-received": [{ oldEmail: "old@example.com" }],
  "recovery-stopped": [{ requestId: "R-1", by: "the old owner" }, { requestId: "R-1", by: "the account's owner" }, { requestId: "R-1", by: "the person who asked" }],
  "recovery-approved": [{ oldEmail: "old@example.com", newEmail: "new@example.com", holdUntil: "4 November 2026" }],
  "recovery-denied": [{ oldEmail: "old@example.com", reason: "We couldn't check who you are." }],
  "recovery-applied": [{ oldEmail: "old@example.com", newEmail: "new@example.com" }],
  "trial-tip": [...Object.values(TIPS), ...Object.values(START_NUDGE_WORDS)].map((tip) => ({ subject: tip.subject, paragraphs: tip.paragraphs, action: tip.action, link: LINK, offLink: LINK })),
  "shop-checkup": [
    { lines: [{ state: "ok", words: "Every link we tried on your shop works." }], offLink: LINK },
    { lines: [{ state: "fix", words: "3 items have no description. A few lines about each helps people choose, and helps your shop show up in searches.", fix: { label: "Write the descriptions", link: LINK } }, { state: "ok", words: "Your shop opens quickly on a phone." }], offLink: LINK },
  ],
  "payment-needs-confirming": [{ price: "$29.25", link: LINK }],
  "payment-received": [{ price: "$29.25", link: LINK }, { price: "$29.25", link: LINK, bill: LINK }],
  "bill-paid": [{ ...BILLING, price: "$39.00", number: "CL-0042", paidOn: "4 November 2026", from: "4 November 2026", to: "3 December 2026", tax: "$4.49", bill: LINK }, { ...BILLING, price: "$29.25", number: "", paidOn: "", from: "", to: "", tax: "", bill: null }],
  "card-changed": [{ card: "Visa ending 4242", link: LINK }, { card: "", link: LINK }],
  "shop-reopened": [{ ...BILLING, card: "Visa ending 4242" }, { ...BILLING, card: "" }],
  "cancel-undone": [{ ...BILLING }],
  "support-access-request": [{ by: "admin@example.com", reason: "You asked us to fix the price of a book.", until: "4 November 2026", link: LINK }],
  "press-message": [{ words: "New: shipping labels from your admin.", endsOn: "9 November 2026", link: SHOP_LINKS.shopAdmin }, { words: "Card payments pause tonight.\n\nNothing to do.", endsOn: "9 November 2026", link: null }],
  "data-export-ready": [{ link: LINK, until: "9 November 2026", asked: "owner" }, { link: LINK, until: "9 November 2026", asked: "platform", reason: "your privacy request" }],
};

const PRESS_KINDS = Object.keys(TEMPLATES).filter((kind) => !PLATFORM_ONLY.includes(kind) && !CLOSING.includes(kind)).sort();

/** Every string the data carries, longest first: words that come through from the data as they were written. */
function dataStrings(value, out = []) {
  if (typeof value === "string") out.push(value, ...value.split(/\n{2,}/));
  else if (Array.isArray(value)) value.forEach((v) => dataStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => dataStrings(v, out));
  return out.filter((s) => s.trim().length > 2).sort((a, b) => b.length - a.length);
}

// English the platform itself writes; the admin's own button labels are allowed in brackets, after the French.
const ENGLISH = /\b(Hello|Thanks|your|Your|Sign in|Sign up|Open your|the shop|the stockroom|Download|Keep my|Add a card|Update your|is ready|ending|people marked|addresses bounced|owner|the person)\b/;
const ADMIN_LABELS = ["(Settings)", "(Payments)", "(Continue with Stripe)", "(Connect Square)", "(Stop this request)"];

test("every email a press receives has a French twin here or in templatesFr.js, and every twin is an English kind", () => {
  for (const kind of Object.keys(PRESS_TEMPLATES_FR)) assert.ok(TEMPLATES[kind], `${kind} has no English email`);
  for (const kind of PRESS_KINDS) assert.ok(PRESS_TEMPLATES_FR[kind], `${kind} has no French twin`);
  for (const kind of [...PLATFORM_ONLY, ...CLOSING]) assert.equal(PRESS_TEMPLATES_FR[kind], undefined, `${kind} is not a press email for this file`);
  assert.deepEqual(Object.keys(SAMPLES).sort(), PRESS_KINDS, "every twin needs a sample here");
});

test("a French email keeps the English one's links and press name, starts with Bonjour, and has no English or empty values", () => {
  let rendered = 0;
  for (const [kind, samples] of Object.entries(SAMPLES)) {
    for (const data of samples) {
      const fr = PRESS_TEMPLATES_FR[kind](data, words);
      const en = TEMPLATES[kind](data, words);
      rendered += 1;
      const passed = dataStrings(data);
      for (const part of ["subject", "text", "html"]) {
        assert.doesNotMatch(fr[part], /undefined|null|NaN|\[object/, `${kind} ${part}`);
        let rest = fr[part].replace(/<[^>]+>/g, " ").replaceAll("&#39;", "'");
        for (const s of [...passed, ...ADMIN_LABELS]) rest = rest.replaceAll(s, " ");
        assert.doesNotMatch(rest, ENGLISH, `${kind} ${part} has English words: ${rest}`);
      }
      if (/Moth Press/.test(en.subject + en.text)) assert.match(fr.subject + fr.text, /Moth Press/, kind);
      if (en.text.startsWith("Hello,")) assert.match(fr.text, /^Bonjour,/, kind);
      for (const link of en.text.match(/https:\/\/[^\s<>"')]+/g) ?? []) {
        const clean = link.replace(/[.,]$/, "");
        assert.ok(fr.text.includes(clean), `${kind} lost the link ${clean}`);
      }
      assert.equal((fr.html.match(/<a /g) ?? []).length, (en.html.match(/<a /g) ?? []).length, `${kind} has the same buttons`);
    }
  }
  assert.ok(rendered > 50);
});

test("days, months, cards, roles and newsletter problems are written the French way", () => {
  const text = (kind, data) => PRESS_TEMPLATES_FR[kind](data, words).text;
  assert.match(text("platform-fee-changing", SAMPLES["platform-fee-changing"][0]), /À partir du 1er janvier 2027, .* 2 % \(ils sont de 0 %/);
  assert.match(text("trial-ending", SAMPLES["trial-ending"][0]), /le 14 novembre 2026/);
  assert.match(text("card-expiring", SAMPLES["card-expiring"][0]), /\(Visa se terminant par 4242\) expire à la fin de novembre/);
  assert.match(text("card-expiring", SAMPLES["card-expiring"][1]), /expire le 30 novembre 2026/);
  assert.match(text("newsletter-paused", SAMPLES["newsletter-paused"][0]), /3 personnes l'ont signalée comme indésirable \(1,5 %\) et 12 adresses ont été refusées \(6 %\)/);
  assert.match(text("invite", { ...SAMPLES.invite[0], roleWords: ROLE_WORDS.bookkeeper }), /à titre de responsable de la comptabilité/);
  assert.match(text("recovery-stopped", SAMPLES["recovery-stopped"][1]), /par la personne propriétaire du compte/);
  assert.match(text("plan-changed", SAMPLES["plan-changed"][1]), /ne comprend plus la réserve\. Elle reste ouverte jusqu'au 1er décembre 2026/);
  assert.match(text("plan-changed", SAMPLES["plan-changed"][3]), /ne comprend plus la boutique et la réserve\. Elles restent ouvertes/);
  assert.match(text("waitlist-invite", SAMPLES["waitlist-invite"][0]), /Répondez STOP/);
  assert.match(text("new-device", SAMPLES["new-device"][0]), /Chrome sur Mac/);
});

test("a twin refuses the same bad data the English email refuses", () => {
  const BAD = {
    "owner-welcome": [{ links: {} }, {}],
    "app-added": [{ links: {} }],
    "sign-in-code": [{ code: "12345" }, { code: "abcdef" }, {}],
    "payments-past-due": [{ needs: [], link: LINK }, { needs: "your bank details", link: LINK }],
    "payments-moved": [{ to: "elsewhere" }, {}],
    "trial-tip": [{ subject: "", paragraphs: ["x"], action: "Go", link: LINK, offLink: LINK }, { subject: "Hi", paragraphs: [], action: "Go", link: LINK, offLink: LINK }, { subject: "Hi", paragraphs: ["x"], action: "Go", link: LINK, offLink: "http://x.example" }],
    "shop-checkup": [{ lines: [], offLink: LINK }, { lines: [{ state: "fix", words: "x", fix: { label: "Fix", link: "javascript:alert(1)" } }], offLink: LINK }],
    "press-message": [{ words: "  ", link: null }, { words: "Hi", link: "http://x.example" }],
  };
  // Every kind with a link refuses one that isn't https.
  for (const [kind, samples] of Object.entries(SAMPLES)) {
    const data = samples[0];
    for (const field of ["link", "offLink"]) if (typeof data[field] === "string") (BAD[kind] ??= []).push({ ...data, [field]: "javascript:alert(1)" });
  }
  let checked = 0;
  for (const [kind, cases] of Object.entries(BAD)) {
    for (const data of cases) {
      assert.throws(() => TEMPLATES[kind](data, words), `the English ${kind} should refuse ${JSON.stringify(data)}`);
      assert.throws(() => PRESS_TEMPLATES_FR[kind](data, words), `the French ${kind} should refuse ${JSON.stringify(data)}`);
      let en; let fr;
      try { TEMPLATES[kind](data, words); } catch (error) { en = error.message; }
      try { PRESS_TEMPLATES_FR[kind](data, words); } catch (error) { fr = error.message; }
      assert.equal(fr, en, `${kind} refuses with the same reason`);
      checked += 1;
    }
  }
  assert.ok(checked > 30, `only ${checked} bad cases`);
});

test("what the platform itself fills in reads French: Stripe's needs, a browser, and the times it passes as ISO", () => {
  // Every need requirements.js can name (and its catch-all) has French words.
  const fields = ["external_account", "tos_acceptance.date", "company.verification.document", "individual.verification.document", "individual.dob.day", "individual.id_number", "company.tax_id", "company.address.city", "business_profile.url", "business_profile.mcc", "business_profile.support_phone", "business_type", "settings.payments.statement_descriptor", "owners", "individual.address.city", "individual.first_name", "individual.email", "individual.phone", "individual.relationship.title", "something.new"];
  const needs = [...new Set(fields.map(requirementWords))];
  assert.equal(needs.length, 20);
  const pastDue = PRESS_TEMPLATES_FR["payments-past-due"]({ provider: "Stripe", needs, link: "https://moth-press.web.app/admin" }, words);
  for (const need of needs) assert.ok(!pastDue.text.includes(need), `"${need}" is still English`);
  assert.match(pastDue.text, /vos coordonnées bancaires, .* et quelques renseignements de plus\./);

  const at = "2026-11-01T09:05:00.000Z";
  for (const agent of ["", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1"]) {
    const device = PRESS_TEMPLATES_FR["new-device"]({ browser: browserWords(agent), at }, words);
    assert.match(device.text, /le 1er novembre 2026 à 9 h 05 \(UTC\)/);
    assert.doesNotMatch(device.text, /A browser|iPhone or iPad|2026-11-01T/);
  }
  const moved = PRESS_TEMPLATES_FR["recovery-approved"]({ oldEmail: "old@example.com", newEmail: "new@example.com", holdUntil: "2026-11-06T17:30:00.000Z" }, words);
  assert.match(moved.text, /après le 6 novembre 2026 à 17 h 30 \(UTC\)/);
});

test("prices and plan names read the French way", () => {
  assert.equal(frenchMoney("$29.00"), "29,00 $");
  assert.equal(frenchMoney("US$1,234.50"), "1 234,50 US$");
  assert.equal(frenchMoney("-$5.00"), "-5,00 $");
  assert.equal(frenchMoney("$29"), "29 $");
  assert.equal(frenchMoney("free"), "free", "anything else comes through");
  assert.equal(frenchMoney(undefined), undefined);
  for (const name of Object.values(PLAN_NAMES)) assert.notEqual(planNameFr(name), name, `${name} has a French name`);
  assert.equal(planNameFr("Shop and stockroom"), "Boutique et réserve");
  assert.equal(planNameFr("Custom"), "Custom");
  assert.equal(frenchMoment("2026-11-01T09:05:00.000Z"), "1er novembre 2026 à 9 h 05");
  assert.equal(frenchMoment("March 1, 2027"), "1er mars 2027");
  const settings = platformSettings({});
  const fr = PRESS_TEMPLATES_FR["trial-ending"]({ planName: "Shop", price: "$29.00", date: "November 17, 2026", link: "https://platform.example/a", hasCard: true }, { settings, pressName: "Moth Press" });
  assert.match(fr.text, /29,00 \$ par mois pour le forfait Boutique/);
  assert.doesNotMatch(fr.text, /\$29/);
});
