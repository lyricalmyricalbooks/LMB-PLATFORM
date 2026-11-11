// Behavioural check of firestore.rules against the real rules engine (Firestore emulator).
// CI runs it on every pull request (job firestore-rules in .github/workflows/ci.yml). It is not part of
// `pnpm test` (it needs Java and the emulator). Locally, from an empty folder outside the repo:
//   npm i @firebase/rules-unit-testing@6.0.0 firebase@13.1.0 firebase-tools@15.32.1 && cp <repo>/scripts/firestore-rules-emulator.mjs .
//   RULES_FILE=<repo>/firestore.rules npx firebase emulators:exec --only firestore --project demo-rules "node firestore-rules-emulator.mjs"
// It caught that an unrolled per-line order check exceeded the 1000-expression limit and
// refused every guest order, which the text checks in src/app/securityRules.test.ts can't see.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, collectionGroup, query, where, orderBy, documentId, writeBatch, increment, serverTimestamp, Timestamp } from "firebase/firestore";

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const rulesPath = process.env.RULES_FILE || new URL("../firestore.rules", import.meta.url);
const rules = readFileSync(rulesPath, "utf8");
const env = await initializeTestEnvironment({ projectId: "demo-rules", firestore: { rules, host, port: Number(port) } });
let failures = 0;
async function check(name, p) { try { await p; console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, e.message); } }

// The shared system (LMB-PLATFORM docs/shared-system.md): every shop is a folder, shops/<id>, in one database, and a
// sign-in belongs to one shop's sign-in list (its tenant). The checks below run in shop "s1"; the last block proves that
// nothing from shop "s2" (or a sign-in with no tenant) gets into it. Each shop's record names its tenant and owner.
const SHOP = "s1";
const TENANT = "tenant-s1";
const folder = (fs, shop = SHOP) => doc(fs, "shops", shop);
/** A signed-in person of `tenant`'s shop, reading and writing inside `shop`'s folder. */
function signedIn(uid, claims = {}, { tenant = TENANT, shop = SHOP } = {}) {
  const firebase = { sign_in_provider: "password", ...(claims.firebase || {}), ...(tenant ? { tenant } : {}) };
  return folder(env.authenticatedContext(uid, { ...claims, firebase }).firestore(), shop);
}
await env.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), "shops/s1"), { tenant: TENANT, ownerEmail: "owner@example.com" });
  await setDoc(doc(ctx.firestore(), "shops/s2"), { tenant: "tenant-s2", ownerEmail: "owner2@example.com" });
});

await env.withSecurityRulesDisabled(async ctx => {
  const db = folder(ctx.firestore());
  await setDoc(doc(db, "pages/pub"), { status: "published", title: "About" });
  await setDoc(doc(db, "pages/draft"), { status: "draft", title: "Secret" });
  await setDoc(doc(db, "reviews/existing"), { status: "approved", createdAt: "x" });
  // Books: published ones are public; drafts, archived and records saved before statuses existed are not.
  await setDoc(doc(db, "books/pub"), { status: "published", title: "Public book", retailPrice: 20 });
  await setDoc(doc(db, "books/draft"), { status: "draft", title: "Unannounced" });
  await setDoc(doc(db, "books/old"), { title: "No status yet" });
  await setDoc(doc(db, "books/pub/private/admin"), { costPrice: 6.5, shelfLocation: "B2" });
  await setDoc(doc(db, "analytics/seeded"), { date: "seeded", visits: 5 });
});
const anon = folder(env.unauthenticatedContext().firestore());
const today = new Date().toISOString().split("T")[0];

// pages
await check("anon reads published page", assertSucceeds(getDoc(doc(anon, "pages/pub"))));
await check("anon can't read draft page", assertFails(getDoc(doc(anon, "pages/draft"))));
await check("anon published query", assertSucceeds(getDocs(query(collection(anon, "pages"), where("status", "==", "published")))));
await check("anon unfiltered list refused", assertFails(getDocs(collection(anon, "pages"))));

// analytics
await check("visit today", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, visits: increment(1) }, { merge: true })));
await check("funnel today (update)", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, funnel: { add_to_cart: increment(1) } }, { merge: true })));
await check("made-up day refused", assertFails(setDoc(doc(anon, "analytics", "1999-01-01"), { date: "1999-01-01", visits: increment(1) }, { merge: true })));
await check("bad id refused", assertFails(setDoc(doc(anon, "analytics", "spam-doc"), { date: "spam-doc" }, { merge: true })));
await check("mismatched date refused", assertFails(setDoc(doc(anon, "analytics", today), { date: "2020-01-01" }, { merge: true })));

