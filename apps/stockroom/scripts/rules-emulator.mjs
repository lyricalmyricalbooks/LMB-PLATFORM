// Behavioural check of the stockroom's three rule files against the real rules engines (Firestore, Realtime
// Database and Storage emulators): who counts as the publisher (the owner address or the owner role, always
// with a verified email; staff do not), that authors still reach only their own book, and that the author role from the
// shop's Team list opens only the settings an author needs (never a book on its own, never publisher access).
// CI runs it on every pull request (job stockroom-rules in .github/workflows/ci.yml). It is not part of
// `npm test` (it needs Java and the emulators). Locally, from an empty folder outside the repo:
//   npm i @firebase/rules-unit-testing@6.0.0 firebase@13.1.0 firebase-tools@15.32.1 && cp <repo>/apps/stockroom/scripts/rules-emulator.mjs .
//   RULES_DIR=<repo>/apps/stockroom npx firebase emulators:exec --only firestore,database,storage --project demo-stockroom "node rules-emulator.mjs"
// (emulators:exec needs a firebase.json naming the rules; CI writes one, see the job.)
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, get, set } from "firebase/database";
import { ref as fileRef, uploadString, getBytes } from "firebase/storage";

const dir = process.env.RULES_DIR || new URL("..", import.meta.url).pathname;
const hostPort = (v, fallback) => { const [h, p] = (v || fallback).split(":"); return { host: h, port: Number(p) }; };
const OWNER = "owner@example.com";
// The rules hold a slot for the owner's address, filled per shop at deploy (scripts/deployConfig.mjs); filled the same
// way here. A rules file without the slot would mean the deploy step can't name the owner, so that fails at once.
const rules = (file) => {
  const text = readFileSync(join(dir, file), "utf8");
  if (!text.includes("__SHOP_OWNER_EMAIL__")) throw new Error(`${file} has no owner slot`);
  return text.replaceAll("__SHOP_OWNER_EMAIL__", OWNER);
};
const env = await initializeTestEnvironment({
  projectId: "demo-stockroom",
  firestore: { rules: rules("firestore.rules"), ...hostPort(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080") },
  database: { rules: rules("database.rules.json"), ...hostPort(process.env.FIREBASE_DATABASE_EMULATOR_HOST, "127.0.0.1:9000") },
  storage: { rules: rules("storage.rules"), ...hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199") },
});
let failures = 0;
async function check(name, p) { try { await p; console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, e.message); } }

const AUTHOR = "author@example.com";
await env.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), "settings/bookOwners"), { b1: AUTHOR, authorEmails: { "author@example,com": true } });
  await setDoc(doc(ctx.firestore(), "settings/taxCenter"), { geminiKey: "secret" });
  await setDoc(doc(ctx.firestore(), "books/b1/data/ledger"), { rows: [] });
  await setDoc(doc(ctx.firestore(), "books/b2/data/ledger"), { rows: [] });
  await set(ref(ctx.database(), "lyrical/settings/bookOwners"), { b1: AUTHOR, authorEmails: { "author@example,com": true } });
  await set(ref(ctx.database(), "lyrical/settings/taxCenter"), { geminiKey: "secret" });
  await set(ref(ctx.database(), "lyrical/books/b1"), { data: "{}", ts: 1 });
  await set(ref(ctx.database(), "lyrical/books/b2"), { data: "{}", ts: 1 });
  await uploadString(fileRef(ctx.storage(), "receipts/b2/r.pdf"), "x", "raw", { contentType: "application/pdf" });
});

const people = {
  "owner address": env.authenticatedContext("u-owner", { email: OWNER, email_verified: true }),
  "owner role": env.authenticatedContext("u-second", { email: "second@example.com", email_verified: true, role: "owner" }),
};
const shutOut = {
  "owner address, unverified": env.authenticatedContext("u-owner-unv", { email: OWNER, email_verified: false }),
  "owner role, unverified": env.authenticatedContext("u-second-unv", { email: "second@example.com", email_verified: false, role: "owner" }),
  "staff role": env.authenticatedContext("u-staff", { email: "staff@example.com", email_verified: true, role: "staff" }),
  "made-up role": env.authenticatedContext("u-odd", { email: "odd@example.com", email_verified: true, role: "publisher" }),
  "author of b1": env.authenticatedContext("u-author", { email: AUTHOR, email_verified: true }),
  "author of b1 with the author role": env.authenticatedContext("u-author-role", { email: AUTHOR, email_verified: true, role: "author" }),
  "author role, no book": env.authenticatedContext("u-role-only", { email: "newauthor@example.com", email_verified: true, role: "author" }),
  "author role, unverified": env.authenticatedContext("u-role-unv", { email: "newauthor@example.com", email_verified: false, role: "author" }),
  "signed out": env.unauthenticatedContext(),
};

