// The terms page (code plan 8.1): one page, one version id, the shutdown promise kept, and sign-up's record checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { BACKUP_KEEP_DAYS, CHANGE_NOTICE_DAYS, DOWNLOAD_DAYS, DRAFT, HELPERS, OPERATOR_ADDRESS, OPERATOR_NAME, PAUSED_DAYS, PRIVACY_CONTACT, REPORT_CONTACT, SECTIONS, SHUTDOWN_NOTICE_DAYS, TERMS_VERSION, acceptanceRecord, acceptedCurrent, currentTermsVersion } from "./terms.js";
import { pageLanguage, renderTerms } from "./page.js";
import { HELPERS_FR, SECTIONS_FR } from "./termsFr.js";
import { controlRoomPeople } from "../control-room/people.js";
import { DOWNLOAD_DAYS as CLOSING_DOWNLOAD_DAYS, PAUSED_DAYS as CLOSING_PAUSED_DAYS, WARNING_DAYS } from "../services/billing/closing.js";

// Each version's words, fingerprinted. Changing the words without a new TERMS_VERSION fails here: add the new
// version's line (never change an old one) so a stored acceptance always names the words the press saw.
const FINGERPRINTS = { "2026-10-28-draft": "646ebc6599507d9f", "2026-10-28-draft.2": "55b1600cfb4bed2d", "2026-11-03-draft": "d24470c450ff75b7", "2026-11-03-draft.2": "7bb1fcbcadafff47",
  "2026-11-03-draft.3": "04dcb865d6843efc", "2026-11-10-draft": "1ce24128fb9616a5", "2026-11-10-draft.2": "493114853d48e35a", "2026-11-10-draft.3": "cc73b9bb17e01e02",
  "2026-11-10-draft.4": "274b05d1325f8052", "2026-11-10-draft.5": "e970c3a93440e3bd", "2026-11-12": "b3fe1f3d879ce01e", "2026-11-12.2": "470137bb7048ee0c" };
// The French words (termsFr.js), from the version that first had them. Same rule: new words, new version.
const FINGERPRINTS_FR = { "2026-11-03-draft.2": "4744335b4ee3a2ca", "2026-11-03-draft.3": "574ba843f7eba85d", "2026-11-10-draft": "af16ec68088f677e", "2026-11-10-draft.2": "fa32499e0449ddc2", "2026-11-10-draft.3": "c9a414ff8210f469", "2026-11-10-draft.4": "77f60696305326f6", "2026-11-10-draft.5": "068f6bef1ff56db4", "2026-11-12": "da29380ebc636e7d", "2026-11-12.2": "10d52f119dddc31f" };

const text = SECTIONS.flatMap((s) => [s.title, ...s.paragraphs]).join(" ");

test("one version id, and the words can't change without a new one", () => {
  assert.match(TERMS_VERSION, /^\d{4}-\d{2}-\d{2}(-draft)?(\.\d+)?$/);
  assert.equal(currentTermsVersion(), TERMS_VERSION);
  assert.equal(DRAFT, /-draft(\.\d+)?$/.test(TERMS_VERSION), "a draft version ends in -draft (or -draft.2 and on), a final one doesn't");
  const print = createHash("sha256").update(JSON.stringify(SECTIONS)).digest("hex").slice(0, 16);
  assert.equal(print, FINGERPRINTS[TERMS_VERSION], "the words changed: give them a new TERMS_VERSION and add its fingerprint");
});

test("every part is on one page: terms, paying, privacy, data, helpers, reports and the shutdown promise", () => {
  assert.deepEqual(SECTIONS.map((s) => s.id), ["terms", "paying", "privacy", "data", "helpers", "reports", "shutdown"]);
  const page = renderTerms();
  for (const s of SECTIONS) assert.ok(page.includes(`id="${s.id}"`) && page.includes(`href="#${s.id}"`), s.id);
  assert.ok(page.includes(TERMS_VERSION));
});

