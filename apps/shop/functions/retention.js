// Keep-times for the shop's own records (platform plan 13.8, written down in the platform's docs/keep-times.md). The
// admin history (`audit-log`: who changed what, with the time) is kept two years and then deleted, a small batch at a
// time by the hourly bag sweep (scheduledJobs.js). Orders, customers and anything a tax office can ask for are NEVER
// deleted here: nothing in this file names them (retention.test.js checks).
//
// Abandoned bags have their own 30 days (cartCleanup.js) and the server's bookkeeping documents their own TTL
// (`expiresAt`, firestore.indexes.json).
const DAY = 24 * 60 * 60 * 1000;
const AUDIT_LOG_KEEP_DAYS = 730;
const RETENTION_BATCH = 300;

/** Deletes admin history older than two years, newest-first never: oldest first, one batch per call. Returns the count. */
async function pruneOldAuditLog(db, now = Date.now()) {
  const before = new Date(now - AUDIT_LOG_KEEP_DAYS * DAY).toISOString();
  const snap = await db.collection("audit-log").where("createdAt", "<", before).orderBy("createdAt", "asc").limit(RETENTION_BATCH).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

module.exports = { pruneOldAuditLog, AUDIT_LOG_KEEP_DAYS, RETENTION_BATCH };
