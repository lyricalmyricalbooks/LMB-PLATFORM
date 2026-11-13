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
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { ref, get, set } from "firebase/database";
import { ref as fileRef, uploadString, getBytes } from "firebase/storage";

const dir = process.env.RULES_DIR || new URL("..", import.meta.url).pathname;
const hostPort = (v, fallback) => { const [h, p] = (v || fallback).split(":"); return { host: h, port: Number(p) }; };
const OWNER = "owner@example.com";
// The shared system (LMB-PLATFORM docs/shared-system.md): the rules name no owner. Each shop lives in its own folder,
// shops/<id>, and its record (tenant, owner address) is written only by the platform. The checks below run in shop "s1"
// with sign-ins from its sign-in list; the last block proves nothing from shop "s2" (or with no list) gets in.
const rules = (file) => readFileSync(join(dir, file), "utf8");
const TENANT = "tenant-s1";
/** A sign-in from `tenant`'s list (shop s1's unless said otherwise). */
const signedIn = (uid, claims = {}, { tenant = TENANT } = {}) =>
  env.authenticatedContext(uid, { ...claims, firebase: { sign_in_provider: "google.com", ...(claims.firebase || {}), ...(tenant ? { tenant } : {}) } });
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
  // The shops' records: the stockroom's database copy, the Realtime Database copy (the storage rules read the default
  // database's, which is the same one in the emulator).
  await setDoc(doc(ctx.firestore(), "shops/s1"), { tenant: TENANT, ownerEmail: OWNER });
  await setDoc(doc(ctx.firestore(), "shops/s2"), { tenant: "tenant-s2", ownerEmail: "owner2@example.com" });
  await set(ref(ctx.database(), "shops/s1/record"), { tenant: TENANT, ownerEmail: OWNER });
  await set(ref(ctx.database(), "shops/s2/record"), { tenant: "tenant-s2", ownerEmail: "owner2@example.com" });
  await setDoc(doc(ctx.firestore(), "shops/s1/settings/bookOwners"), { b1: AUTHOR, authorEmails: { "author@example,com": true } });
  await setDoc(doc(ctx.firestore(), "shops/s1/settings/taxCenter"), { geminiKey: "secret" });
  await setDoc(doc(ctx.firestore(), "shops/s1/books/b1/data/ledger"), { rows: [] });
  await setDoc(doc(ctx.firestore(), "shops/s1/books/b2/data/ledger"), { rows: [] });
  await set(ref(ctx.database(), "shops/s1/lyrical/settings/bookOwners"), { b1: AUTHOR, authorEmails: { "author@example,com": true } });
  await set(ref(ctx.database(), "shops/s1/lyrical/settings/taxCenter"), { geminiKey: "secret" });
  await setDoc(doc(ctx.firestore(), "shops/s1/settings/taxCentreForBookkeeper"), { data: "{}", ts: 1 });
  await setDoc(doc(ctx.firestore(), "shops/s1/settings/modeFlags"), { data: "{}", ts: 1 });
  await set(ref(ctx.database(), "shops/s1/lyrical/settings/taxCentreForBookkeeper"), { data: "{}", ts: 1 });
  await setDoc(doc(ctx.firestore(), "shops/s1/settings/reportsForBookkeeper"), { data: "{}", ts: 1 });
  await set(ref(ctx.database(), "shops/s1/lyrical/settings/reportsForBookkeeper"), { data: "{}", ts: 1 });
  await set(ref(ctx.database(), "shops/s1/lyrical/books/b1"), { data: "{}", ts: 1 });
  await set(ref(ctx.database(), "shops/s1/lyrical/books/b2"), { data: "{}", ts: 1 });
  await uploadString(fileRef(ctx.storage(), "shops/s1/receipts/b2/r.pdf"), "x", "raw", { contentType: "application/pdf" });
  await setDoc(doc(ctx.firestore(), "shops/s1/fairTill/menu"), { books: [{ id: "b1", title: "B1", price: 24, cur: "CAD", onHand: 5 }], at: "2026-11-03T10:00:00Z" });
  await setDoc(doc(ctx.firestore(), "shops/s1/fairSales/other-helper-sale"), { by: "other@example.com", at: new Date(), day: "2026-11-03", fair: "", method: "Cash", lines: [{ bookId: "b1", qty: 1 }] });
});