// newsletter: double opt-in means browsers can't add (or read) subscribers at all
await check("anon can't add a newsletter signup", assertFails(setDoc(doc(anon, "newsletter/stranger@example.com"), { email: "stranger@example.com", subscribedAt: "x", source: "website" })));
await check("anon can't pre-confirm a signup", assertFails(setDoc(doc(anon, "newsletter/stranger@example.com"), { email: "stranger@example.com", status: "confirmed", subscribedAt: "x" })));
await check("anon can't read the newsletter list", assertFails(getDoc(doc(anon, "newsletter/stranger@example.com"))));
// analytics counters can't be forged (#111)
const tomorrow = new Date(Date.now() + 864e5).toISOString().split("T")[0];
const yesterday = new Date(Date.now() - 864e5).toISOString().split("T")[0];
await check("a normal first visit on an earlier day creates its doc (control)", assertSucceeds(setDoc(doc(anon, "analytics", yesterday), { date: yesterday, visits: increment(1) }, { merge: true })));
await check("negative visits on create refused", assertFails(setDoc(doc(anon, "analytics", tomorrow), { date: tomorrow, visits: -1000000000 }, { merge: true })));
await check("a visit can't be more than one", assertFails(setDoc(doc(anon, "analytics", tomorrow), { date: tomorrow, visits: 50 }, { merge: true })));
await check("forged funnel value refused", assertFails(setDoc(doc(anon, "analytics", today), { date: today, funnel: { purchase: 999999 } }, { merge: true })));
await check("funnel key outside the known four refused", assertFails(setDoc(doc(anon, "analytics", today), { date: today, funnel: { made_up: increment(1) } }, { merge: true })));
await check("funnel purchase +1 ok", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, funnel: { purchase: increment(1) } }, { merge: true })));
await check("funnel can't go back down", assertFails(setDoc(doc(anon, "analytics", today), { date: today, funnel: { add_to_cart: 0 } }, { merge: true })));
await check("device bucket +1 ok", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, devices: { mobile: increment(1) } }, { merge: true })));
await check("unknown device bucket refused", assertFails(setDoc(doc(anon, "analytics", today), { date: today, devices: { toaster: increment(1) } }, { merge: true })));
await check("source +1 ok (one entry per write)", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, sources: { google: increment(1) } }, { merge: true })));
await check("two sources in one write refused", assertFails(setDoc(doc(anon, "analytics", today), { date: today, sources: { bing: increment(1), duckduckgo: increment(1) } }, { merge: true })));
await check("a write can't wipe the sources map", assertFails(setDoc(doc(anon, "analytics", today), { date: today, sources: { other: increment(1) } })));
// Overview analytics 3.0: per-book bag/wishlist adds, unbuyable views, checkout steps and page speed
await check("book added to bag +1 ok", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, bookAdds: { book1: increment(1) } }, { merge: true })));
await check("wishlist add +1 ok", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, wishlistAdds: { book1: increment(1) } }, { merge: true })));
await check("unbuyable view +1 ok", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, unbuyableViews: { book1: increment(1) } }, { merge: true })));
await check("two books in one bag write refused", assertFails(setDoc(doc(anon, "analytics", today), { date: today, bookAdds: { a: increment(1), b: increment(1) } }, { merge: true })));
await check("checkout step +1 ok", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, checkout: { pay: increment(1) } }, { merge: true })));
await check("unknown checkout step refused", assertFails(setDoc(doc(anon, "analytics", today), { date: today, checkout: { made_up: increment(1) } }, { merge: true })));
await check("forged checkout count refused", assertFails(setDoc(doc(anon, "analytics", today), { date: today, checkout: { declined: 5000 } }, { merge: true })));
await check("page speed +1 ok", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, vitals: { phone_ggg: increment(1) } }, { merge: true })));
// A busy day: every map on the doc at once. A merge write carries all of them, and must still fit the rules budget.
{
  const busy = today;
  const many = (prefix, n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, 3]));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(folder(ctx.firestore()), "analytics", busy), {
      date: busy, visits: 500, funnel: { view: 40, add_to_cart: 9, checkout_start: 5, purchase: 2 }, devices: { mobile: 9, tablet: 1, desktop: 4 },
      sources: many("s", 59), searches: many("q", 149), noResults: many("n", 149), bookViews: many("b", 299), categoryViews: many("c", 99),
      bookAdds: many("b", 299), wishlistAdds: many("b", 299), unbuyableViews: many("b", 299),
      checkout: { email: 5, address: 4, delivery: 4, pay: 3, fields: 1, declined: 1, failed: 1 }, vitals: many("phone_gg", 1),
    });
  });
  await check("busy day: a visit still counts", assertSucceeds(setDoc(doc(anon, "analytics", busy), { date: busy, visits: increment(1) }, { merge: true })));
  await check("busy day: a book view still counts", assertSucceeds(setDoc(doc(anon, "analytics", busy), { date: busy, bookViews: { b1: increment(1) } }, { merge: true })));
  await check("busy day: a funnel step still counts", assertSucceeds(setDoc(doc(anon, "analytics", busy), { date: busy, funnel: { view: increment(1) } }, { merge: true })));
  await check("busy day: a checkout step still counts", assertSucceeds(setDoc(doc(anon, "analytics", busy), { date: busy, checkout: { email: increment(1) } }, { merge: true })));
  await check("busy day: a page speed visit still counts", assertSucceeds(setDoc(doc(anon, "analytics", busy), { date: busy, vitals: { computer_ggg: increment(1) } }, { merge: true })));
  await check("busy day: a checkout step can't go down", assertFails(setDoc(doc(anon, "analytics", busy), { date: busy, checkout: { pay: -5 } }, { merge: true })));
  await check("busy day: a sources map can't be emptied", assertFails(setDoc(doc(anon, "analytics", busy), { date: busy, sources: {} })));
}
// Combined counter writes (lib/commerce.ts planCounterWrites): one write may carry the visit, several maps and several
// fixed keys, but still one entry per free-key map and +1 per fixed key.
await check("combined: visit + source + device in one write", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, visits: increment(1), sources: { google: increment(1) }, devices: { mobile: increment(1) } }, { merge: true })));
await check("combined: book page view, book, unbuyable and a category in one write", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, funnel: { view: increment(1) }, bookViews: { bk1: increment(1) }, unbuyableViews: { bk1: increment(1) }, categoryViews: { POETRY: increment(1) } }, { merge: true })));
await check("combined: two funnel steps and two checkout steps in one write", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, funnel: { view: increment(1), add_to_cart: increment(1) }, checkout: { email: increment(1), address: increment(1) } }, { merge: true })));
await check("combined: repeats of one search term added together", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, searches: { poems: increment(2) } }, { merge: true })));
await check("combined: two categories in one write refused (planner splits them)", assertFails(setDoc(doc(anon, "analytics", today), { date: today, funnel: { view: increment(1) }, categoryViews: { A: increment(1), B: increment(1) } }, { merge: true })));
await check("combined: two visits in one write refused (planner splits them)", assertFails(setDoc(doc(anon, "analytics", today), { date: today, visits: increment(2), sources: { google: increment(1) } }, { merge: true })));
{
  // The heaviest writes the planner allows (rules cost 12, commerce.ts MAX_WRITE_RULE_COST) on a busy doc must pass.
  // One touching every map at once is refused by the engine (cost ~25), which is why the planner caps a write.
  const busy2 = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const many = (prefix, n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, 3]));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(folder(ctx.firestore()), "analytics", busy2), {
      date: busy2, visits: 500, funnel: { view: 40, add_to_cart: 9, checkout_start: 5, purchase: 2 }, devices: { mobile: 9, tablet: 1, desktop: 4 },
      sources: many("s", 50), searches: many("q", 140), noResults: many("n", 140), bookViews: many("b", 290), categoryViews: many("c", 90),
      bookAdds: many("b", 290), wishlistAdds: many("b", 290), unbuyableViews: many("b", 290),
      checkout: { email: 5, address: 4, delivery: 4, pay: 3, fields: 1, declined: 1, failed: 1 }, vitals: many("phone_gg", 1),
    });
  });
  const i = () => increment(1);
  await check("busy day: heaviest combined write (checkout + funnel + visit + one map) counts", assertSucceeds(setDoc(doc(anon, "analytics", busy2), {
    date: busy2, visits: i(), funnel: { view: i(), add_to_cart: i(), checkout_start: i(), purchase: i() },
    checkout: { email: i(), address: i(), delivery: i(), pay: i(), fields: i(), declined: i(), failed: i() }, sources: { new1: i() },
  }, { merge: true })));
  await check("busy day: heaviest combined write (checkout + devices + visit + two maps) counts", assertSucceeds(setDoc(doc(anon, "analytics", busy2), {
    date: busy2, visits: i(), devices: { mobile: i(), tablet: i(), desktop: i() },
    checkout: { email: i(), address: i(), delivery: i(), pay: i(), fields: i(), declined: i(), failed: i() }, searches: { newq: i() }, bookViews: { newb: i() },
  }, { merge: true })));
  await check("busy day: heaviest combined write (funnel + devices + five maps) counts", assertSucceeds(setDoc(doc(anon, "analytics", busy2), {
    date: busy2, visits: i(), funnel: { view: i(), add_to_cart: i(), checkout_start: i(), purchase: i() }, devices: { mobile: i(), tablet: i(), desktop: i() },
    sources: { new2: i() }, noResults: { newn: i() }, categoryViews: { newc: i() }, bookAdds: { newb: i() }, unbuyableViews: { newb: i() },
  }, { merge: true })));
  await check("busy day: heaviest combined write (nine free maps) counts", assertSucceeds(setDoc(doc(anon, "analytics", busy2), {
    date: busy2, visits: i(), sources: { new3: i() }, searches: { newq2: i() }, noResults: { newn2: i() }, bookViews: { newb2: i() }, categoryViews: { newc2: i() },
    bookAdds: { newb2: i() }, wishlistAdds: { newb2: i() }, unbuyableViews: { newb2: i() }, vitals: { phone_ggg: i() },
  }, { merge: true })));
}
await check("unknown analytics field refused", assertFails(setDoc(doc(anon, "analytics", today), { date: today, madeUp: { x: increment(1) } }, { merge: true })));