test("the shutdown promise: 90 days' notice, a full download, and the press can take over its own copy", () => {
  assert.equal(SHUTDOWN_NOTICE_DAYS, 90);
  const shutdown = SECTIONS.find((s) => s.id === "shutdown").paragraphs.join(" ");
  assert.match(shutdown, /at least 90 days before/);
  assert.match(shutdown, /download your whole shop at any time/);
  assert.match(shutdown, /hand that copy over to your press/);
});

test("every id on the page is used once, so the contents links land on their section", () => {
  const shell = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const lang of ["en", "fr"]) {
    const ids = [...(shell + renderTerms(lang)).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], lang);
  }
});

test("final words: no draft notice on the page, in either language", () => {
  assert.equal(DRAFT, false);
  for (const lang of ["en", "fr"]) assert.doesNotMatch(renderTerms(lang), /DRAFT|BROUILLON|lawyer|avocat/i, lang);
});

test("plain words, short sentences, never a rival's name", () => {
  const rivals = /\b(big ?cartel|shopify|squarespace|etsy|wix|woocommerce|square online)\b/i;
  assert.doesNotMatch(text, rivals);
  assert.doesNotMatch(readFileSync(new URL("./index.html", import.meta.url), "utf8"), rivals);
  assert.doesNotMatch(text, /\b(firestore|firebase|api|json|webhook|database|server)\b/i);
  for (const sentence of text.split(/(?<=[.?!;])\s+/)) assert.ok(sentence.split(/\s+/).length <= 36, `"${sentence}" is too long`);
});

test("sign-up's record: the current version and when, and nothing else is accepted", () => {
  const at = new Date("2026-10-28T15:00:00Z");
  const record = acceptanceRecord(currentTermsVersion(), at);
  assert.deepEqual(record, { termsVersion: TERMS_VERSION, termsAcceptedAt: "2026-10-28T15:00:00.000Z" });
  assert.ok(acceptedCurrent(record));
  assert.throws(() => acceptanceRecord("2025-01-01"), /terms again/);
  assert.throws(() => acceptanceRecord(undefined), /terms again/);
  assert.throws(() => acceptanceRecord(TERMS_VERSION, "not a date"), /real date/);
  assert.ok(!acceptedCurrent({ termsVersion: "2025-01-01", termsAcceptedAt: "2025-01-01T00:00:00Z" }));
  assert.ok(!acceptedCurrent(null));
});

test("the privacy policy names the privacy contact and says how long backups are kept (plan 8.6)", () => {
  const privacy = SECTIONS.find((s) => s.id === "privacy").paragraphs.join(" ");
  assert.equal(PRIVACY_CONTACT, controlRoomPeople({}).privacyContact, "the control room's default privacy contact");
  assert.ok(privacy.includes(`write to our privacy contact at ${PRIVACY_CONTACT}`));
  assert.equal(BACKUP_KEEP_DAYS, 30);
  assert.match(privacy, /Each backup is kept for 30 days, then deleted\. If your shop is deleted, its backups are kept 30 days more/);
  assert.ok(renderTerms().includes(PRIVACY_CONTACT));
});

const part = (id) => SECTIONS.find((s) => s.id === id).paragraphs.join(" ");

test("the closing promises match what the closing sweep really does (no 'nothing is deleted')", () => {
  assert.equal(PAUSED_DAYS, CLOSING_PAUSED_DAYS);
  assert.equal(DOWNLOAD_DAYS, CLOSING_DOWNLOAD_DAYS);
  assert.deepEqual([...WARNING_DAYS], [30, 7]);
  const paying = part("paying");
  assert.match(paying, /kept for 60 days/);
  assert.match(paying, /90 days to download everything/);
  assert.match(paying, /30 days and 7 days before a closed shop is deleted/);
  assert.doesNotMatch(text, /nothing is deleted/i);
});