const people = {
  "owner address": signedIn("u-owner", { email: OWNER, email_verified: true }),
  "owner role": signedIn("u-second", { email: "second@example.com", email_verified: true, role: "owner" }),
};
const shutOut = {
  "owner address, unverified": signedIn("u-owner-unv", { email: OWNER, email_verified: false }),
  "owner role, unverified": signedIn("u-second-unv", { email: "second@example.com", email_verified: false, role: "owner" }),
  "staff role": signedIn("u-staff", { email: "staff@example.com", email_verified: true, role: "staff" }),
  "made-up role": signedIn("u-odd", { email: "odd@example.com", email_verified: true, role: "publisher" }),
  "bookkeeper role": signedIn("u-books", { email: "books@example.com", email_verified: true, role: "bookkeeper" }),
  "author of b1": signedIn("u-author", { email: AUTHOR, email_verified: true }),
  "author of b1 with the author role": signedIn("u-author-role", { email: AUTHOR, email_verified: true, role: "author" }),
  "author role, no book": signedIn("u-role-only", { email: "newauthor@example.com", email_verified: true, role: "author" }),
  "author role, unverified": signedIn("u-role-unv", { email: "newauthor@example.com", email_verified: false, role: "author" }),
  "fair helper role": signedIn("u-helper", { email: "helper@example.com", email_verified: true, role: "fairHelper" }),
  "signed out": env.unauthenticatedContext(),
};

// The sign-in screen's question (src/lib/publisher-access.js askRules): the same answer as every rule above, and
// the only way the owner of a shop without the shop app (no owner role on the pass) is recognised.
for (const [who, ctx] of Object.entries(people)) {
  await check(`${who}: the publisher check says yes`, assertSucceeds(getDoc(doc(ctx.firestore(), "shops/s1/publisherCheck/me"))));
  await check(`${who}: the publisher check can't be written`, assertFails(setDoc(doc(ctx.firestore(), "shops/s1/publisherCheck/me"), { x: 1 })));
}
for (const [who, ctx] of Object.entries(shutOut)) {
  await check(`${who}: the publisher check says no`, assertFails(getDoc(doc(ctx.firestore(), "shops/s1/publisherCheck/me"))));
}

for (const [who, ctx] of Object.entries(people)) {
  await check(`${who}: reads a secret setting (Firestore)`, assertSucceeds(getDoc(doc(ctx.firestore(), "shops/s1/settings/taxCenter"))));
  await check(`${who}: writes settings (Firestore)`, assertSucceeds(setDoc(doc(ctx.firestore(), "shops/s1/settings/modeFlags"), { x: 1 })));
  await check(`${who}: reads another author's book (Firestore)`, assertSucceeds(getDoc(doc(ctx.firestore(), "shops/s1/books/b2/data/ledger"))));
  await check(`${who}: reads a secret setting (Database)`, assertSucceeds(get(ref(ctx.database(), "shops/s1/lyrical/settings/taxCenter"))));
  await check(`${who}: writes a book (Database)`, assertSucceeds(set(ref(ctx.database(), "shops/s1/lyrical/books/b2"), { data: "{}", ts: 2 })));
  await check(`${who}: reads a receipt (Storage)`, assertSucceeds(getBytes(fileRef(ctx.storage(), "shops/s1/receipts/b2/r.pdf"))));
}
for (const [who, ctx] of Object.entries(shutOut)) {
  await check(`${who}: no secret setting (Firestore)`, assertFails(getDoc(doc(ctx.firestore(), "shops/s1/settings/taxCenter"))));
  await check(`${who}: no settings write (Firestore)`, assertFails(setDoc(doc(ctx.firestore(), "shops/s1/settings/modeFlags"), { x: 1 })));
  await check(`${who}: no other author's book (Firestore)`, assertFails(getDoc(doc(ctx.firestore(), "shops/s1/books/b2/data/ledger"))));
  await check(`${who}: no secret setting (Database)`, assertFails(get(ref(ctx.database(), "shops/s1/lyrical/settings/taxCenter"))));
  await check(`${who}: no write to another book (Database)`, assertFails(set(ref(ctx.database(), "shops/s1/lyrical/books/b2"), { data: "{}", ts: 3 })));
  await check(`${who}: no other author's receipt (Storage)`, assertFails(getBytes(fileRef(ctx.storage(), "shops/s1/receipts/b2/r.pdf"))));
}