// reviews + contacts
{
  const createdAt = new Date().toISOString();
  const b = writeBatch(anon.firestore);
  b.set(doc(anon, "reviews/r1"), { bookId: "b", authorName: "A", rating: 5, title: "", body: "Nice", status: "pending", createdAt });
  b.set(doc(anon, "reviewContacts/r1"), { email: "a@b.co", createdAt });
  await check("review + contact batch", assertSucceeds(b.commit()));
}
await check("contact alone refused", assertFails(setDoc(doc(anon, "reviewContacts/r2"), { email: "a@b.co", createdAt: "x" })));
await check("contact on existing review refused", assertFails(setDoc(doc(anon, "reviewContacts/existing"), { email: "a@b.co", createdAt: "x" })));
{
  const createdAt = new Date().toISOString();
  const b = writeBatch(anon.firestore);
  b.set(doc(anon, "reviews/r3"), { bookId: "b", rating: 5, body: "Nice", status: "pending", createdAt });
  await check("review without email", assertSucceeds(b.commit()));
}

// customers
const user = signedIn("u1", { email: "reader@example.com", email_verified: true });
await check("own profile create", assertSucceeds(setDoc(doc(user, "customers/u1"), { uid: "u1", email: "reader@example.com", name: "Reader" })));
await check("own profile address update", assertSucceeds(setDoc(doc(user, "customers/u1"), { uid: "u1", email: "reader@example.com", name: "Reader", phone: "555", defaultAddress: { street: "1 Main", city: "Toronto", state: "ON", zip: "M1M1M1", country: "Canada" } })));
await check("other email refused", assertFails(setDoc(doc(user, "customers/u1"), { uid: "u1", email: "victim@example.com", name: "x" })));
await check("huge name refused", assertFails(setDoc(doc(user, "customers/u1"), { uid: "u1", email: "reader@example.com", name: "x".repeat(500) })));
await check("extra key refused", assertFails(setDoc(doc(user, "customers/u1"), { uid: "u1", email: "reader@example.com", name: "x", junk: "y" })));
const noEmail = signedIn("u2", {});
await check("no-email account with blank email", assertSucceeds(setDoc(doc(noEmail, "customers/u2"), { uid: "u2", email: "", name: "" })));
await check("no-email account naming an email refused", assertFails(setDoc(doc(noEmail, "customers/u2"), { uid: "u2", email: "victim@example.com", name: "" })));

// orders
const key = "a".repeat(64);
const order = (over = {}) => ({
  customer: { name: "Reader", email: "reader@example.com", phone: "", address: { street: "1 Main", unit: "", city: "Toronto", state: "ON", zip: "M1M", country: "Canada" }, billingAddress: { state: "", country: "Canada" } },
  customerId: null, referralSource: "direct", addressVerified: true, addressError: "",
  items: [{ id: "b1", variantId: null, variantName: null, title: "Book", price: 10, quantity: 2, photoUrl: "", stripePriceId: null, shippingProfileId: null }],
  subtotal: 20, discount: 0, shipping: 0, shippingMethod: null, tax: 0, total: 20, status: "pending_payment", paymentStatus: "unpaid",
  paymentMethod: "Stripe", paymentInstructions: "", testMode: false, appliedDiscount: null, metadata: { userAgent: "Mozilla/5.0", platform: "web" },
  trackingKey: key, createdAt: "now", updatedAt: "now", activity: [], ...over,
});
await check("normal guest order", assertSucceeds(setDoc(doc(anon, "orders/AB-1"), { ...order(), orderId: "AB-1" })));
// Everything checkout can send at once (a note, a discount, a gift card, a named address, the billing block): the
// heaviest guest order must stay under the rules engine's 1000-expression limit, or every such order is refused.
await check("fullest guest order ok", assertSucceeds(setDoc(doc(anon, "orders/AB-2"), { ...order({
  customer: { name: "Reader", email: "reader@example.com", phone: "555-0100", address: { name: "Sam Reader", street: "1 Main", unit: "2", city: "Toronto", state: "ON", zip: "M1M", country: "Canada" }, billingAddress: { state: "ON", country: "Canada" } },
  orderNote: "Please gift wrap", giftCards: ["ABCD-1234"], appliedDiscount: { code: "WELCOME10", type: "percentage", value: 10 },
}), orderId: "AB-2" })));
await check("50 good lines ok", assertSucceeds(setDoc(doc(anon, "orders/AB-4"), { ...order({ items: Array.from({ length: 50 }, () => ({ id: "b", quantity: 99 })) }), orderId: "AB-4" })));
await check("bloated metadata refused", assertFails(setDoc(doc(anon, "orders/AB-5"), { ...order({ metadata: { userAgent: "x".repeat(5000), platform: "web" } }), orderId: "AB-5" })));
await check("bloated customer refused", assertFails(setDoc(doc(anon, "orders/AB-6"), { ...order({ customer: { name: "x".repeat(1000), email: "a@b.co" } }), orderId: "AB-6" })));

// guest orders: every field has a type and a size (#112)
await check("negative total refused", assertFails(setDoc(doc(anon, "orders/AB-10"), { ...order({ total: -5 }), orderId: "AB-10" })));
await check("huge total refused", assertFails(setDoc(doc(anon, "orders/AB-11"), { ...order({ total: 1e12 }), orderId: "AB-11" })));
await check("string total refused", assertFails(setDoc(doc(anon, "orders/AB-12"), { ...order({ total: "20" }), orderId: "AB-12" })));
await check("huge shippingMethod refused", assertFails(setDoc(doc(anon, "orders/AB-13"), { ...order({ shippingMethod: "x".repeat(5000) }), orderId: "AB-13" })));
await check("object shippingMethod refused", assertFails(setDoc(doc(anon, "orders/AB-14"), { ...order({ shippingMethod: { a: 1 } }), orderId: "AB-14" })));
await check("bloated appliedDiscount refused", assertFails(setDoc(doc(anon, "orders/AB-15"), { ...order({ appliedDiscount: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i])) }), orderId: "AB-15" })));
await check("long activity list refused", assertFails(setDoc(doc(anon, "orders/AB-16"), { ...order({ activity: Array.from({ length: 20 }, () => ({ type: "event" })) }), orderId: "AB-16" })));
await check("extra customer key refused", assertFails(setDoc(doc(anon, "orders/AB-17"), { ...order({ customer: { ...order().customer, isAdmin: true } }), orderId: "AB-17" })));
await check("non-boolean testMode refused", assertFails(setDoc(doc(anon, "orders/AB-18"), { ...order({ testMode: "yes" }), orderId: "AB-18" })));
await check("free order (total 0) ok", assertSucceeds(setDoc(doc(anon, "orders/AB-19"), { ...order({ total: 0, subtotal: 0, paymentMethod: "Free" }), orderId: "AB-19" })));
// how the shopper found the shop (src/app/lib/visitSource.ts): one JSON string
const acq = JSON.stringify({ source: "instagram", medium: "social", campaign: "fall", term: "t", content: "c", referrer: "l.instagram.com", landingPage: "/books/x", clickId: "fbclid", firstSeenAt: "2026-10-18T00:00:00.000Z" });
await check("order with acquisition ok", assertSucceeds(setDoc(doc(anon, "orders/AB-20"), { ...order({ acquisition: acq }), orderId: "AB-20" })));
await check("long acquisition refused", assertFails(setDoc(doc(anon, "orders/AB-22"), { ...order({ acquisition: "x".repeat(2001) }), orderId: "AB-22" })));
await check("acquisition as a map refused", assertFails(setDoc(doc(anon, "orders/AB-23"), { ...order({ acquisition: { source: "x" } }), orderId: "AB-23" })));

