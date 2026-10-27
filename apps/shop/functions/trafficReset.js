// Overview › "Start traffic counts again" (createStripeCheckoutSession `action: "resetTraffic"`, admin only).
// Deletes the shop's own daily traffic counters (`analytics/<date>`: visits, funnel, sources, devices, book and
// category views, searches) so counting starts fresh — e.g. after launch, to drop test traffic. Orders, revenue,
// customers and Google Analytics are never touched. Records when it happened in admin-read systemStatus/trafficReset.
const CONFIRM_WORD = "RESET";
const BATCH = 400;

/** Pure: whether the request carries the typed confirmation. */
const resetConfirmed = body => String(body?.confirm || "").trim().toUpperCase() === CONFIRM_WORD;

/** Deletes every analytics doc in batches; returns how many daily records were removed. */
async function deleteTrafficDocs(db) {
  let removed = 0;
  for (;;) {
    const snap = await db.collection("analytics").limit(BATCH).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < BATCH) break;
  }
  return removed;
}

async function handleTrafficReset(body, { db, by, now = () => new Date().toISOString() }) {
  if (!resetConfirmed(body)) return { status: 400, body: { error: `Type ${CONFIRM_WORD} to confirm.` } };
  const removed = await deleteTrafficDocs(db);
  const at = now();
  await db.collection("systemStatus").doc("trafficReset").set({ at, by: by || "", removedDays: removed });
  return { status: 200, body: { ok: true, at, removedDays: removed } };
}

module.exports = { CONFIRM_WORD, resetConfirmed, deleteTrafficDocs, handleTrafficReset };
