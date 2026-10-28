// Runs the waitlist page's real storage against the Firestore emulator with waitlist/firestore.rules loaded:
// a sign-up lands, a repeat is fine, and nothing else gets through. CI job `waitlist-rules`; locally:
//   cd waitlist && npx firebase-tools@15.32.1 emulators:exec --only firestore --project demo-waitlist "node firestore-emulator.mjs"
import assert from "node:assert/strict";
import { handleSignup, signupId } from "./signup.js";
import { firestoreStore } from "./firestoreStore.js";

const host = `http://${process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080"}`;
const projectId = process.env.GCLOUD_PROJECT || "demo-waitlist";
const docs = `${host}/v1/projects/${projectId}/databases/(default)/documents`;
// The emulator lets "Bearer owner" past the rules, standing in for the owner reading in the Firebase console.
const asOwner = { Authorization: "Bearer owner" };
const store = firestoreStore({ projectId, host });

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
}

const post = (id, fields) =>
  fetch(`${docs}/waitlist?documentId=${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
const str = (value) => ({ stringValue: value });
async function goodFields(email) {
  return {
    email: str(email), name: str("Ada"), plan: str("both"), source: str("direct"),
    firstSignedUpAt: str("2026-11-01T10:00:00.000Z"), lastSignedUpAt: str("2026-11-01T10:00:00.000Z"),
    signups: { integerValue: "1" },
  };
}

await check("a sign-up from the page lands in the store", async () => {
  const result = await handleSignup(
    { name: "Ada Lane", email: "Ada@Moth.example", press: "Moth Press", plan: "both", today: "fairs", source: "ref=zine" },
    { store },
  );
  assert.equal(result.status, 200);
  const saved = await fetch(`${docs}/waitlist/${await signupId("ada@moth.example")}`, { headers: asOwner });
  assert.equal(saved.status, 200);
  const { fields } = await saved.json();
  assert.equal(fields.email.stringValue, "ada@moth.example");
  assert.equal(fields.press.stringValue, "Moth Press");
  assert.equal(fields.signups.integerValue, "1");
});

await check("the same email again is fine and keeps the first record", async () => {
  const result = await handleSignup({ name: "Someone Else", email: "ada@moth.example" }, { store });
  assert.equal(result.status, 200);
  const saved = await fetch(`${docs}/waitlist/${await signupId("ada@moth.example")}`, { headers: asOwner });
  assert.equal((await saved.json()).fields.name.stringValue, "Ada Lane");
});

await check("nobody can read sign-ups from the web", async () => {
  const one = await fetch(`${docs}/waitlist/${await signupId("ada@moth.example")}`);
  assert.equal(one.status, 403);
  const list = await fetch(`${docs}/waitlist`);
  assert.equal(list.status, 403);
});

await check("nobody can change or delete a sign-up", async () => {
  const id = await signupId("ada@moth.example");
  const patch = await fetch(`${docs}/waitlist/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: await goodFields("ada@moth.example") }),
  });
  assert.equal(patch.status, 403);
  const del = await fetch(`${docs}/waitlist/${id}`, { method: "DELETE" });
  assert.equal(del.status, 403);
});

await check("a record filed under someone else's id is refused", async () => {
  const response = await post(await signupId("other@moth.example"), await goodFields("mallory@moth.example"));
  assert.equal(response.status, 403);
});

await check("extra fields, bad plans, long text and a doctored count are refused", async () => {
  const email = "bea@moth.example";
  const id = await signupId(email);
  const base = await goodFields(email);
  for (const fields of [
    { ...base, admin: str("yes") },
    { ...base, plan: str("free-forever") },
    { ...base, today: str("x".repeat(501)) },
    { ...base, signups: { integerValue: "500" } },
    { ...base, email: str("Bea@Moth.example") },
    { ...base, name: str("") },
  ]) {
    assert.equal((await post(id, fields)).status, 403, JSON.stringify(Object.keys(fields)));
  }
  assert.equal((await post(id, base)).status, 200);
});

await check("anyone can read the public status, nobody can write it from the web", async () => {
  const seeded = await fetch(`${docs}/publicStatus?documentId=current`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...asOwner },
    body: JSON.stringify({ fields: { overall: str("working") } }),
  });
  assert.equal(seeded.status, 200);
  const read = await fetch(`${docs}/publicStatus/current`);
  assert.equal(read.status, 200);
  assert.equal((await read.json()).fields.overall.stringValue, "working");
  const write = await fetch(`${docs}/publicStatus/current`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { overall: str("most") } }),
  });
  assert.equal(write.status, 403);
  assert.equal((await fetch(`${docs}/publicStatus`)).status, 403, "the collection can't be listed");
  assert.equal((await fetch(`${docs}/publicStatus/other`)).status, 403);
});

await check("everything outside the waitlist is closed", async () => {
  const write = await fetch(`${docs}/settings?documentId=site`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { a: str("b") } }),
  });
  assert.equal(write.status, 403);
});

console.log(failures ? `\n${failures} check(s) failed` : "\nall waitlist checks passed");
process.exit(failures ? 1 : 0);