// books: shoppers see published books only, never the private fields (#18)
await check("anon reads a published book", assertSucceeds(getDoc(doc(anon, "books/pub"))));
await check("anon can't read a draft book", assertFails(getDoc(doc(anon, "books/draft"))));
await check("anon can't read a book with no status", assertFails(getDoc(doc(anon, "books/old"))));
await check("anon published list query", assertSucceeds(getDocs(query(collection(anon, "books"), where("status", "==", "published"), orderBy(documentId())))));
await check("anon unfiltered list refused", assertFails(getDocs(collection(anon, "books"))));
await check("anon can't read the private document", assertFails(getDoc(doc(anon, "books/pub/private/admin"))));
await check("anon can't list the private documents", assertFails(getDocs(collectionGroup(anon.firestore, "private"))));
await check("signed-in customer can't read the private document", assertFails(getDoc(doc(user, "books/pub/private/admin"))));
await check("anon can't write a book", assertFails(setDoc(doc(anon, "books/new"), { status: "published", title: "x" })));
await check("anon can't write the private document", assertFails(setDoc(doc(anon, "books/pub/private/admin"), { costPrice: 0 })));
{
  const admin = signedIn("admin", { email: "owner@example.com", email_verified: true });
  await check("admin reads a draft book", assertSucceeds(getDoc(doc(admin, "books/draft"))));
  await check("admin lists every book", assertSucceeds(getDocs(collection(admin, "books"))));
  await check("admin reads the private document", assertSucceeds(getDoc(doc(admin, "books/pub/private/admin"))));
  // The admin reads private documents one book at a time: a collection-group read would cross every shop's folder.
  await check("admin can't read every shop's private documents (collection group)", assertFails(getDocs(collectionGroup(admin.firestore, "private"))));
  await check("admin writes the private document", assertSucceeds(setDoc(doc(admin, "books/pub/private/admin"), { costPrice: 7 }, { merge: true })));
  // Overview sales notes (admin/overview/overviewNotesStore.ts): admin-only, same shape as the boards.
  await check("admin saves the Overview notes", assertSucceeds(setDoc(doc(admin, "adminPrefs/overviewNotes"), { data: "[]", updatedAt: Date.now() })));
  await check("admin reads the Overview notes", assertSucceeds(getDoc(doc(admin, "adminPrefs/overviewNotes"))));
  await check("Overview notes refuse extra keys", assertFails(setDoc(doc(admin, "adminPrefs/overviewNotes"), { data: "[]", updatedAt: Date.now(), extra: 1 })));
  await check("Overview notes refuse a huge payload", assertFails(setDoc(doc(admin, "adminPrefs/overviewNotes"), { data: "x".repeat(200001), updatedAt: Date.now() })));
  await check("other admin prefs docs stay closed", assertFails(setDoc(doc(admin, "adminPrefs/somethingElse"), { data: "[]", updatedAt: Date.now() })));
  await check("signed-in customer can't read the Overview notes", assertFails(getDoc(doc(user, "adminPrefs/overviewNotes"))));
  await check("anon can't write the Overview notes", assertFails(setDoc(doc(anon, "adminPrefs/overviewNotes"), { data: "[]", updatedAt: 1 })));
  // The combined admin's tour, seen on any device (admin/combinedTourStore.ts): admin-only, same shape.
  await check("admin marks the tour seen", assertSucceeds(setDoc(doc(admin, "adminPrefs/combinedTour"), { data: "done", updatedAt: Date.now() })));
  await check("signed-in customer can't read the tour mark", assertFails(getDoc(doc(user, "adminPrefs/combinedTour"))));
  await check("anon can't write the tour mark", assertFails(setDoc(doc(anon, "adminPrefs/combinedTour"), { data: "done", updatedAt: 1 })));
  // Stockroom › QR codes' own codes (admin/stockroom/qrCodesStore.ts): admin-only, same shape.
  await check("admin saves the QR codes", assertSucceeds(setDoc(doc(admin, "adminPrefs/qrCodes"), { data: "[]", updatedAt: Date.now() })));
  await check("signed-in customer can't read the QR codes", assertFails(getDoc(doc(user, "adminPrefs/qrCodes"))));
  await check("anon can't write the QR codes", assertFails(setDoc(doc(anon, "adminPrefs/qrCodes"), { data: "[]", updatedAt: 1 })));
  // Stockroom › Sheets' switch (admin/stockroom/sheetsStore.ts): admin-only, same shape.
  await check("admin saves the sheet switch", assertSucceeds(setDoc(doc(admin, "adminPrefs/sheets"), { data: "{\"copy\":false}", updatedAt: Date.now() })));
  await check("signed-in customer can't read the sheet switch", assertFails(getDoc(doc(user, "adminPrefs/sheets"))));
  await check("anon can't write the sheet switch", assertFails(setDoc(doc(anon, "adminPrefs/sheets"), { data: "{}", updatedAt: 1 })));
  await check("other adminPrefs documents stay closed", assertFails(setDoc(doc(admin, "adminPrefs/somethingElse"), { data: "x", updatedAt: 1 })));
  const unverified = signedIn("imposter", { email: "owner@example.com", email_verified: false });
  await check("unverified admin email can't read the private document", assertFails(getDoc(doc(unverified, "books/pub/private/admin"))));
}

// contactMessages unchanged
await check("server-only throttle closed", assertFails(getDoc(doc(anon, "contact-email-throttle/x"))));
await check("server-only hold owners closed", assertFails(getDoc(doc(anon, "stock-hold-owners/x"))));

