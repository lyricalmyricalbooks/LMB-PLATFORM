// One-time migration (#18): move each book's private fields off the publicly readable `books/{id}` document and into
// the admin-only `books/{id}/private/admin` document, and stamp `status: "published"` on books saved before statuses
// existed (the new rule only serves books whose status is "published"; the storefront already treated a missing
// status as published, so nothing changes for shoppers).
//
//   DRY RUN (default, writes nothing):
//     GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/migrate-book-private-fields.mjs
//   APPLY:
//     GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/migrate-book-private-fields.mjs --apply
//   Optional: --project <id> (default: the project in .firebaserc / GCLOUD_PROJECT)
//
// Safe to run more than once: a book with nothing left to move is skipped. Run it BEFORE deploying the stricter
// firestore.rules. The same field list lives in src/app/admin/bookPrivate.ts (scripts/migrateBookPrivate.test.ts
// keeps the two identical).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PRIVATE_BOOK_KEYS = ["costPrice", "usdCostPrice", "eurCostPrice", "shelfLocation", "legacyInventoryKey", "digitalFileUrl", "digitalFilePath"];

/**
 * What to do with one book record. Pure.
 * Returns { priv, removeKeys, variants, status, changed }:
 *  - priv: the fields for books/{id}/private/admin (never overwrites a value already there: see `existing`)
 *  - removeKeys: top-level keys to delete from the public document
 *  - variants: the public editions without shelfLocation, or null when none carried one
 *  - status: "published" when the record has none, else null
 */
export function planBookMigration(data, existing = null) {
  const priv = {};
  const removeKeys = [];
  for (const key of PRIVATE_BOOK_KEYS) {
    if (!(key in data)) continue;
    removeKeys.push(key);
    // A value already saved privately (the admin editor wrote it after the code change) wins over the old public one.
    if (data[key] !== undefined && !(existing && existing[key] !== undefined)) priv[key] = data[key];
  }
  let variants = null;
  if (Array.isArray(data.variants) && data.variants.some(v => v && typeof v === "object" && "shelfLocation" in v)) {
    const shelf = {};
    variants = data.variants.map(v => {
      if (!v || typeof v !== "object") return v;
      const { shelfLocation, ...rest } = v;
      if (v.id && typeof shelfLocation === "string" && shelfLocation.trim()) shelf[v.id] = shelfLocation.trim();
      return rest;
    });
    // Keep a shelf code already saved privately for the same edition.
    const kept = existing?.variantShelf && typeof existing.variantShelf === "object" ? existing.variantShelf : {};
    if (Object.keys(shelf).length || Object.keys(kept).length) priv.variantShelf = { ...shelf, ...kept };
  }
  const status = data.status === undefined || data.status === null || data.status === "" ? "published" : null;
  return { priv, removeKeys, variants, status, changed: removeKeys.length > 0 || variants !== null || status !== null };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const projectFlag = process.argv.indexOf("--project");
  const require = createRequire(new URL("../functions/package.json", import.meta.url));
  const admin = require("./adminSdk.js")(require("firebase-admin"));
  const firebaserc = (() => { try { return JSON.parse(readFileSync(new URL("../.firebaserc", import.meta.url), "utf8")); } catch { return {}; } })();
  const projectId = (projectFlag > -1 && process.argv[projectFlag + 1]) || process.env.GCLOUD_PROJECT || firebaserc?.projects?.default;
  if (!projectId) throw new Error("No project id: pass --project <id>.");
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
  const db = admin.firestore();
  const { FieldValue } = admin.firestore;

  console.log(`${apply ? "APPLYING to" : "DRY RUN against"} project ${projectId}`);
  const books = await db.collection("books").get();
  const privateDocs = await db.collectionGroup("private").get();
  const privateByBook = new Map(privateDocs.docs.filter(d => d.id === "admin").map(d => [d.ref.parent.parent.id, d.data()]));

  const work = [];
  for (const doc of books.docs) {
    const plan = planBookMigration(doc.data(), privateByBook.get(doc.id) || null);
    if (plan.changed) work.push({ doc, plan });
  }
  console.log(`${books.size} books, ${work.length} need changes.`);
  for (const { doc, plan } of work) {
    const bits = [
      plan.removeKeys.length ? `move ${plan.removeKeys.join(", ")}` : "",
      plan.variants ? "move edition shelf codes" : "",
      plan.status ? `set status "${plan.status}"` : "",
    ].filter(Boolean);
    console.log(` - ${doc.id} (${doc.data().title || "untitled"}): ${bits.join("; ")}`);
  }
  if (!apply) { console.log("\nNothing was written. Re-run with --apply to make these changes."); return; }

  let done = 0;
  for (let i = 0; i < work.length; i += 200) {
    const batch = db.batch();
    for (const { doc, plan } of work.slice(i, i + 200)) {
      if (Object.keys(plan.priv).length) {
        batch.set(doc.ref.collection("private").doc("admin"), { ...plan.priv, migratedAt: new Date().toISOString() }, { merge: true });
      }
      const update = {};
      for (const key of plan.removeKeys) update[key] = FieldValue.delete();
      if (plan.variants) update.variants = plan.variants;
      if (plan.status) update.status = plan.status;
      if (Object.keys(update).length) batch.update(doc.ref, update);
    }
    await batch.commit();
    done += Math.min(200, work.length - i);
    console.log(`  committed ${done}/${work.length}`);
  }

  // Verify: no private field is left on a public document, and every book has a status.
  const after = await db.collection("books").get();
  const leftover = after.docs.filter(d => planBookMigration(d.data(), {}).changed);
  if (leftover.length) { console.error(`\n${leftover.length} books still need changes: ${leftover.map(d => d.id).join(", ")}`); process.exitCode = 1; }
  else console.log("\nDone. Every book is migrated; it is now safe to deploy the stricter firestore.rules.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(1); });
}
