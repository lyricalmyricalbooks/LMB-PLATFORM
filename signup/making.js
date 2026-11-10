// "Setting up your store…" (design handoff "Colophon platform", sign-up overlay): the shop maker's progress for one
// press (frontDoor.js `making`: { status, done, total, now, message, canRetry }) as three rows the person can follow,
// a bar and what the page should offer. Pure, so the front door (join/app.js) and its tests share it.
//
// The shop maker's steps run in order (setup/steps.js STEP_WORDS), so how many are done says how far it has got: the
// pages are online after step 9, the shop is checked after step 15, and the stockroom is linked last.
export const MAKING_ROWS = Object.freeze([
  Object.freeze({ id: "address", label: "Your web address", doneAt: 9 }),
  Object.freeze({ id: "store", label: "Your store", doneAt: 15 }),
  Object.freeze({ id: "stockroom", label: "Your stockroom", doneAt: Infinity }),
]);

export const ROW_WORDS = Object.freeze({ done: "Done", working: "Working…", waiting: "Waiting" });

/**
 * What the overlay shows for a press: `rows` [{ id, label, state }], `percent` (0–100), `phase` ("ready", "making",
 * "queued": waiting for its turn, "stuck": stopped with a message) and `message` (plain words, or "").
 */
export function makingView(press) {
  const making = press?.making ?? null;
  const ready = press?.status === "open" || making?.status === "ready";
  const done = ready ? Infinity : Math.max(0, Number(making?.done) || 0);
  const total = Math.max(1, Number(making?.total) || 20);
  const status = making?.status ?? press?.shopStatus ?? "queued";
  const moving = status === "making";
  let working = false;
  const rows = MAKING_ROWS.map((row) => {
    let state = "waiting";
    if (ready || done >= row.doneAt) state = "done";
    else if (moving && !working) { state = "working"; working = true; }
    return { id: row.id, label: row.label, state };
  });
  const phase = ready ? "ready" : status === "waiting" || status === "needs-help" ? "stuck" : moving ? "making" : "queued";
  const message = ready ? "" : making?.message || press?.shopMessage || "";
  const percent = ready ? 100 : Math.min(96, Math.max(4, Math.round((Math.min(done, total) / total) * 100)));
  return { rows, percent, phase, message, canRetry: !ready && !!making?.canRetry, openUrl: ready ? press?.openUrl ?? "" : "" };
}
