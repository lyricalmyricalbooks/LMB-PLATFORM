// The closing emails in French for presses in Quebec (templatesFr.js): every French twin matches an English kind, uses
// every link and date the English one does, leaves no English words or empty values behind, and sendPlatform picks
// French, French then English, or English by the press's language.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmailService } from "./index.js";
import { TEMPLATES } from "./templates.js";
import { APP_NAMES_FR, TEMPLATES_FR, bilingual, dateFr, downloadHoldsFr, mailLanguage } from "./templatesFr.js";
import { fakeResendFetch, fakeSentLog } from "./fakes.js";
import { fakeRegistry } from "../../setup/fakes.js";
import { CLOSING_EMAILS, DOWNLOAD_HOLDS, downloadHolds } from "../billing/closedApps.js";
import { platformSettings } from "../settings.js";

const settings = platformSettings({});
const LINK = "https://platform.example/accounts/";
const ON = "2027-03-01T17:00:00.000Z";
const SAMPLES = {
  "shop-closed": [{ date: "March 1, 2027", on: ON, link: LINK }],
  "shop-deletion-warning": [{ date: "March 1, 2027", on: ON, days: 30, link: LINK }, { date: "March 1, 2027", on: ON, days: 7, link: LINK }],
  "shop-deleted": [{}],
  "app-closing-soon": [{ apps: ["stockroom"], closing: "the stockroom", date: "March 1, 2027", on: ON, link: LINK }, { apps: ["shop", "stockroom"], closing: "the shop and the stockroom", date: "March 1, 2027", on: ON, link: LINK, signIn: true }],
  "app-closed": [{ apps: ["stockroom"], closing: "the stockroom", holds: downloadHolds(["stockroom"]), date: "March 1, 2027", on: ON, link: LINK }, { apps: ["shop", "stockroom"], closing: "the shop and the stockroom", date: "March 1, 2027", on: ON, link: LINK }],
  "app-download-ending": [{ apps: ["shop"], closing: "the shop", holds: downloadHolds(["shop"]), date: "March 1, 2027", on: ON, link: LINK }],
  "app-records-deleted": [{ apps: ["stockroom"], closing: "the stockroom", link: LINK }],
};
const words = { settings, pressName: "Moth Press" };

test("every closing email has a French twin, and every twin is an English kind", () => {
  for (const kind of Object.keys(TEMPLATES_FR)) assert.ok(TEMPLATES[kind], `${kind} has no English email`);
  for (const kind of [...CLOSING_EMAILS, "shop-closed", "shop-deletion-warning", "shop-deleted"]) assert.ok(TEMPLATES_FR[kind], `${kind} has no French twin`);
  assert.deepEqual(Object.keys(SAMPLES).sort(), Object.keys(TEMPLATES_FR).sort());
});