// admin-only customer notes and marketing opt-outs
await check("anon can't read customer notes", assertFails(getDoc(doc(anon, "customerNotes/x"))));
await check("anon can't write customer notes", assertFails(setDoc(doc(anon, "customerNotes/x"), { email: "a@b.co", note: "", tags: [], updatedAt: "now" })));
await check("anon can't read opt-outs", assertFails(getDoc(doc(anon, "marketing-optout/x"))));
{
  const admin = signedIn("admin", { email: "owner@example.com", email_verified: true });
  await check("admin writes a customer note", assertSucceeds(setDoc(doc(admin, "customerNotes/x"), { email: "a@b.co", note: "Likes poetry", tags: ["wholesale"], updatedAt: "now" })));
  await check("admin keeps a brought-over customer's name and place", assertSucceeds(setDoc(doc(admin, "customerNotes/z"), { email: "b@b.co", note: "Brought over from your old shop", tags: [], name: "Ben", place: "Toronto, ON", updatedAt: "now" })));
  await check("admin note name too long refused", assertFails(setDoc(doc(admin, "customerNotes/z2"), { email: "b@b.co", note: "", tags: [], name: "x".repeat(101), updatedAt: "now" })));
  await check("admin note extra key refused", assertFails(setDoc(doc(admin, "customerNotes/y"), { email: "a@b.co", note: "", tags: [], updatedAt: "now", junk: 1 })));
  await check("admin reads opt-outs", assertSucceeds(getDoc(doc(admin, "marketing-optout/x"))));
  await check("admin can't write opt-outs", assertFails(setDoc(doc(admin, "marketing-optout/x"), { at: "now" })));
  // Overview › Your first week (plan 3.3)
  await check("admin ticks a first-week step", assertSucceeds(setDoc(doc(admin, "firstWeek/start"), { sellingToday: "online", done: { look: "now" }, updatedAt: "now" })));
  await check("admin hides the first-week list", assertSucceeds(setDoc(doc(admin, "firstWeek/start"), { hiddenAt: "now" }, { merge: true })));
  await check("first-week extra key refused", assertFails(setDoc(doc(admin, "firstWeek/start"), { junk: 1 }, { merge: true })));
  // Choose your look (plan 6.3) and the guide's progress for the trial emails (plan 6.10)
  await check("admin records Choose your look", assertSucceeds(setDoc(doc(admin, "firstWeek/start"), { welcome: { theme: "press-zine", at: "now", skipped: false } }, { merge: true })));
  await check("admin saves the guide's progress", assertSucceeds(setDoc(doc(admin, "firstWeek/start"), { progress: { steps: ["logo", "look"], done: ["look"], at: "now" } }, { merge: true })));
  await check("welcome records the admin look", assertSucceeds(setDoc(doc(admin, "firstWeek/start"), { welcome: { theme: "press-zine", at: "now", adminLook: "paper" } }, { merge: true })));
  await check("welcome with an unknown admin look refused", assertFails(setDoc(doc(admin, "firstWeek/start"), { welcome: { theme: "press-zine", at: "now", adminLook: "neon" } }, { merge: true })));
  await check("welcome with an extra key refused", assertFails(setDoc(doc(admin, "firstWeek/start"), { welcome: { theme: "x", at: "now", junk: 1 } }, { merge: true })));
  await check("admin changes what the shop sells", assertSucceeds(setDoc(doc(admin, "firstWeek/start"), { sells: "mixed" }, { merge: true })));
  await check("what the shop sells must be a known answer", assertFails(setDoc(doc(admin, "firstWeek/start"), { sells: "weapons" }, { merge: true })));
  await check("admin can't change the sign-up answer", assertFails(setDoc(doc(admin, "firstWeek/start"), { sellingToday: "fairs" }, { merge: true })));
  await check("admin can't change the plan", assertFails(setDoc(doc(admin, "firstWeek/start"), { plan: "both" }, { merge: true })));
}
await check("anon can't read the first week", assertFails(getDoc(doc(anon, "firstWeek/start"))));
await check("anon can't write the first week", assertFails(setDoc(doc(anon, "firstWeek/start"), { hiddenAt: "now" })));

// Inventory app link: per-order records are server-only; the admin reads the link's status document.
{
  const admin = signedIn("admin", { email: "owner@example.com", email_verified: true });
  await check("anon can't read inventory pushes", assertFails(getDoc(doc(anon, "inventoryPushes/x"))));
  await check("admin can't read inventory pushes", assertFails(getDoc(doc(admin, "inventoryPushes/x"))));
  await check("admin can't write inventory pushes", assertFails(setDoc(doc(admin, "inventoryPushes/x"), { net: { a: 1 } })));
  await check("admin reads the link status", assertSucceeds(getDoc(doc(admin, "systemStatus/inventoryLink"))));
  await check("admin can't write the link status", assertFails(setDoc(doc(admin, "systemStatus/inventoryLink"), { links: {} })));
  await check("anon can't read the link status", assertFails(getDoc(doc(anon, "systemStatus/inventoryLink"))));
}

// contactMessages: one plain sender address only (never a list the auto-reply could be sent to)
{
  const message = email => ({ name: "Ada", email, phone: "", subject: "Hi", message: "Hello", page: "/", status: "new", createdAt: serverTimestamp() });
  await check("contact form accepts one address", assertSucceeds(setDoc(doc(anon, "contactMessages/ok"), message("ada@example.com"))));
  for (const [name, email] of [["comma list", "a@x.com,b@y.com"], ["semicolon list", "a@x.com;b@y.com"], ["space list", "a@x.com b@y.com"], ["angle brackets", "Ada <a@x.com>"]]) {
    await check(`contact form refuses a ${name}`, assertFails(setDoc(doc(anon, `contactMessages/bad-${name.replace(/\W/g, "")}`), message(email))));
  }
}

// clientErrors: written only by the Functions; shoppers can neither add nor read crash reports
await check("anon can't write a crash report", assertFails(setDoc(doc(anon, "clientErrors/x"), { message: "fake", count: 1 })));
await check("anon can't read crash reports", assertFails(getDoc(doc(anon, "clientErrors/x"))));