test("renewal, cancelling online and price notice are spelled out before anyone pays", () => {
  const paying = part("paying");
  assert.match(paying, /never ask for a card to start it/);
  // The trial length is set in the control room, so the terms point at the sign-up page instead of naming a number.
  assert.match(paying, /number of days shown on the sign-up page the day you sign up/);
  assert.doesNotMatch(paying, /trial of \d+ days/);
  assert.match(paying, /renews every month.* until you cancel/);
  assert.match(paying, /the plan's fee plus what your shop cost to run the month before .* at what it costs us/);
  assert.match(paying, /cancel at any time from Plan & billing .* no call or email needed/);
  assert.match(paying, new RegExp(`at least ${CHANGE_NOTICE_DAYS} days before your first payment at the new price`));
  assert.match(paying, /Prices are shown before tax/);
});

test("the data agreement names every helper company, where it works, and the notice before a new one", () => {
  assert.ok(HELPERS.length >= 3);
  const helpers = part("helpers");
  for (const h of HELPERS) assert.ok(helpers.includes(h) && /^[A-Z][^:]+: .+ Works? from .+\.$/.test(h), h);
  for (const name of ["Google Cloud and Google Workspace", "Stripe"]) assert.ok(helpers.includes(`${name}:`), name);
  assert.ok(!/Resend/.test(helpers), "email goes through Google now");
  assert.match(part("data"), new RegExp(`at least ${CHANGE_NOTICE_DAYS} days before adding one`));
  assert.match(part("data"), /within 72 hours/);
  assert.match(part("privacy"), /stored in Canada/);
  assert.match(part("privacy"), /privacy commissioner/);
});

test("anyone can report a shop, at a named address", () => {
  assert.ok(part("reports").includes(REPORT_CONTACT));
  assert.match(REPORT_CONTACT, /@/);
});

test("a final version names the real company and its address, not the placeholders", () => {
  const placeholder = /company that runs Colophon|foot of our emails/;
  if (!DRAFT) {
    assert.doesNotMatch(OPERATOR_NAME, placeholder);
    assert.doesNotMatch(OPERATOR_ADDRESS, placeholder);
    assert.doesNotMatch(PRIVACY_CONTACT + REPORT_CONTACT, /\.example$/);
  }
  assert.ok(part("terms").includes(OPERATOR_NAME));
});

test("Quebec: the French version has the same parts, the same number of paragraphs and its own fingerprint", () => {
  assert.deepEqual(SECTIONS_FR.map((s) => s.id), SECTIONS.map((s) => s.id));
  for (const [i, s] of SECTIONS_FR.entries()) assert.equal(s.paragraphs.length, SECTIONS[i].paragraphs.length, s.id);
  assert.equal(HELPERS_FR.length, HELPERS.length);
  const print = createHash("sha256").update(JSON.stringify(SECTIONS_FR)).digest("hex").slice(0, 16);
  assert.equal(print, FINGERPRINTS_FR[TERMS_VERSION], "the French words changed: give the terms a new TERMS_VERSION and add both fingerprints");
  const fr = SECTIONS_FR.flatMap((s) => s.paragraphs).join(" ");
  for (const n of ["60", "90", "30 jours et 7 jours", "72 heures", OPERATOR_NAME, PRIVACY_CONTACT, REPORT_CONTACT]) assert.ok(fr.includes(n), n);
  assert.match(fr, /Commission d'accès à l'information/);
});

test("the page opens in French with ?lang=fr and links each language to the other", () => {
  assert.equal(pageLanguage("?lang=fr"), "fr");
  assert.equal(pageLanguage("?x=1&lang=FR"), "fr");
  assert.equal(pageLanguage(""), "en");
  const fr = renderTerms("fr");
  assert.match(fr, /Conditions d'utilisation/);
  assert.match(fr, /href="\.\/" hreflang="en"/);
  assert.match(renderTerms(), /href="\.\/\?lang=fr" hreflang="fr"/);
});

test("sign-up shows the French terms first, then the English", () => {
  const page = readFileSync(new URL("../signup/index.html", import.meta.url), "utf8");
  const fr = page.indexOf('href="/terms/?lang=fr"');
  const en = page.indexOf('href="/terms/"');
  assert.ok(fr > 0 && en > fr, "the French link comes before the English one");
});

test("the company is named, with its Toronto address, under Ontario law", () => {
  assert.doesNotMatch(OPERATOR_NAME, /company that runs/);
  assert.match(OPERATOR_ADDRESS, /Toronto, Ontario M6G 3H1/);
});