test("a French email carries the same link, press name and day as the English one, with no English or empty values", () => {
  for (const [kind, samples] of Object.entries(SAMPLES)) {
    for (const data of samples) {
      const fr = TEMPLATES_FR[kind](data, words);
      const en = TEMPLATES[kind](data, words);
      for (const part of ["subject", "text", "html"]) {
        assert.doesNotMatch(fr[part], /undefined|null|NaN|\[object/, `${kind} ${part}`);
        // The one English left on purpose: the button's own label on the account page, quoted, with the French after it.
        assert.doesNotMatch(fr[part].replaceAll("« Download all your data »", ""), /\b(the stockroom|the shop|your|Download|Hello)\b/, `${kind} ${part} has English words`);
      }
      assert.match(fr.subject + fr.text, /Moth Press/, kind);
      assert.match(fr.text, /^Bonjour,/, kind);
      if (en.text.includes(LINK)) assert.ok(fr.text.includes(LINK), `${kind} lost its link`);
      if (data.on) assert.match(fr.text, /1er mars 2027/, `${kind} has the day in French`);
      if (data.days) assert.match(fr.text, new RegExp(`Dans ${data.days} jours`));
    }
  }
});

test("the French download list names the same things, in the same order, as the English one", () => {
  assert.equal(downloadHoldsFr(["stockroom"]).split(", ").length, DOWNLOAD_HOLDS.stockroom.length - 1);
  assert.match(downloadHoldsFr(["shop"]), /ainsi que les réglages de votre boutique$/);
  assert.doesNotMatch(downloadHoldsFr(["stockroom"]), /réglages/);
  assert.equal(downloadHoldsFr([]), "");
  assert.equal(downloadHoldsFr(undefined), "");
  assert.deepEqual(Object.keys(APP_NAMES_FR).sort(), Object.keys(DOWNLOAD_HOLDS).sort());
});

test("without the French data, a twin falls back to the English values rather than failing", () => {
  const fr = TEMPLATES_FR["app-closed"]({ closing: "the stockroom", date: "March 1, 2027", link: LINK }, words);
  assert.match(fr.text, /March 1, 2027/);
  assert.equal(dateFr("not a day", "fallback"), "fallback");
  assert.equal(dateFr("2027-03-02T17:00:00.000Z"), "2 mars 2027");
});

test("the language: French when chosen, French then English for a Quebec address, otherwise English", () => {
  assert.equal(mailLanguage({ language: "fr" }), "fr");
  assert.equal(mailLanguage({ language: "fr", province: "ON" }), "fr");
  assert.equal(mailLanguage({ language: "en", province: "QC" }), "en");
  assert.equal(mailLanguage({ province: "QC" }), "fr+en");
  assert.equal(mailLanguage({ province: " qc " }), "fr+en");
  assert.equal(mailLanguage({ province: "Québec" }), "fr+en");
  assert.equal(mailLanguage({ province: "ON" }), "en");
  assert.equal(mailLanguage({}), "en");
  assert.equal(mailLanguage(), "en");
});

test("the two-language email puts French first and keeps both whole", () => {
  const data = SAMPLES["app-closed"][0];
  const both = bilingual(TEMPLATES_FR["app-closed"](data, words), TEMPLATES["app-closed"](data, words));
  assert.ok(both.subject.indexOf("La réserve") < both.subject.indexOf("The stockroom"));
  assert.ok(both.text.indexOf("Bonjour") < both.text.indexOf("Hello"));
  assert.match(both.html, /^<div lang="fr">.*<div lang="en">/s);
});

async function service() {
  const resend = fakeResendFetch();
  const email = createEmailService({ env: { RESEND_API_KEY: "re_test_not_a_real_key" }, fetch: resend.fetch, registry: fakeRegistry(), sentLog: fakeSentLog(), sleep: async () => {} });
  return { resend, email };
}

test("sendPlatform sends the French twin, both languages, or English by `language`", async () => {
  const { resend, email } = await service();
  const data = { pressName: "Moth Press", ...SAMPLES["app-records-deleted"][0] };
  await email.sendPlatform({ kind: "app-records-deleted", to: "owner@example.com", data, language: "fr", idempotencyKey: "fr" });
  await email.sendPlatform({ kind: "app-records-deleted", to: "owner@example.com", data, language: "fr+en", idempotencyKey: "both" });
  await email.sendPlatform({ kind: "app-records-deleted", to: "owner@example.com", data, language: "en", idempotencyKey: "en" });
  await email.sendPlatform({ kind: "app-records-deleted", to: "owner@example.com", data, idempotencyKey: "none" });
  const [fr, both, en, none] = resend.requests.map((r) => r.body);
  assert.match(fr.subject, /^Tout le contenu de la réserve/);
  assert.doesNotMatch(fr.text, /Hello/);
  assert.match(fr.text, /Colophon.*Contact: support@/s, "the identity line still ends it");
  assert.match(both.subject, /^Tout le contenu .* \/ Everything that was in the stockroom/);
  assert.match(en.subject, /^Everything/);
  assert.equal(none.subject, en.subject);
});

test("a kind with no French twin goes in English even for a French press", async () => {
  const { resend, email } = await service();
  await email.sendPlatform({ kind: "card-expiring", to: "owner@example.com", data: { pressName: "Moth Press", card: "Visa ending 4242", month: "November", link: LINK }, language: "fr", idempotencyKey: "card" });
  assert.match(resend.requests[0].body.subject, /^Your card for Moth Press/);
});
