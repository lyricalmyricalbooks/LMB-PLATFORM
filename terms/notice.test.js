import { test } from "node:test";
import assert from "node:assert/strict";
import { createTermsNotice } from "./notice.js";
import { CHANGES, TERMS_VERSION } from "./terms.js";
import { TEMPLATES } from "../services/email/templates.js";
import { PRESS_TEMPLATES_FR } from "../services/email/templatesFrPress.js";

const store = (rows) => {
  const map = new Map(rows.map((r) => [r.shopId, r]));
  return { map, list: async () => [...map.values()], set: async (id, row) => void map.set(id, row) };
};

test("presses on older words are emailed once, then move to the new words 30 days later", async () => {
  let at = new Date("2026-11-10T12:00:00Z");
  const sent = [];
  const signups = store([
    { shopId: "moth", ownerEmail: "owner@example.com", pressName: "Moth", status: "trialing", termsVersion: "2026-11-03-draft.3", termsAcceptedAt: "2026-11-04T00:00:00Z" },
    { shopId: "new", ownerEmail: "new@example.com", status: "trialing", termsVersion: TERMS_VERSION, termsAcceptedAt: "2026-11-10T00:00:00Z" },
    { shopId: "gone", ownerEmail: "gone@example.com", status: "expired", termsVersion: "old", termsAcceptedAt: "2026-10-01T00:00:00Z" },
  ]);
  const notice = createTermsNotice({ signups, email: { sendPlatform: async (m) => void sent.push(m) }, settings: async () => ({ platformUrl: "https://platform.example" }), now: () => at });

  assert.deepEqual(await notice.sweep(), { told: ["moth"], moved: [] });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, "terms-changed");
  assert.equal(sent[0].idempotencyKey, `terms/moth/${TERMS_VERSION}`);
  assert.equal(sent[0].data.appliesOn, "December 10, 2026");
  assert.deepEqual(sent[0].data.changes, CHANGES.en);

  assert.deepEqual(await notice.sweep(), { told: [], moved: [] }, "never twice");
  at = new Date("2026-12-10T12:00:00Z");
  assert.deepEqual(await notice.sweep(), { told: [], moved: ["moth"] });
  const row = signups.map.get("moth");
  assert.equal(row.termsVersion, TERMS_VERSION);
  assert.equal(row.termsAgreedBy, "notice");
  assert.equal(row.termsEarlier[0].termsVersion, "2026-11-03-draft.3");
  assert.equal(sent.length, 1);
});

test("the changes list belongs to this version, in both languages", () => {
  assert.equal(CHANGES.version, TERMS_VERSION);
  assert.equal(CHANGES.en.length, CHANGES.fr.length);
  assert.ok(CHANGES.en.length > 0);
});

test("the email says when, what changed and how to cancel, in English and French", () => {
  const data = { changes: CHANGES.en, changesFr: CHANGES.fr, appliesOn: "10 December 2026", link: "https://platform.example/terms/", billing: "https://platform.example/account/billing?shop=moth" };
  const ctx = { settings: { platformName: "Colophon" }, pressName: "Moth" };
  const en = TEMPLATES["terms-changed"](data, ctx);
  assert.match(en.subject, /10 December 2026/);
  assert.match(en.text ?? en.html, /cancel/);
  const fr = PRESS_TEMPLATES_FR["terms-changed"](data, ctx);
  assert.match(fr.text ?? fr.html, /annuler/);
});