// Authors keep reaching their own book, exactly as before.
const author = shutOut["author of b1"];
await check("author reads own book (Firestore)", assertSucceeds(getDoc(doc(author.firestore(), "shops/s1/books/b1/data/ledger"))));
await check("author writes own ledger (Firestore)", assertSucceeds(setDoc(doc(author.firestore(), "shops/s1/books/b1/data/ledger"), { rows: [1] })));
await check("author reads catalog setting (Firestore)", assertSucceeds(getDoc(doc(author.firestore(), "shops/s1/settings/catalog"))));
await check("author writes own book (Database)", assertSucceeds(set(ref(author.database(), "shops/s1/lyrical/books/b1"), { data: "{}", ts: 4 })));

// The author role from the shop's Team list (plan 1.9b): it opens the settings an author session needs, but a role
// can't say which book, so books stay with the bookOwners map. Never another author's book, never publisher access.
const roleAuthor = shutOut["author of b1 with the author role"];
await check("author with role reads own book (Firestore)", assertSucceeds(getDoc(doc(roleAuthor.firestore(), "shops/s1/books/b1/data/ledger"))));
await check("author with role writes own book (Database)", assertSucceeds(set(ref(roleAuthor.database(), "shops/s1/lyrical/books/b1"), { data: "{}", ts: 5 })));
const roleOnly = shutOut["author role, no book"];
await check("author role reads catalog setting (Firestore)", assertSucceeds(getDoc(doc(roleOnly.firestore(), "shops/s1/settings/catalog"))));
await check("author role reads catalog setting (Database)", assertSucceeds(get(ref(roleOnly.database(), "shops/s1/lyrical/settings/catalog"))));
await check("author role alone opens no book (Firestore)", assertFails(getDoc(doc(roleOnly.firestore(), "shops/s1/books/b1/data/ledger"))));
await check("author role alone writes no book (Firestore)", assertFails(setDoc(doc(roleOnly.firestore(), "shops/s1/books/b1/data/ledger"), { rows: [2] })));
await check("author role alone opens no book (Database)", assertFails(get(ref(roleOnly.database(), "shops/s1/lyrical/books/b1"))));
await check("author role alone reads no submissions (Firestore)", assertFails(getDoc(doc(roleOnly.firestore(), "shops/s1/submissions/b1/expense/s1"))));
await check("author role can't read the book owners list (Firestore)", assertFails(getDoc(doc(roleOnly.firestore(), "shops/s1/settings/bookOwners"))));
await check("author role can't make itself a book's author (Firestore)", assertFails(setDoc(doc(roleOnly.firestore(), "shops/s1/settings/bookOwners"), { b2: "newauthor@example.com" })));
await check("author role can't make itself a book's author (Database)", assertFails(set(ref(roleOnly.database(), "shops/s1/lyrical/settings/bookOwners/b2"), "newauthor@example.com")));
await check("author role reads no backups (Firestore)", assertFails(getDoc(doc(roleOnly.firestore(), "shops/s1/backups/x"))));
// An author's address with no proof behind it. The stockroom shares its sign-in with the shop, whose email-link
// sign-in needs the Email/Password provider on, so anyone can make a password account under an author's address
// (the public web key is enough) and get a pass that names it, unverified. That pass must open nothing.
const unverifiedAuthor = signedIn("u-author-unv", { email: AUTHOR, email_verified: false });
await check("unverified author address reads no book (Firestore)", assertFails(getDoc(doc(unverifiedAuthor.firestore(), "shops/s1/books/b1/data/ledger"))));
await check("unverified author address writes no ledger (Firestore)", assertFails(setDoc(doc(unverifiedAuthor.firestore(), "shops/s1/books/b1/data/ledger"), { rows: [6] })));
await check("unverified author address reads no submissions (Firestore)", assertFails(getDoc(doc(unverifiedAuthor.firestore(), "shops/s1/submissions/b1/expense/s1"))));
await check("unverified author address reads no catalog setting (Firestore)", assertFails(getDoc(doc(unverifiedAuthor.firestore(), "shops/s1/settings/catalog"))));
await check("unverified author address reads no book (Database)", assertFails(get(ref(unverifiedAuthor.database(), "shops/s1/lyrical/books/b1"))));
await check("unverified author address writes no book (Database)", assertFails(set(ref(unverifiedAuthor.database(), "shops/s1/lyrical/books/b1"), { data: "{}", ts: 6 })));
await check("unverified author address reads no catalog setting (Database)", assertFails(get(ref(unverifiedAuthor.database(), "shops/s1/lyrical/settings/catalog"))));
const roleUnverified = shutOut["author role, unverified"];
await check("unverified author role reads no catalog setting (Firestore)", assertFails(getDoc(doc(roleUnverified.firestore(), "shops/s1/settings/catalog"))));
await check("unverified author role reads no catalog setting (Database)", assertFails(get(ref(roleUnverified.database(), "shops/s1/lyrical/settings/catalog"))));
// The bookkeeper role from the shop's Team list (plan 7.17): reads the Tax Centre's bookkeeper copy (no keys) and the
// mode flags, in either database. Never the real Tax Centre (it is in shutOut above), a book, a receipt or any write.
const bookkeeper = shutOut["bookkeeper role"];
await check("bookkeeper reads the tax centre copy (Firestore)", assertSucceeds(getDoc(doc(bookkeeper.firestore(), "shops/s1/settings/taxCentreForBookkeeper"))));
await check("bookkeeper reads the mode flags (Firestore)", assertSucceeds(getDoc(doc(bookkeeper.firestore(), "shops/s1/settings/modeFlags"))));
await check("bookkeeper reads the tax centre copy (Database)", assertSucceeds(get(ref(bookkeeper.database(), "shops/s1/lyrical/settings/taxCentreForBookkeeper"))));
await check("bookkeeper can't change the copy (Firestore)", assertFails(setDoc(doc(bookkeeper.firestore(), "shops/s1/settings/taxCentreForBookkeeper"), { data: "{}", ts: 2 })));
await check("bookkeeper can't change the copy (Database)", assertFails(set(ref(bookkeeper.database(), "shops/s1/lyrical/settings/taxCentreForBookkeeper"), { data: "{}", ts: 2 })));
// Bookkeeping › Reports' copy (13 November 2026): read, never written, by the bookkeeper.
await check("bookkeeper reads the reports copy (Firestore)", assertSucceeds(getDoc(doc(bookkeeper.firestore(), "shops/s1/settings/reportsForBookkeeper"))));
await check("bookkeeper reads the reports copy (Database)", assertSucceeds(get(ref(bookkeeper.database(), "shops/s1/lyrical/settings/reportsForBookkeeper"))));
await check("bookkeeper can't change the reports copy (Firestore)", assertFails(setDoc(doc(bookkeeper.firestore(), "shops/s1/settings/reportsForBookkeeper"), { data: "{}", ts: 2 })));
await check("bookkeeper can't change the reports copy (Database)", assertFails(set(ref(bookkeeper.database(), "shops/s1/lyrical/settings/reportsForBookkeeper"), { data: "{}", ts: 2 })));
await check("bookkeeper reads no catalog (Firestore)", assertFails(getDoc(doc(bookkeeper.firestore(), "shops/s1/settings/catalog"))));
await check("bookkeeper reads no book (Firestore)", assertFails(getDoc(doc(bookkeeper.firestore(), "shops/s1/books/b1/data/ledger"))));
await check("bookkeeper reads no backups (Firestore)", assertFails(getDoc(doc(bookkeeper.firestore(), "shops/s1/backups/x"))));
const unverifiedBookkeeper = signedIn("u-books-unv", { email: "books@example.com", email_verified: false, role: "bookkeeper" });
await check("unverified bookkeeper reads no copy (Firestore)", assertFails(getDoc(doc(unverifiedBookkeeper.firestore(), "shops/s1/settings/taxCentreForBookkeeper"))));
await check("unverified bookkeeper reads no copy (Database)", assertFails(get(ref(unverifiedBookkeeper.database(), "shops/s1/lyrical/settings/taxCentreForBookkeeper"))));