for (const [who, ctx] of Object.entries(people)) {
  await check(`${who}: reads a secret setting (Firestore)`, assertSucceeds(getDoc(doc(ctx.firestore(), "settings/taxCenter"))));
  await check(`${who}: writes settings (Firestore)`, assertSucceeds(setDoc(doc(ctx.firestore(), "settings/modeFlags"), { x: 1 })));
  await check(`${who}: reads another author's book (Firestore)`, assertSucceeds(getDoc(doc(ctx.firestore(), "books/b2/data/ledger"))));
  await check(`${who}: reads a secret setting (Database)`, assertSucceeds(get(ref(ctx.database(), "lyrical/settings/taxCenter"))));
  await check(`${who}: writes a book (Database)`, assertSucceeds(set(ref(ctx.database(), "lyrical/books/b2"), { data: "{}", ts: 2 })));
  await check(`${who}: reads a receipt (Storage)`, assertSucceeds(getBytes(fileRef(ctx.storage(), "receipts/b2/r.pdf"))));
}
for (const [who, ctx] of Object.entries(shutOut)) {
  await check(`${who}: no secret setting (Firestore)`, assertFails(getDoc(doc(ctx.firestore(), "settings/taxCenter"))));
  await check(`${who}: no settings write (Firestore)`, assertFails(setDoc(doc(ctx.firestore(), "settings/modeFlags"), { x: 1 })));
  await check(`${who}: no other author's book (Firestore)`, assertFails(getDoc(doc(ctx.firestore(), "books/b2/data/ledger"))));
  await check(`${who}: no secret setting (Database)`, assertFails(get(ref(ctx.database(), "lyrical/settings/taxCenter"))));
  await check(`${who}: no write to another book (Database)`, assertFails(set(ref(ctx.database(), "lyrical/books/b2"), { data: "{}", ts: 3 })));
  await check(`${who}: no other author's receipt (Storage)`, assertFails(getBytes(fileRef(ctx.storage(), "receipts/b2/r.pdf"))));
}

// Authors keep reaching their own book, exactly as before.
const author = shutOut["author of b1"];
await check("author reads own book (Firestore)", assertSucceeds(getDoc(doc(author.firestore(), "books/b1/data/ledger"))));
await check("author writes own ledger (Firestore)", assertSucceeds(setDoc(doc(author.firestore(), "books/b1/data/ledger"), { rows: [1] })));
await check("author reads catalog setting (Firestore)", assertSucceeds(getDoc(doc(author.firestore(), "settings/catalog"))));
await check("author writes own book (Database)", assertSucceeds(set(ref(author.database(), "lyrical/books/b1"), { data: "{}", ts: 4 })));

// The author role from the shop's Team list (plan 1.9b): it opens the settings an author session needs, but a role
// can't say which book, so books stay with the bookOwners map. Never another author's book, never publisher access.
const roleAuthor = shutOut["author of b1 with the author role"];
await check("author with role reads own book (Firestore)", assertSucceeds(getDoc(doc(roleAuthor.firestore(), "books/b1/data/ledger"))));
await check("author with role writes own book (Database)", assertSucceeds(set(ref(roleAuthor.database(), "lyrical/books/b1"), { data: "{}", ts: 5 })));
const roleOnly = shutOut["author role, no book"];
await check("author role reads catalog setting (Firestore)", assertSucceeds(getDoc(doc(roleOnly.firestore(), "settings/catalog"))));
await check("author role reads catalog setting (Database)", assertSucceeds(get(ref(roleOnly.database(), "lyrical/settings/catalog"))));
await check("author role alone opens no book (Firestore)", assertFails(getDoc(doc(roleOnly.firestore(), "books/b1/data/ledger"))));
await check("author role alone writes no book (Firestore)", assertFails(setDoc(doc(roleOnly.firestore(), "books/b1/data/ledger"), { rows: [2] })));
await check("author role alone opens no book (Database)", assertFails(get(ref(roleOnly.database(), "lyrical/books/b1"))));
await check("author role alone reads no submissions (Firestore)", assertFails(getDoc(doc(roleOnly.firestore(), "submissions/b1/expense/s1"))));
await check("author role can't read the book owners list (Firestore)", assertFails(getDoc(doc(roleOnly.firestore(), "settings/bookOwners"))));
await check("author role can't make itself a book's author (Firestore)", assertFails(setDoc(doc(roleOnly.firestore(), "settings/bookOwners"), { b2: "newauthor@example.com" })));
await check("author role can't make itself a book's author (Database)", assertFails(set(ref(roleOnly.database(), "lyrical/settings/bookOwners/b2"), "newauthor@example.com")));
await check("author role reads no backups (Firestore)", assertFails(getDoc(doc(roleOnly.firestore(), "backups/x"))));
const roleUnverified = shutOut["author role, unverified"];
await check("unverified author role reads no catalog setting (Firestore)", assertFails(getDoc(doc(roleUnverified.firestore(), "settings/catalog"))));
await check("unverified author role reads no catalog setting (Database)", assertFails(get(ref(roleUnverified.database(), "lyrical/settings/catalog"))));
// Not checked: an author's own receipts. storage.rules finds the author through Firestore (firestore.get), and the
// Storage emulator refused that lookup in testing with the old rules as well as the new ones.

await env.cleanup();
console.log(failures ? `${failures} check(s) failed` : "all checks passed");
process.exit(failures ? 1 : 0);
