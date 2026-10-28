// The terms page (code plan 8.1): one page, one version id, the shutdown promise kept, and sign-up's record checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { BACKUP_KEEP_DAYS, DRAFT, PRIVACY_CONTACT, SECTIONS, SHUTDOWN_NOTICE_DAYS, TERMS_VERSION, acceptanceRecord, acceptedCurrent, currentTermsVersion } from "./terms.js";
import { renderTerms } from "./page.js";
import { controlRoomPeople } from "../control-room/people.js";

// Each version's words, fingerprinted. Changing the words without a new TERMS_VERSION fails here: add the new
// version's line (never change an old one) so a stored acceptance always names the words the press saw.
const FINGERPRINTS = { "2026-10-28-draft": "646ebc6599507d9f", "2026-10-28-draft.2": "55b1600cfb4bed2d" };

const text = SECTIONS.flatMap((s) => [s.title, ...s.paragraphs]).join(" ");

test("one version id, and the words can't change without a new one", () => {
  assert.match(TERMS_VERSION, /^\d{4}-\d{2}-\d{2}(-draft(\.\d+)?)?$/);
  assert.equal(currentTermsVersion(), TERMS_VERSION);
  assert.equal(DRAFT, /-draft(\.\d+)?$/.test(TERMS_VERSION), "a draft version ends in -draft (or -draft.2 and on), a final one doesn't");
  const print = createHash("sha256").update(JSON.stringify(SECTIONS)).digest("hex").slice(0, 16);
  assert.equal(print, FINGERPRINTS[TERMS_VERSION], "the words changed: give them a new TERMS_VERSION and add its fingerprint");
});

test("the four parts are on one page: terms, privacy, data and the shutdown promise", () => {
  assert.deepEqual(SECTIONS.map((s) => s.id), ["terms", "privacy", "data", "shutdown"]);
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
