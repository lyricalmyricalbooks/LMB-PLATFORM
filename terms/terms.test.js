// The terms page (code plan 8.1): one page, one version id, the shutdown promise kept, and sign-up's record checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { BACKUP_KEEP_DAYS, CHANGE_NOTICE_DAYS, DOWNLOAD_DAYS, DRAFT, HELPERS, OPERATOR_ADDRESS, OPERATOR_NAME, PAUSED_DAYS, PRIVACY_CONTACT, REPORT_CONTACT, SECTIONS, TRIAL_DAYS, SHUTDOWN_NOTICE_DAYS, TERMS_VERSION, acceptanceRecord, acceptedCurrent, currentTermsVersion } from "./terms.js";
import { renderTerms } from "./page.js";
import { controlRoomPeople } from "../control-room/people.js";
import { DOWNLOAD_DAYS as CLOSING_DOWNLOAD_DAYS, PAUSED_DAYS as CLOSING_PAUSED_DAYS, WARNING_DAYS } from "../services/billing/closing.js";
import { DEFAULT_SETTINGS } from "../services/settings.js";

// Each version's words, fingerprinted. Changing the words without a new TERMS_VERSION fails here: add the new
// version's line (never change an old one) so a stored acceptance always names the words the press saw.
const FINGERPRINTS = { "2026-10-28-draft": "646ebc6599507d9f", "2026-10-28-draft.2": "55b1600cfb4bed2d", "2026-11-03-draft": "d24470c450ff75b7" };

const text = SECTIONS.flatMap((s) => [s.title, ...s.paragraphs]).join(" ");

test("one version id, and the words can't change without a new one", () => {
  assert.match(TERMS_VERSION, /^\d{4}-\d{2}-\d{2}(-draft(\.\d+)?)?$/);
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
  assert.match(shutdown, /download all of your books, orders and customers/);
  assert.match(shutdown, /hand that copy over to your press/);
});

test("marked DRAFT for the lawyer while it is one", () => {
  assert.equal(DRAFT, true);
  assert.match(renderTerms(), /<b>DRAFT\.<\/b> A lawyer hasn't read these words yet/);
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
  assert.equal(PRIVACY_CONTACT, controlRoomPeople({}).privacyContact, "the same placeholder as the control room's setting");
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
  assert.equal(TRIAL_DAYS, DEFAULT_SETTINGS.trialDays);
  const paying = part("paying");
  assert.match(paying, /kept for 60 days/);
  assert.match(paying, /90 days to download everything/);
  assert.match(paying, /30 days and 7 days before a closed shop is deleted/);
  assert.doesNotMatch(text, /nothing is deleted/i);
});

test("renewal, cancelling online and price notice are spelled out before anyone pays", () => {
  const paying = part("paying");
  assert.match(paying, /never ask for a card to start it/);
  assert.match(paying, /renews every month .* until you cancel/);
  assert.match(paying, /cancel at any time from Plan & billing .* no call or email needed/);
  assert.match(paying, new RegExp(`at least ${CHANGE_NOTICE_DAYS} days before your first payment at the new price`));
  assert.match(paying, /Prices are shown before tax/);
});

test("the data agreement names every helper company, where it works, and the notice before a new one", () => {
  assert.ok(HELPERS.length >= 3);
  const helpers = part("helpers");
  for (const h of HELPERS) assert.ok(helpers.includes(h) && /^[A-Z][^:]+: .+ Works from .+\.$/.test(h), h);
  for (const name of ["Google Cloud", "Stripe", "Resend"]) assert.ok(helpers.includes(`${name}:`), name);
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
