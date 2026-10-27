import { test } from "node:test";
import assert from "node:assert/strict";
import { handleSignup, signupId } from "./signup.js";

function fakeStore() {
  const rows = new Map();
  return { rows, get: async (id) => rows.get(id) ?? null, put: async (id, row) => void rows.set(id, row) };
}
const at = (iso) => () => new Date(iso);

test("a good sign-up is stored", async () => {
  const store = fakeStore();
  const result = await handleSignup(
    { name: " Ada  Lane ", email: "Ada@Moth.example", press: "Moth Press", plan: "both", today: "fairs", source: "ref=zine" },
    { store, now: at("2026-11-01T10:00:00Z") },
  );
  assert.equal(result.status, 200);
  const row = store.rows.get(await signupId("ada@moth.example"));
  assert.equal(row.name, "Ada Lane");
  assert.equal(row.email, "ada@moth.example");
  assert.equal(row.plan, "both");
  assert.equal(row.source, "ref=zine");
  assert.equal(row.signups, 1);
});

test("the same email twice keeps one record and the first date", async () => {
  const store = fakeStore();
  await handleSignup({ name: "Ada", email: "ada@moth.example" }, { store, now: at("2026-11-01T10:00:00Z") });
  await handleSignup({ name: "Ada", email: "ADA@moth.example " }, { store, now: at("2026-11-02T10:00:00Z") });
  assert.equal(store.rows.size, 1);
  const [row] = store.rows.values();
  assert.equal(row.firstSignedUpAt, "2026-11-01T10:00:00.000Z");
  assert.equal(row.lastSignedUpAt, "2026-11-02T10:00:00.000Z");
  assert.equal(row.signups, 2);
});

test("missing name or a bad email is refused, nothing stored", async () => {
  const store = fakeStore();
  for (const input of [{ email: "a@b.co" }, { name: "Ada", email: "not-an-email" }, null, "text"]) {
    const result = await handleSignup(input, { store });
    assert.equal(result.status, 400);
  }
  assert.equal(store.rows.size, 0);
});

test("a bot filling the hidden field gets ok but nothing is stored", async () => {
  const store = fakeStore();
  const result = await handleSignup({ name: "Bot", email: "bot@spam.example", website: "http://spam" }, { store });
  assert.equal(result.status, 200);
  assert.equal(store.rows.size, 0);
});

test("unknown plans and long text are trimmed", async () => {
  const store = fakeStore();
  await handleSignup({ name: "Ada", email: "ada@moth.example", plan: "admin", today: "x".repeat(2000) }, { store });
  const [row] = store.rows.values();
  assert.equal(row.plan, "unsure");
  assert.equal(row.today.length, 500);
});

test("the record id does not contain the email", async () => {
  const id = await signupId("ada@moth.example");
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.equal(id, await signupId(" ADA@moth.example"));
});