// Team roles (functions/roles.js): the owner address or a role on the pass opens the admin; only owners manage the Team
{
  const owner = signedIn("o1", { email: "owner@example.com", email_verified: true });
  const ownerRole = signedIn("o2", { email: "co@press.test", email_verified: true, role: "owner" });
  const staff = signedIn("s1", { email: "sam@press.test", email_verified: true, role: "staff" });
  const unverifiedStaff = signedIn("s2", { email: "kim@press.test", email_verified: false, role: "staff" });
  const stranger = signedIn("r1", { email: "reader@press.test", email_verified: true, role: "boss" });
  await check("staff reads a draft book", assertSucceeds(getDoc(doc(staff, "books/draft"))));
  await check("unverified staff can't", assertFails(getDoc(doc(unverifiedStaff, "books/draft"))));
  await check("unknown role can't", assertFails(getDoc(doc(stranger, "books/draft"))));
  await check("owner adds staff", assertSucceeds(setDoc(doc(owner, "members/sam@press.test"), { role: "staff", addedBy: "owner@example.com" })));
  await check("owner role adds staff", assertSucceeds(setDoc(doc(ownerRole, "members/lee@press.test"), { role: "staff" })));
  await check("owner reads the Team", assertSucceeds(getDocs(collection(owner, "members"))));
  await check("staff can't read the Team", assertFails(getDocs(collection(staff, "members"))));
  await check("staff can't promote themselves", assertFails(setDoc(doc(staff, "members/sam@press.test"), { role: "owner" })));
  await check("Team role must be known", assertFails(setDoc(doc(owner, "members/x@press.test"), { role: "boss" })));
  await check("Team id is lower case", assertFails(setDoc(doc(owner, "members/X@press.test"), { role: "staff" })));
  await check("no Team entry for the owner address", assertFails(setDoc(doc(owner, "members/owner@example.com"), { role: "staff" })));
  await check("owner removes someone", assertSucceeds(deleteDoc(doc(owner, "members/lee@press.test"))));
  // A fair helper may be added for today only; no other role may carry an end time, and it must be a time.
  await check("owner adds a helper for today", assertSucceeds(setDoc(doc(owner, "members/fay@press.test"), { role: "fairHelper", until: Timestamp.fromDate(new Date(Date.now() + 3600e3)) })));
  await check("only a helper has an end time", assertFails(setDoc(doc(owner, "members/sid@press.test"), { role: "staff", until: Timestamp.fromDate(new Date()) })));
  await check("an end time is a time", assertFails(setDoc(doc(owner, "members/fay@press.test"), { role: "fairHelper", until: "tonight" })));
  await check("staff can't write keys", assertFails(setDoc(doc(staff, "adminSecrets/stripe"), { secretKey: "x" })));
  await check("staff can't read keys", assertFails(getDoc(doc(staff, "adminSecrets/stripe"))));
  await check("staff reads webhook status", assertSucceeds(getDoc(doc(staff, "adminSecrets/stripeWebhookStatus"))));
  await check("owner writes keys", assertSucceeds(setDoc(doc(owner, "adminSecrets/stripe"), { secretKey: "x" })));
  // The author role is for the stockroom only: the owner may give it, but it opens nothing in the shop's admin.
  const author = signedIn("a1", { email: "ana@press.test", email_verified: true, role: "author" });
  await check("owner adds an author", assertSucceeds(setDoc(doc(owner, "members/ana@press.test"), { role: "author" })));
  await check("staff can't add an author", assertFails(setDoc(doc(staff, "members/new@press.test"), { role: "author" })));
  await check("author can't read a draft book", assertFails(getDoc(doc(author, "books/draft"))));
  await check("author can't write a book", assertFails(setDoc(doc(author, "books/pub"), { status: "published", title: "Changed" })));
  await check("author can't read private book fields", assertFails(getDoc(doc(author, "books/pub/private/admin"))));
  await check("author can't read the Team", assertFails(getDocs(collection(author, "members"))));
  await check("author can't promote themselves", assertFails(setDoc(doc(author, "members/ana@press.test"), { role: "owner" })));
  await check("author can't read webhook status", assertFails(getDoc(doc(author, "adminSecrets/stripeWebhookStatus"))));
  // The fair helper role (docs/combined-admin.md › Fair helpers plan) is for the stockroom's Fair till: the owner can
  // add one, and it opens nothing of the shop's.
  const helper = signedIn("h1", { email: "hal@press.test", email_verified: true, role: "fairHelper" });
  await check("owner adds a fair helper", assertSucceeds(setDoc(doc(owner, "members/hal@press.test"), { role: "fairHelper" })));
  await check("fair helper reads no order", assertFails(getDoc(doc(helper, "orders/o1"))));
  await check("fair helper reads no secret keys", assertFails(getDoc(doc(helper, "adminSecrets/stripe"))));
  await check("fair helper reads no customer list", assertFails(getDocs(collection(helper, "customers"))));
  await check("fair helper can't read the Team", assertFails(getDocs(collection(helper, "members"))));
  await check("fair helper can't promote themselves", assertFails(setDoc(doc(helper, "members/hal@press.test"), { role: "staff" })));
  // The bookkeeper role (plan 7.17): reads orders, gift cards and the daily figures; never books, customers, settings,
  // keys or the Team, and never writes anything.
  await env.withSecurityRulesDisabled(async ctx => {
    const db = folder(ctx.firestore());
    await setDoc(doc(db, "orders/BK-1"), { orderId: "BK-1", paymentStatus: "paid", total: 20, tax: 2, customer: { name: "Rae", email: "rae@press.test" }, createdAt: "2026-02-01" });
    await setDoc(doc(db, "giftCards/g1"), { last4: "AB12", balanceMinor: 2500 });
    await setDoc(doc(db, "customers/c1"), { email: "rae@press.test" });
    await setDoc(doc(db, "settings/website"), { storeName: "Press" });
  });
  const bookkeeper = signedIn("k1", { email: "kit@press.test", email_verified: true, role: "bookkeeper" });
  const unverifiedBookkeeper = signedIn("k2", { email: "kit@press.test", email_verified: false, role: "bookkeeper" });
  await check("owner adds a bookkeeper", assertSucceeds(setDoc(doc(owner, "members/kit@press.test"), { role: "bookkeeper" })));
  await check("bookkeeper reads an order", assertSucceeds(getDoc(doc(bookkeeper, "orders/BK-1"))));
  await check("bookkeeper lists orders", assertSucceeds(getDocs(query(collection(bookkeeper, "orders"), orderBy("createdAt", "desc")))));
  await check("bookkeeper reads a gift card balance", assertSucceeds(getDoc(doc(bookkeeper, "giftCards/g1"))));
  await check("bookkeeper reads the daily figures", assertSucceeds(getDoc(doc(bookkeeper, "analytics/seeded"))));
  await check("unverified bookkeeper reads no order", assertFails(getDoc(doc(unverifiedBookkeeper, "orders/BK-1"))));
  await check("bookkeeper can't change an order", assertFails(setDoc(doc(bookkeeper, "orders/BK-1"), { paymentStatus: "refunded" }, { merge: true })));
  await check("bookkeeper can't delete an order", assertFails(deleteDoc(doc(bookkeeper, "orders/BK-1"))));
  // Past orders brought over from the old shop (plan 23.7) are history only: the owner may delete one to undo an import.
  await env.withSecurityRulesDisabled((ctx) => Promise.all([
    setDoc(doc(folder(ctx.firestore()), "orders/PAST-1"), { orderId: "PAST-1", source: "import", paymentStatus: "paid", paidAt: "2025-06-01T00:00:00Z", fulfillmentStatus: "delivered", total: 20 }),
    setDoc(doc(folder(ctx.firestore()), "orders/PAID-1"), { orderId: "PAID-1", paymentStatus: "paid", paidAt: "2025-06-01T00:00:00Z", total: 20 }),
  ]));
  await check("bookkeeper can't delete a brought-over order", assertFails(deleteDoc(doc(bookkeeper, "orders/PAST-1"))));
  await check("owner deletes a brought-over past order", assertSucceeds(deleteDoc(doc(owner, "orders/PAST-1"))));
  await check("owner still can't delete a paid order", assertFails(deleteDoc(doc(owner, "orders/PAID-1"))));
  await check("bookkeeper can't create an order as admin", assertFails(setDoc(doc(bookkeeper, "orders/BK-2"), { orderId: "BK-2", paymentStatus: "paid", total: 1 })));
  await check("bookkeeper reads no draft book", assertFails(getDoc(doc(bookkeeper, "books/draft"))));
  await check("bookkeeper writes no book", assertFails(setDoc(doc(bookkeeper, "books/pub"), { status: "published", title: "Changed" })));
  await check("bookkeeper reads no customer list", assertFails(getDocs(collection(bookkeeper, "customers"))));
  await check("bookkeeper reads no newsletter list", assertFails(getDocs(collection(bookkeeper, "newsletter"))));
  await check("bookkeeper can't change settings", assertFails(setDoc(doc(bookkeeper, "settings/website"), { storeName: "Mine" })));
  await check("bookkeeper reads no keys", assertFails(getDoc(doc(bookkeeper, "adminSecrets/stripe"))));
  await check("bookkeeper reads no Team", assertFails(getDocs(collection(bookkeeper, "members"))));
  await check("bookkeeper can't promote themselves", assertFails(setDoc(doc(bookkeeper, "members/kit@press.test"), { role: "owner" })));
  await check("bookkeeper writes no discount", assertFails(setDoc(doc(bookkeeper, "discounts/x"), { code: "FREE" })));
  await check("bookkeeper writes no audit log", assertFails(setDoc(doc(bookkeeper, "audit-log/x"), { action: "x" })));
  // Platform support ("act as this shop", functions/roles.js supportOf): staff access for an "edit" visit until its time,
  // custom sign-in only. A "view" visit (the default, plan 9.8) reads what staff read and changes nothing.
  const inTen = Math.floor(Date.now() / 1000) + 600;
  const support = signedIn("colophon-support", { firebase: { sign_in_provider: "custom" }, support: { by: "admin@platform.example", reason: "help", until: inTen, mode: "edit" } });
  const viewer = signedIn("colophon-viewer", { firebase: { sign_in_provider: "custom" }, support: { by: "admin@platform.example", reason: "look", until: inTen } });
  const lateSupport = signedIn("colophon-support", { firebase: { sign_in_provider: "custom" }, support: { by: "a", until: inTen - 1200 } });
  const fakeSupport = signedIn("g1", { email: "x@press.test", email_verified: true, firebase: { sign_in_provider: "google.com" }, support: { until: inTen } });
  await check("support reads a draft book", assertSucceeds(getDoc(doc(support, "books/draft"))));
  await check("support can't read the Team", assertFails(getDocs(collection(support, "members"))));
  await check("support can't read keys", assertFails(getDoc(doc(support, "adminSecrets/stripe"))));
  await check("support after its time can't", assertFails(getDoc(doc(lateSupport, "books/draft"))));
  await check("a Google sign-in can't claim support", assertFails(getDoc(doc(fakeSupport, "books/draft"))));
  await check("an edit visit changes a book", assertSucceeds(setDoc(doc(support, "books/draft"), { status: "draft", title: "Unannounced" })));
  await check("a view visit reads a draft book", assertSucceeds(getDoc(doc(viewer, "books/draft"))));
  await check("a view visit reads the audit log", assertSucceeds(getDocs(collection(viewer, "audit-log"))));
  // The audit log is the shop's record of what was done, support visits included (the platform writes each "act as
  // this shop" there before the sign-in exists), so the admin only adds lines (admin/auditLog.ts): never changes or
  // removes one, the record of its own visit least of all.
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(folder(ctx.firestore()), "audit-log/support-visit"), { type: "support", message: "Support visit: help", createdAt: "2026-11-04T08:00:00.000Z" }));
  const auditStaff = signedIn("s1", { email: "sam@press.test", email_verified: true, role: "staff" });
  const auditOwner = signedIn("o1", { email: "owner@example.com", email_verified: true });
  const line = { type: "settings", message: "Updated settings: storeName", createdAt: new Date().toISOString() };
  await check("staff adds an audit line", assertSucceeds(setDoc(doc(collection(auditStaff, "audit-log")), line)));
  await check("an edit visit adds an audit line", assertSucceeds(setDoc(doc(collection(support, "audit-log")), line)));
  await check("an edit visit can't delete the record of its visit", assertFails(deleteDoc(doc(support, "audit-log/support-visit"))));
  await check("an edit visit can't rewrite the record of its visit", assertFails(setDoc(doc(support, "audit-log/support-visit"), { ...line, message: "nothing" })));
  await check("staff can't delete an audit line", assertFails(deleteDoc(doc(auditStaff, "audit-log/support-visit"))));
  await check("owner can't rewrite an audit line", assertFails(setDoc(doc(auditOwner, "audit-log/support-visit"), { ...line, message: "nothing" })));
  await check("an audit line keeps its shape", assertFails(setDoc(doc(collection(auditStaff, "audit-log")), { ...line, by: "someone" })));
  await check("a view visit adds no audit line", assertFails(setDoc(doc(collection(viewer, "audit-log")), line)));
  await check("a view visit can't change a book", assertFails(setDoc(doc(viewer, "books/draft"), { status: "published" })));
  await check("a view visit can't change settings", assertFails(setDoc(doc(viewer, "settings/website"), { storeName: "Mine" })));
  await check("a view visit can't delete a page", assertFails(deleteDoc(doc(viewer, "pages/draft"))));
  await check("a view visit reads no Team", assertFails(getDocs(collection(viewer, "members"))));
  await check("a view visit reads no keys", assertFails(getDoc(doc(viewer, "adminSecrets/stripe"))));
  await check("author can't change settings", assertFails(setDoc(doc(author, "settings/website"), { x: 1 })));
  // URL redirects in numbered pages (plan 5.6): public to read like settings/redirects, written by the admin, pages 1–10.
  const redirectPage = { items: [{ from: "/old", to: "/books/b1" }], page: 1 };
  await check("owner writes redirect page 1", assertSucceeds(setDoc(doc(owner, "redirects/1"), redirectPage)));
  await check("staff writes redirect page 10", assertSucceeds(setDoc(doc(staff, "redirects/10"), redirectPage)));
  await check("owner clears a redirect page", assertSucceeds(deleteDoc(doc(owner, "redirects/10"))));
  await check("no redirect page 11", assertFails(setDoc(doc(owner, "redirects/11"), redirectPage)));
  await check("no made-up redirect page", assertFails(setDoc(doc(owner, "redirects/extra"), redirectPage)));
  await check("anon reads a redirect page", assertSucceeds(getDoc(doc(anon, "redirects/1"))));
  await check("anon lists the redirect pages", assertSucceeds(getDocs(collection(anon, "redirects"))));
  await check("anon reads the old redirects doc", assertSucceeds(getDoc(doc(anon, "settings/redirects"))));
  await check("anon can't write a redirect page", assertFails(setDoc(doc(anon, "redirects/1"), redirectPage)));
  await check("author can't write a redirect page", assertFails(setDoc(doc(author, "redirects/1"), redirectPage)));
  await check("bookkeeper can't write a redirect page", assertFails(setDoc(doc(bookkeeper, "redirects/1"), redirectPage)));
}

