// The closing emails in French for presses in Quebec (templatesFr.js): every French twin matches an English kind, uses
// every link and date the English one does, leaves no English words or empty values behind, and sendPlatform picks
// French, French then English, or English by the press's language.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmailService } from "./index.js";
import { TEMPLATES } from "./templates.js";
import { APP_NAMES_FR, TEMPLATES_FR, bilingual, dateFr, downloadHoldsFr, mailLanguage } from "./templatesFr.js";
import { fakeGmailFetch, fakeSentLog , pretendEmailEnv } from "./fakes.js";
import { PRESS_TEMPLATES_FR } from "./templatesFrPress.js";
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
  assert.deepEqual(Object.keys(SAMPLES).sort(), Object.keys(TEMPLATES_FR).filter((kind) => !PRESS_TEMPLATES_FR[kind]).sort(), "the closing twins here; the rest are tested in templatesFrPress.test.js");
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
  assert.match(fr.text, /1er mars 2027/, "the English day turned French");
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
  const mail = fakeGmailFetch();
  const email = createEmailService({ env: pretendEmailEnv(), fetch: mail.fetch, registry: fakeRegistry(), sentLog: fakeSentLog(), sleep: async () => {} });
  return { mail, email };
}

test("sendPlatform sends the French twin, both languages, or English by `language`", async () => {
  const { mail, email } = await service();
  const data = { pressName: "Moth Press", ...SAMPLES["app-records-deleted"][0] };
  await email.sendPlatform({ kind: "app-records-deleted", to: "owner@example.com", data, language: "fr", idempotencyKey: "fr" });
  await email.sendPlatform({ kind: "app-records-deleted", to: "owner@example.com", data, language: "fr+en", idempotencyKey: "both" });
  await email.sendPlatform({ kind: "app-records-deleted", to: "owner@example.com", data, language: "en", idempotencyKey: "en" });
  await email.sendPlatform({ kind: "app-records-deleted", to: "owner@example.com", data, idempotencyKey: "none" });
  const [fr, both, en, none] = mail.requests.map((r) => r.body);
  assert.match(fr.subject, /^Tout le contenu de la réserve/);
  assert.doesNotMatch(fr.text, /Hello/);
  assert.match(fr.text, /Colophon.*Contact: support@/s, "the identity line still ends it");
  assert.match(both.subject, /^Tout le contenu .* \/ Everything that was in the stockroom/);
  assert.match(en.subject, /^Everything/);
  assert.equal(none.subject, en.subject);
});

test("a kind with no French twin (the platform's own alerts) goes in English even for a French press", async () => {
  const { mail, email } = await service();
  assert.equal(TEMPLATES_FR["health-alert"], undefined);
  await email.sendPlatform({ kind: "health-alert", to: "alerts@example.com", data: { pressName: "Moth Press", shopId: "moth-press", check: "pages", state: "failing", since: "noon" }, language: "fr", idempotencyKey: "alert" });
  assert.match(mail.requests[0].body.subject, /pages failing/);
});

test("every email to a press has a French twin; only the platform's own alerts don't", () => {
  const platformOnly = ["health-alert", "backup-access-used", "recovery-new", "support-new", "job-late", "apps-deleting-soon", "chitchats-late", "switch-stuck"];
  assert.deepEqual(Object.keys(TEMPLATES).filter((kind) => !TEMPLATES_FR[kind]).sort(), platformOnly.sort());
});

test("with no language given, a shop's email takes the shop's own from its registry row", async () => {
  const mail = fakeGmailFetch();
  const registry = fakeRegistry();
  await registry.createShop("moth-press", { shopId: "moth-press", pressName: "Moth Press", status: "live", billing: { language: null, province: "QC" } });
  await registry.createShop("owl-press", { shopId: "owl-press", pressName: "Owl Press", status: "live", billing: { language: "fr" } });
  const email = createEmailService({ env: pretendEmailEnv(), fetch: mail.fetch, registry, sentLog: fakeSentLog(), sleep: async () => {} });
  const data = { pressName: "Moth Press", ...SAMPLES["app-records-deleted"][0] };
  await email.sendPlatform({ kind: "app-records-deleted", to: "owner@example.com", shopId: "moth-press", data, idempotencyKey: "q" });
  await email.sendPlatform({ kind: "app-records-deleted", to: "owner@example.com", shopId: "owl-press", data, idempotencyKey: "f" });
  await email.sendPlatform({ kind: "app-records-deleted", to: "owner@example.com", shopId: "owl-press", data, language: "en", idempotencyKey: "e" });
  await email.sendPlatform({ kind: "app-records-deleted", to: "owner@example.com", shopId: "nobody", data, idempotencyKey: "n" });
  const [quebec, french, english, unknown] = mail.requests.map((r) => r.body.subject);
  assert.match(quebec, /^Tout le contenu .* \/ Everything/);
  assert.match(french, /^Tout le contenu/);
  assert.doesNotMatch(french, /Everything/);
  assert.match(english, /^Everything/, "a language given wins");
  assert.match(unknown, /^Everything/, "a shop the registry doesn't know: English");
});

test("the welcome email goes in the language the press signed up in, before any plan email; a failed lookup means English", async () => {
  const mail = fakeGmailFetch();
  const registry = fakeRegistry();
  await registry.createShop("moth-press", { shopId: "moth-press", pressName: "Moth Press", ownerEmail: "owner@example.com", status: "live", language: "fr" });
  const email = createEmailService({ env: pretendEmailEnv(), fetch: mail.fetch, registry, sentLog: fakeSentLog(), sleep: async () => {} });
  await email.send("moth-press", { kind: "owner-welcome", to: "owner@example.com", links: { shopAdmin: "https://moth-press.web.app/admin" }, idempotencyKey: "w" });
  assert.match(mail.requests[0].body.text, /^Bonjour,/);
  registry.getShop = async () => { throw new Error("Firestore is down"); };
  await email.sendPlatform({ kind: "app-records-deleted", to: "owner@example.com", shopId: "moth-press", data: { pressName: "Moth Press", ...SAMPLES["app-records-deleted"][0] }, idempotencyKey: "down" });
  assert.match(mail.requests[1].body.subject, /^Everything/);
});

test("card-expiring's month as billing writes it reads in French", () => {
  const fr = TEMPLATES_FR["card-expiring"]({ card: "Visa ending 4242", month: "November 2026", link: LINK }, words);
  assert.match(fr.text, /novembre 2026/);
  assert.doesNotMatch(fr.text, /November/);
});
