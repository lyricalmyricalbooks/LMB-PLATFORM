import { test } from "node:test";
import assert from "node:assert/strict";
import { firestoreStore } from "./firestoreStore.js";

function fakeFetch(status) {
  const calls = [];
  const fetch = async (url, init) => (calls.push({ url, init }), { ok: status < 300, status });
  return { calls, fetch };
}

test("a sign-up is added to the waitlist collection as typed fields", async () => {
  const { calls, fetch } = fakeFetch(200);
  const store = firestoreStore({ projectId: "lmb-platform-prod", apiKey: "web-key", fetch });
  await store.put("abc123", { email: "ada@moth.example", signups: 1 });
  assert.equal(
    calls[0].url,
    "https://firestore.googleapis.com/v1/projects/lmb-platform-prod/databases/(default)/documents/waitlist?documentId=abc123&key=web-key",
  );
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    fields: { email: { stringValue: "ada@moth.example" }, signups: { integerValue: "1" } },
  });
});

test("an email already on the list counts as done", async () => {
  const { fetch } = fakeFetch(409);
  await firestoreStore({ projectId: "p", fetch }).put("abc", { email: "a@b.co" });
});

test("any other refusal is an error the page shows", async () => {
  const { fetch } = fakeFetch(403);
  await assert.rejects(firestoreStore({ projectId: "p", fetch }).put("abc", {}), /403/);
});

test("the page never reads sign-ups back", async () => {
  const { calls, fetch } = fakeFetch(200);
  assert.equal(await firestoreStore({ projectId: "p", fetch }).get("abc"), null);
  assert.equal(calls.length, 0);
});