// The shop's plan on the platform (plan 6.6, 6.7): platform/plan is the shop's admins' to read, platform/status is
// public, and no browser writes either (the owner included). New orders on a paused plan are refused by the server
// (functions/planPause.test.js): the guest order rule is at the 1000-expression limit and doesn't read the status.
{
  const owner = signedIn("o1", { email: "owner@example.com", email_verified: true });
  const staff = signedIn("s1", { email: "sam@press.test", email_verified: true, role: "staff" });
  const bookkeeper = signedIn("k1", { email: "kit@press.test", email_verified: true, role: "bookkeeper" });
  const reader = signedIn("u1", { email: "reader@example.com", email_verified: true });
  const setStatus = (access) => env.withSecurityRulesDisabled((ctx) => Promise.all([
    setDoc(doc(folder(ctx.firestore()), "platform/status"), { access, updatedAt: "2027-01-01T00:00:00.000Z" }),
    setDoc(doc(folder(ctx.firestore()), "platform/plan"), { state: access === "open" ? "trial" : access, access, hasCard: false, link: "https://platform.example/account/billing?shop=x" }),
  ]));
  await setStatus("paused");
  await check("owner reads the plan", assertSucceeds(getDoc(doc(owner, "platform/plan"))));
  await check("staff reads the plan", assertSucceeds(getDoc(doc(staff, "platform/plan"))));
  await check("bookkeeper can't read the plan", assertFails(getDoc(doc(bookkeeper, "platform/plan"))));
  await check("a shopper can't read the plan", assertFails(getDoc(doc(reader, "platform/plan"))));
  await check("anon can't read the plan", assertFails(getDoc(doc(anon, "platform/plan"))));
  await check("anon reads the shop's status", assertSucceeds(getDoc(doc(anon, "platform/status"))));
  await check("owner can't write the plan", assertFails(setDoc(doc(owner, "platform/plan"), { state: "active", access: "open" })));
  await check("owner can't open the shop's status", assertFails(setDoc(doc(owner, "platform/status"), { access: "open" })));
  await check("owner can't delete the status", assertFails(deleteDoc(doc(owner, "platform/status"))));
  await check("staff can't write the plan", assertFails(setDoc(doc(staff, "platform/plan"), { state: "active" })));
  await check("anon can't write the status", assertFails(setDoc(doc(anon, "platform/status"), { access: "open" })));
  await check("no other platform document", assertFails(setDoc(doc(owner, "platform/other"), { x: 1 })));
  await setStatus("closed");
  await check("anon reads a closed shop's status", assertSucceeds(getDoc(doc(anon, "platform/status"))));
  await check("owner can't reopen a closed shop", assertFails(setDoc(doc(owner, "platform/status"), { access: "open" }, { merge: true })));
  await setStatus("open");
  await check("owner reads an open plan", assertSucceeds(getDoc(doc(owner, "platform/plan"))));
  // The control room's messages (code plan 19.14): the admins' to read, like the plan; nobody else reads or writes them.
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(folder(ctx.firestore()), "platform/messages"), { messages: [{ id: "m1", words: "Hello", level: "info", startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2026-11-09T00:00:00.000Z" }] }));
  await check("owner reads the platform's messages", assertSucceeds(getDoc(doc(owner, "platform/messages"))));
  await check("staff reads the platform's messages", assertSucceeds(getDoc(doc(staff, "platform/messages"))));
  await check("a shopper can't read the platform's messages", assertFails(getDoc(doc(reader, "platform/messages"))));
  await check("anon can't read the platform's messages", assertFails(getDoc(doc(anon, "platform/messages"))));
  await check("owner can't write the platform's messages", assertFails(setDoc(doc(owner, "platform/messages"), { messages: [] })));
  await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(folder(ctx.firestore()), "platform/messages")));
  await env.withSecurityRulesDisabled((ctx) => Promise.all([deleteDoc(doc(folder(ctx.firestore()), "platform/status")), deleteDoc(doc(folder(ctx.firestore()), "platform/plan"))]));
  // Changes asked for by installed apps (functions/appRequests.js): admins read them in Settings › Apps; only the server writes.
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(folder(ctx.firestore()), "appRequests/r1"), { op: "order.dispatch", appName: "Parcel Pal", createdAt: "2026-11-04T15:00:00Z", status: "done" }));
  await check("owner reads app activity", assertSucceeds(getDocs(query(collection(owner, "appRequests"), orderBy("createdAt", "desc")))));
  await check("a shopper can't read app activity", assertFails(getDoc(doc(reader, "appRequests/r1"))));
  await check("anon can't read app activity", assertFails(getDoc(doc(anon, "appRequests/r1"))));
  await check("owner can't write an app request", assertFails(setDoc(doc(owner, "appRequests/r2"), { op: "order.dispatch" })));
  await check("owner can't answer an app request", assertFails(setDoc(doc(owner, "appRequests/r1"), { status: "refused" }, { merge: true })));
}

