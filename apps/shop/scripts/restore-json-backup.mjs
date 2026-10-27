// Restore Firestore documents from a nightly document-copy backup (functions/backupJson.js), the copy that works
// even when the managed Firestore export is refused. The backup lives in the Storage bucket at
// backups/YYYY-MM-DD/json/ (one <collection>.ndjson.gz per collection plus manifest.json). Download that folder
// (Firebase console › Storage, or `gsutil -m cp -r gs://<bucket>/backups/<day>/json ./restore`) and run:
//
//   DRY RUN (default, writes nothing):
//     GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/restore-json-backup.mjs ./restore
//   APPLY (overwrites each listed document with its backed-up contents; other documents are left alone):
//     GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/restore-json-backup.mjs ./restore --apply
//   Optional: --only books,orders   (collection ids; "group:private" for book private fields)
//             --project <id>        (default: the project in .firebaserc / GCLOUD_PROJECT)
//
// The file downloaded from Settings › General › Backups & export (lyricalmyrical-backup-YYYY-MM-DD.json) works too:
//     node scripts/restore-json-backup.mjs ./lyricalmyrical-backup-2026-10-11.json   (then --apply)
// With a downloaded file, --only takes collection names (e.g. books,orders).
//
// A managed export (backups/YYYY-MM-DD/export) is restored with `gcloud firestore import` instead.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";

const args = process.argv.slice(2);
const folder = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--only" && args[args.indexOf(a) - 1] !== "--project");
if (!folder) { console.error("Usage: node scripts/restore-json-backup.mjs <downloaded json folder> [--apply] [--only a,b] [--project id]"); process.exit(1); }
const apply = args.includes("--apply");
const flag = name => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : ""; };
const only = flag("--only") ? flag("--only").split(",").map(s => s.trim()).filter(Boolean) : null;

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("./adminSdk.js")(require("firebase-admin"));
const { decodeValue, BACKUP_FORMAT } = require("./backupJson.js");
let firebaserc = null;
try { firebaserc = JSON.parse(readFileSync(new URL("../.firebaserc", import.meta.url), "utf8")); } catch { /* optional */ }
const projectId = flag("--project") || process.env.GCLOUD_PROJECT || firebaserc?.projects?.default;
if (!projectId) throw new Error("No project id: pass --project <id>.");
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
const db = admin.firestore();
const types = { Timestamp: admin.firestore.Timestamp, GeoPoint: admin.firestore.GeoPoint, ref: p => db.doc(p) };

async function writeRows(rows) {
  for (let i = 0; i < rows.length; i += 400) {
    const batch = db.batch();
    for (const row of rows.slice(i, i + 400)) batch.set(db.doc(row.path), decodeValue(row.data, types));
    await batch.commit();
  }
}

// Restored orders carry their own Stripe check times, but the payment sweep keeps its schedule in
// systemStatus/stripeReversalChecks (functions/reversalSchedule.js). Forgetting it makes the next sweep
// re-read every paid order and re-check the restored ones with Stripe straight away.
async function forgetReversalSchedule() {
  await db.doc("systemStatus/stripeReversalChecks").delete();
  console.log("Cleared systemStatus/stripeReversalChecks: the next payment sweep re-checks the restored orders with Stripe.");
}

// One downloaded file: { format, createdAt, complete, documents: [{ path, data }] }.
if (folder.endsWith(".json")) {
  const file = JSON.parse(readFileSync(folder, "utf8"));
  if (file.format !== BACKUP_FORMAT) throw new Error(`Unknown backup format: ${file.format}`);
  if (!file.complete) console.warn("Warning: this backup is marked incomplete.");
  const rows = file.documents.filter(row => !only || only.includes(row.path.split("/")[0]));
  console.log(`${apply ? "RESTORING into" : "DRY RUN against"} project ${projectId} from a backup made ${file.createdAt}: ${rows.length} document(s)`);
  if (apply) await writeRows(rows);
  if (apply && rows.some(row => row.path.split("/")[0] === "orders")) await forgetReversalSchedule();
  console.log(apply ? `Restored ${rows.length} document(s).` : "Re-run with --apply to write them.");
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(path.join(folder, "manifest.json"), "utf8"));
if (manifest.format !== BACKUP_FORMAT) throw new Error(`Unknown backup format: ${manifest.format}`);
if (!manifest.complete) console.warn("Warning: this backup is marked incomplete. Collections not copied:", manifest.collections.filter(c => !c.complete).map(c => c.id).join(", "));
console.log(`${apply ? "RESTORING into" : "DRY RUN against"} project ${projectId} from a backup made ${manifest.createdAt}`);

let total = 0, restoredOrders = false;
for (const part of manifest.collections) {
  if (only && !only.includes(part.id)) continue;
  if (!part.documents) continue;
  const file = path.join(folder, path.basename(part.file));
  const rows = gunzipSync(readFileSync(file)).toString("utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  console.log(`  ${part.id}: ${rows.length} document(s)${part.complete ? "" : " (incomplete copy)"}`);
  total += rows.length;
  if (apply) await writeRows(rows);
  if (part.id === "orders" && rows.length) restoredOrders = true;
}
// After every collection, so a restored copy of the record itself doesn't come back.
if (apply && restoredOrders) await forgetReversalSchedule();
console.log(apply ? `Restored ${total} document(s).` : `Would restore ${total} document(s). Re-run with --apply to write them.`);