// Not checked: an author's own receipts. storage.rules finds the author through Firestore (firestore.get), and the
// Storage emulator refused that lookup in testing with the old rules as well as the new ones.

// The shop's plan on the platform (the platform's plan 6.7): while platform/plan says anything but "open", every
// Firestore write refuses for everyone, owner included, and reads carry on. Signed-in people read the plan; nobody
// here writes it (the platform does, with its own access).
const owner = people["owner address"];
await env.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), "shops/s1/platform/plan"), { access: "paused", state: "paused" });
});
await check("owner reads the plan", assertSucceeds(getDoc(doc(owner.firestore(), "shops/s1/platform/plan"))));
await check("author reads the plan", assertSucceeds(getDoc(doc(author.firestore(), "shops/s1/platform/plan"))));
await check("bookkeeper reads the plan", assertSucceeds(getDoc(doc(bookkeeper.firestore(), "shops/s1/platform/plan"))));
await check("helper reads the plan", assertSucceeds(getDoc(doc(shutOut["fair helper role"].firestore(), "shops/s1/platform/plan"))));
await check("author role reads the plan", assertSucceeds(getDoc(doc(shutOut["author role, no book"].firestore(), "shops/s1/platform/plan"))));
await check("signed out reads no plan", assertFails(getDoc(doc(shutOut["signed out"].firestore(), "shops/s1/platform/plan"))));
// The plan document holds the press's billing (trial end, next payment, card on file, the Plan & billing link). A
// shopper's sign-in from the shop's account page lands in the same project, so a pass alone must not read it.
const shopper = signedIn("u-shopper", { email: "shopper@example.com", email_verified: true });
await check("a shop customer's sign-in reads no plan", assertFails(getDoc(doc(shopper.firestore(), "shops/s1/platform/plan"))));
await check("staff read no plan", assertFails(getDoc(doc(shutOut["staff role"].firestore(), "shops/s1/platform/plan"))));
await check("owner can't change the plan", assertFails(setDoc(doc(owner.firestore(), "shops/s1/platform/plan"), { access: "open" })));
await check("paused: owner still reads a book", assertSucceeds(getDoc(doc(owner.firestore(), "shops/s1/books/b1/data/ledger"))));
await check("paused: owner can't change a setting", assertFails(setDoc(doc(owner.firestore(), "shops/s1/settings/catalog"), { data: "{}", ts: 9 })));
await check("paused: owner can't change a book", assertFails(setDoc(doc(owner.firestore(), "shops/s1/books/b2/data/ledger"), { rows: [9] })));
await check("paused: owner can't save a backup", assertFails(setDoc(doc(owner.firestore(), "shops/s1/backups/x"), { at: 1 })));
await check("paused: author can't change own ledger", assertFails(setDoc(doc(author.firestore(), "shops/s1/books/b1/data/ledger"), { rows: [9] })));
await env.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), "shops/s1/platform/plan"), { access: "closed", state: "closed" });
});
await check("closed: owner can't change a setting", assertFails(setDoc(doc(owner.firestore(), "shops/s1/settings/catalog"), { data: "{}", ts: 9 })));
await env.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), "shops/s1/platform/plan"), { access: "open", state: "active" });
});
await check("reopened: owner changes a setting", assertSucceeds(setDoc(doc(owner.firestore(), "shops/s1/settings/catalog"), { data: "{}", ts: 10 })));
await check("reopened: author changes own ledger", assertSucceeds(setDoc(doc(author.firestore(), "shops/s1/books/b1/data/ledger"), { rows: [10] })));