// Walls between shops (docs/shared-system.md). Shop s2 has its own records; nobody from s1's sign-in list may touch
// them, and nobody from s2's (or from no list at all) may touch s1's, whatever role or address the pass carries.
{
  await env.withSecurityRulesDisabled(ctx => Promise.all([
    setDoc(doc(ctx.firestore(), "shops/s2/books/draft2"), { status: "draft", title: "Their unannounced book" }),
    setDoc(doc(ctx.firestore(), "shops/s2/orders/o2"), { orderId: "o2", paymentStatus: "paid", customer: { email: "reader@example.com" }, total: 9 }),
    setDoc(doc(ctx.firestore(), "shops/s1/orders/o1"), { orderId: "o1", paymentStatus: "paid", customer: { email: "reader@example.com" }, total: 5 }),
  ]));
  const ownerHere = signedIn("o1", { email: "owner@example.com", email_verified: true });
  const ownerThere = signedIn("o9", { email: "owner2@example.com", email_verified: true }, { tenant: "tenant-s2", shop: "s2" });
  // The same people, pointed at the other shop's folder.
  const ownerHereInS2 = signedIn("o1", { email: "owner@example.com", email_verified: true }, { shop: "s2" });
  const ownerThereInS1 = signedIn("o9", { email: "owner2@example.com", email_verified: true }, { tenant: "tenant-s2" });
  const staffThereInS1 = signedIn("s9", { email: "sam@press.test", email_verified: true, role: "staff" }, { tenant: "tenant-s2" });
  const ownerRoleThereInS1 = signedIn("s8", { email: "x@press.test", email_verified: true, role: "owner" }, { tenant: "tenant-s2" });
  const noTenantOwner = signedIn("o7", { email: "owner@example.com", email_verified: true }, { tenant: "" });
  const customerThere = signedIn("u9", { email: "reader@example.com", email_verified: true }, { tenant: "tenant-s2" });
  const supportThere = signedIn("colophon-support", { firebase: { sign_in_provider: "custom" }, support: { by: "a", until: Math.floor(Date.now() / 1000) + 600, mode: "edit" } }, { tenant: "tenant-s2" });

  await check("owner reads their own shop's orders (control)", assertSucceeds(getDoc(doc(ownerHere, "orders/o1"))));
  await check("owner of the other shop reads their own orders (control)", assertSucceeds(getDoc(doc(ownerThere, "orders/o2"))));
  await check("owner can't read another shop's order", assertFails(getDoc(doc(ownerHereInS2, "orders/o2"))));
  await check("owner can't read another shop's draft book", assertFails(getDoc(doc(ownerHereInS2, "books/draft2"))));
  await check("owner can't write another shop's settings", assertFails(setDoc(doc(ownerHereInS2, "settings/website"), { info: { name: "Mine now" } })));
  await check("owner can't write another shop's QR codes", assertFails(setDoc(doc(ownerHereInS2, "adminPrefs/qrCodes"), { data: "[]", updatedAt: Date.now() })));
  await check("owner can't write another shop's sheet switch", assertFails(setDoc(doc(ownerHereInS2, "adminPrefs/sheets"), { data: "{}", updatedAt: Date.now() })));
  await check("owner can't list another shop's orders", assertFails(getDocs(collection(ownerHereInS2, "orders"))));
  await check("the other shop's owner can't read this shop's orders", assertFails(getDoc(doc(ownerThereInS1, "orders/o1"))));
  await check("the other shop's staff can't write this shop's books", assertFails(setDoc(doc(staffThereInS1, "books/new"), { status: "draft", title: "x" })));
  await check("an owner role from another shop opens nothing here", assertFails(getDoc(doc(ownerRoleThereInS1, "members/sam@press.test"))));
  await check("the owner's own address from no shop's sign-in list opens nothing", assertFails(getDoc(doc(noTenantOwner, "orders/o1"))));
  await check("a customer of another shop can't read this shop's orders by email", assertFails(getDocs(query(collection(customerThere.firestore, "shops/s1/orders"), where("customer.email", "==", "reader@example.com")))));
  await check("a support visit to another shop opens nothing here", assertFails(getDoc(doc(supportThere, "orders/o1"))));
  await check("nobody reads a shop's record", assertFails(getDoc(doc(ownerHere.firestore, "shops/s1"))));
  await check("nobody writes a shop's record", assertFails(setDoc(doc(ownerHere.firestore, "shops/s1"), { tenant: "tenant-s2" })));
  await check("nothing outside the shop folders", assertFails(setDoc(doc(ownerHere.firestore, "books/root"), { status: "published", title: "x" })));
  await check("anon still reads another shop's published book only", assertFails(getDoc(doc(anon.firestore, "shops/s2/books/draft2"))));
}

await env.cleanup();
console.log(failures ? `${failures} FAILED` : "ALL OK");
process.exit(failures ? 1 : 0);
