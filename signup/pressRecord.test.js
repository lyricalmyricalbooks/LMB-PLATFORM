// The setup record (code plan 18.2): the press may change only its setup answers, never its status or owner, and a record
// not seen for 60 days is marked for removal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceStatus, newPressRecord, setupChange, setupExpired } from "./pressRecord.js";

const NOW = new Date("2026-11-02T12:00:00Z");
const record = () => newPressRecord({ pressId: "moth-press", ownerUid: "uid-ada", email: "Owner@Example.com", now: NOW });

test("sign-up makes one record in setup, owned by the verified email", () => {
  const r = record();
  assert.equal(r.status, "setup");
  assert.equal(r.ownerUid, "uid-ada");
  assert.equal(r.ownerEmail, "owner@example.com");
  assert.equal(r.createdAt, NOW.toISOString());
});

test("a press id must be short and plain", () => {
  assert.throws(() => newPressRecord({ pressId: "Bad Id!", ownerUid: "u", email: "a@b.co", now: NOW }));
});

test("setup answers change while in setup", () => {
  const result = setupChange(record(), { pressName: "  Moth Press ", sells: "Zines", country: "CA" });
  assert.deepEqual(result, { ok: true, fields: { pressName: "Moth Press", sells: "Zines", country: "CA" } });
});

test("a press cannot set its status, owner, import file or timestamps", () => {
  for (const key of ["status", "ownerUid", "ownerEmail", "lastSeenAt", "createdAt", "stagedImportPath", "pressId"]) {
    assert.equal(setupChange(record(), { [key]: "x" }).ok, false, key);
  }
});

test("over-long answers are refused in plain words", () => {
  const result = setupChange(record(), { pressName: "x".repeat(121) });
  assert.equal(result.ok, false);
  assert.match(result.message, /too long/);
});

test("nothing changes once the press is opening", () => {
  const opening = { ...record(), status: "opening" };
  assert.equal(setupChange(opening, { pressName: "New" }).ok, false);
});

test("status moves only one step at a time, by the platform", () => {
  assert.deepEqual(advanceStatus(record(), "opening"), { ok: true, status: "opening" });
  assert.equal(advanceStatus(record(), "open").ok, false);
  assert.equal(advanceStatus({ ...record(), status: "open" }, "setup").ok, false);
});

test("a setup record unseen for 60 days is due for removal, a recent one is not", () => {
  const r = record();
  assert.equal(setupExpired(r, new Date("2026-12-30T12:00:00Z")), false);
  assert.equal(setupExpired(r, new Date("2027-01-02T12:00:00Z")), true);
  assert.equal(setupExpired({ ...r, status: "opening" }, new Date("2027-06-01T00:00:00Z")), false);
});

// The rules file is checked by its text here; the Firestore emulator run (waitlist/firestore-emulator.mjs) is the full test.
test("the setup record rules let only its verified owner read it, and no one write it from a page", async () => {
  const { readFile } = await import("node:fs/promises");
  const rules = await readFile(new URL("../waitlist/firestore.rules", import.meta.url), "utf8");
  const block = rules.slice(rules.indexOf("match /presses/{pressId}"), rules.indexOf("// status/publish.js"));
  assert.match(block, /email_verified == true/);
  assert.match(block, /resource\.data\.ownerUid == request\.auth\.uid/);
  assert.match(block, /allow create, update, delete: if false;/);
  assert.equal((block.match(/allow /g) ?? []).length, 2, "a read rule and a no-writes rule, nothing else");
});