// Fair helpers (docs/combined-admin.md › Fair helpers plan): the till's menu and their own sales, nothing else.
const helper = shutOut["fair helper role"].firestore();
const unverifiedHelper = signedIn("u-helper-unv", { email: "helper@example.com", email_verified: false, role: "fairHelper" }).firestore();
const sale = (over = {}) => ({ by: "helper@example.com", at: serverTimestamp(), day: "2026-11-03", fair: "Harbour Fair", method: "Cash", lines: [{ bookId: "b1", title: "B1", qty: 1, price: 24, cur: "CAD" }], ...over });
await check("helper reads the till's menu", assertSucceeds(getDoc(doc(helper, "shops/s1/fairTill/menu"))));
await check("helper can't change the till's menu", assertFails(setDoc(doc(helper, "shops/s1/fairTill/menu"), { books: [], at: "x" })));
await check("helper reads no catalog (author emails, costs)", assertFails(getDoc(doc(helper, "shops/s1/settings/catalog"))));
await check("helper reads no book", assertFails(getDoc(doc(helper, "shops/s1/books/b1/data/ledger"))));
await check("helper writes no book's sales", assertFails(setDoc(doc(helper, "shops/s1/books/b1/data/hist"), { data: "[]", ts: 9 })));
await check("helper adds a sale", assertSucceeds(setDoc(doc(helper, "shops/s1/fairSales/sale-0000001"), sale())));
await check("helper reads their own sale back", assertSucceeds(getDoc(doc(helper, "shops/s1/fairSales/sale-0000001"))));
await check("helper lists their own sales", assertSucceeds(getDocs(query(collection(helper, "shops/s1/fairSales"), where("by", "==", "helper@example.com")))));
await check("helper can't list everyone's sales", assertFails(getDocs(collection(helper, "shops/s1/fairSales"))));
await check("helper can't read another helper's sale", assertFails(getDoc(doc(helper, "shops/s1/fairSales/other-helper-sale"))));
await check("helper can't change a sale once sent", assertFails(setDoc(doc(helper, "shops/s1/fairSales/sale-0000001"), sale({ lines: [{ bookId: "b1", qty: 9 }] }))));
await check("helper can't mark their sale brought in", assertFails(updateDoc(doc(helper, "shops/s1/fairSales/sale-0000001"), { imported: { at: "x" } })));
await check("helper can't undo another helper's sale", assertFails(setDoc(doc(helper, "shops/s1/fairSales/other-helper-sale"), { cancelled: true }, { merge: true })));
await check("helper can't undo with other changes", assertFails(setDoc(doc(helper, "shops/s1/fairSales/sale-0000001"), { cancelled: true, method: "Card" }, { merge: true })));
await check("helper can't mark a sale anything but undone", assertFails(setDoc(doc(helper, "shops/s1/fairSales/sale-0000001"), { cancelled: "yes" }, { merge: true })));
await check("helper undoes their own sale", assertSucceeds(setDoc(doc(helper, "shops/s1/fairSales/sale-0000001"), { cancelled: true }, { merge: true })));
await check("helper can't delete a sale", assertFails(deleteDoc(doc(helper, "shops/s1/fairSales/sale-0000001"))));
await check("helper can't add a sale under another address", assertFails(setDoc(doc(helper, "shops/s1/fairSales/sale-0000002"), sale({ by: "owner@example.com" }))));
await check("helper can't backdate a sale", assertFails(setDoc(doc(helper, "shops/s1/fairSales/sale-0000003"), sale({ at: new Date("2026-01-01") }))));
await check("helper can't use a made-up way of paying", assertFails(setDoc(doc(helper, "shops/s1/fairSales/sale-0000004"), sale({ method: "Free" }))));
await check("helper can't send an empty sale", assertFails(setDoc(doc(helper, "shops/s1/fairSales/sale-0000005"), sale({ lines: [] }))));
await check("helper can't send a sale of 51 lines", assertFails(setDoc(doc(helper, "shops/s1/fairSales/sale-0000006"), sale({ lines: Array.from({ length: 51 }, () => ({ bookId: "b1", qty: 1 })) }))));
await check("helper can't add other fields", assertFails(setDoc(doc(helper, "shops/s1/fairSales/sale-0000007"), sale({ imported: { at: "x" } }))));
await check("helper can't use a short id", assertFails(setDoc(doc(helper, "shops/s1/fairSales/x"), sale())));
await check("unverified helper adds no sale", assertFails(setDoc(doc(unverifiedHelper, "shops/s1/fairSales/sale-0000008"), sale())));
await check("unverified helper reads no menu", assertFails(getDoc(doc(unverifiedHelper, "shops/s1/fairTill/menu"))));
await check("staff add no fair sale", assertFails(setDoc(doc(shutOut["staff role"].firestore(), "shops/s1/fairSales/sale-0000009"), sale({ by: "staff@example.com" }))));
const publisher = people["owner address"].firestore();
await check("publisher writes the till's menu", assertSucceeds(setDoc(doc(publisher, "shops/s1/fairTill/menu"), { books: [{ id: "b1", title: "B1", price: 24, cur: "CAD", onHand: null }], at: "2026-11-03T11:00:00Z" })));
await check("publisher's menu keeps its shape", assertFails(setDoc(doc(publisher, "shops/s1/fairTill/menu"), { books: [], at: "x", extra: 1 })));
await check("publisher reads every helper's sales", assertSucceeds(getDocs(collection(publisher, "shops/s1/fairSales"))));
await check("publisher marks a sale brought in", assertSucceeds(updateDoc(doc(publisher, "shops/s1/fairSales/sale-0000001"), { imported: { at: "2026-11-03T12:00:00Z" } })));
await check("publisher can't rewrite a helper's sale", assertFails(updateDoc(doc(publisher, "shops/s1/fairSales/sale-0000001"), { lines: [] })));
await check("helper can't undo a sale once it is in the books", assertFails(setDoc(doc(helper, "shops/s1/fairSales/sale-0000001"), { cancelled: true }, { merge: true })));
await check("publisher can't delete a helper's sale", assertFails(deleteDoc(doc(publisher, "shops/s1/fairSales/sale-0000001"))));
await check("no one else reads the inbox", assertFails(getDocs(collection(shutOut["bookkeeper role"].firestore(), "shops/s1/fairSales"))));
await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), "shops/s1/platform/plan"), { access: "paused" }); });
await check("a paused shop takes no helper sale", assertFails(setDoc(doc(helper, "shops/s1/fairSales/sale-0000010"), sale())));
await env.withSecurityRulesDisabled(async ctx => { await deleteDoc(doc(ctx.firestore(), "shops/s1/platform/plan")); });

// Walls between shops (LMB-PLATFORM docs/shared-system.md). Shop s2 has its own stockroom; nobody from s1's sign-in list
// may touch it, and nobody from s2's list (or from no list) may touch s1's, whatever role or address the pass carries.
await env.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), "shops/s2/settings/catalog"), { data: "{}", ts: 1 });
  await setDoc(doc(ctx.firestore(), "shops/s2/books/b1/data/ledger"), { rows: [] });
  await set(ref(ctx.database(), "shops/s2/lyrical/books/b1"), { data: "{}", ts: 1 });
  await set(ref(ctx.database(), "shops/s2/lyrical/settings/catalog"), { data: "{}", ts: 1 });
  await setDoc(doc(ctx.firestore(), "shops/s2/settings/reportsForBookkeeper"), { data: "{}", ts: 1 });
  await uploadString(fileRef(ctx.storage(), "shops/s2/receipts/b1/r.pdf"), "x", "raw", { contentType: "application/pdf" });
});
{
  const ownerHere = signedIn("w-owner", { email: OWNER, email_verified: true });
  const ownerThere = signedIn("w-owner2", { email: "owner2@example.com", email_verified: true }, { tenant: "tenant-s2" });
  const ownerAddressThere = signedIn("w-owner3", { email: OWNER, email_verified: true }, { tenant: "tenant-s2" });
  const ownerRoleThere = signedIn("w-role", { email: "x@example.com", email_verified: true, role: "owner" }, { tenant: "tenant-s2" });
  const authorThere = signedIn("w-author", { email: AUTHOR, email_verified: true, role: "author" }, { tenant: "tenant-s2" });
  const noList = signedIn("w-none", { email: OWNER, email_verified: true }, { tenant: "" });
  // A bookkeeper from s1's list never reads s2's reports, and one from s2's list never reads s1's.
  const booksHere = signedIn("w-books", { email: "books@example.com", email_verified: true, role: "bookkeeper" });
  const booksThere = signedIn("w-books2", { email: "books@example.com", email_verified: true, role: "bookkeeper" }, { tenant: "tenant-s2" });
  await check("s1's bookkeeper can't read s2's reports copy", assertFails(getDoc(doc(booksHere.firestore(), "shops/s2/settings/reportsForBookkeeper"))));
  await check("s2's bookkeeper can't read s1's reports copy", assertFails(getDoc(doc(booksThere.firestore(), "shops/s1/settings/reportsForBookkeeper"))));
  await check("s2's bookkeeper reads s2's reports copy", assertSucceeds(getDoc(doc(booksThere.firestore(), "shops/s2/settings/reportsForBookkeeper"))));
  await check("the owner here reads their own stockroom", assertSucceeds(getDoc(doc(ownerHere.firestore(), "shops/s1/settings/catalog"))));
  await check("the owner of s2 reads s2's", assertSucceeds(getDoc(doc(ownerThere.firestore(), "shops/s2/settings/catalog"))));
  for (const [who, ctx] of Object.entries({ "s1's owner": ownerHere })) {
    await check(`${who} can't read s2's catalogue`, assertFails(getDoc(doc(ctx.firestore(), "shops/s2/settings/catalog"))));
    await check(`${who} can't write s2's book`, assertFails(setDoc(doc(ctx.firestore(), "shops/s2/books/b1/data/ledger"), { rows: [1] })));
    await check(`${who} can't read s2's live book`, assertFails(get(ref(ctx.database(), "shops/s2/lyrical/books/b1"))));
    await check(`${who} can't write s2's live settings`, assertFails(set(ref(ctx.database(), "shops/s2/lyrical/settings/catalog"), { data: "{}", ts: 2 })));
    await check(`${who} can't read s2's receipts`, assertFails(getBytes(fileRef(ctx.storage(), "shops/s2/receipts/b1/r.pdf"))));
  }
  for (const [who, ctx] of Object.entries({
    "s2's owner": ownerThere, "s1's owner address from s2's list": ownerAddressThere, "an owner role from s2's list": ownerRoleThere,
    "an author from s2's list": authorThere, "s1's owner address with no list": noList,
  })) {
    await check(`${who} isn't the publisher here`, assertFails(getDoc(doc(ctx.firestore(), "shops/s1/publisherCheck/me"))));
    await check(`${who} can't read s1's catalogue`, assertFails(getDoc(doc(ctx.firestore(), "shops/s1/settings/catalog"))));
    await check(`${who} can't read s1's book`, assertFails(getDoc(doc(ctx.firestore(), "shops/s1/books/b1/data/ledger"))));
    await check(`${who} can't read s1's live book`, assertFails(get(ref(ctx.database(), "shops/s1/lyrical/books/b1"))));
    await check(`${who} can't write s1's live settings`, assertFails(set(ref(ctx.database(), "shops/s1/lyrical/settings/catalog"), { data: "{}", ts: 3 })));
    await check(`${who} can't read s1's receipts`, assertFails(getBytes(fileRef(ctx.storage(), "shops/s1/receipts/b2/r.pdf"))));
    await check(`${who} can't add a cover to s1`, assertFails(uploadString(fileRef(ctx.storage(), "shops/s1/covers/b1/c.jpg"), "x", "raw", { contentType: "image/jpeg" })));
  }
  await check("nobody reads a shop's record", assertFails(getDoc(doc(ownerHere.firestore(), "shops/s1"))));
  await check("nobody writes a shop's record", assertFails(setDoc(doc(ownerHere.firestore(), "shops/s1"), { tenant: "tenant-s2" })));
  await check("nobody reads the live record", assertFails(get(ref(ownerHere.database(), "shops/s1/record"))));
  await check("nobody writes the live record", assertFails(set(ref(ownerHere.database(), "shops/s1/record/ownerEmail"), "x@example.com")));
  await check("nobody reads the live shops list", assertFails(get(ref(ownerHere.database(), "shops"))));
  // A shop on the project's own sign-in list (tenant ""; the demo shop): only passes with no list count there.
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), "shops/s3"), { tenant: "", ownerEmail: OWNER });
    await set(ref(ctx.database(), "shops/s3/record"), { tenant: "", ownerEmail: OWNER });
    await set(ref(ctx.database(), "shops/s3/lyrical/books/b1"), { data: "{}", ts: 1 });
  });
  await check("a shop with no list of its own: its owner with no list gets in", assertSucceeds(getDoc(doc(noList.firestore(), "shops/s3/publisherCheck/me"))));
  await check("a shop with no list of its own: its owner reads the live book", assertSucceeds(get(ref(noList.database(), "shops/s3/lyrical/books/b1"))));
  await check("a shop with no list of its own: a pass from s1's list is nobody there", assertFails(get(ref(ownerHere.database(), "shops/s3/lyrical/books/b1"))));
  await check("a shop with no list of its own: same in Firestore", assertFails(getDoc(doc(ownerHere.firestore(), "shops/s3/publisherCheck/me"))));
  await check("nothing outside the shop folders", assertFails(setDoc(doc(ownerHere.firestore(), "settings/catalog"), { data: "{}" })));
}

await env.cleanup();
console.log(failures ? `${failures} check(s) failed` : "all checks passed");
process.exit(failures ? 1 : 0);
