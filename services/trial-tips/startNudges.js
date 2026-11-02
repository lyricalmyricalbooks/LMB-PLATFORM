// Get started nudges (code plan 17.14): a reminder on days 2 and 4 for a press whose Get started run isn't finished, each
// pointing at the next stage. Pure: which stage is next (the order and "done" rules of apps/shop/src/app/admin/startRun.ts),
// and whether a nudge is due today. Day 0 is the welcome email (setup step 14), so it is not repeated here.
// Not wired into the daily sweep yet: how these sit with the setup tips (index.js) is Julian's choice (decision card).
//
// A nudge is sent at most once per stage (`record.startNudges[stage]`), so a press that finishes a stage is never nudged
// about it again, and a press that is stuck on one stage hears about it twice at most. A missed run may send the day after.

export const START_NUDGE_DAYS = Object.freeze([2, 4]);

/**
 * The run's stages in order, with the marker on firstWeek/start that says each one is done or skipped. `platform` stages
 * only exist for a press whose cards go through the platform (plan 17.10). Keep in step with startRun.ts.
 */
export const START_STAGES = Object.freeze([
  { id: "details", done: (d) => !!d.details },
  { id: "bring", done: (d) => !!d.bring },
  { id: "look", done: (d) => !!d.welcome },
  { id: "google", done: (d) => !!d.google },
  { id: "payments", done: (d) => !!d.payments, platform: true },
  { id: "shipping", done: (d) => !!d.shipping },
  { id: "final", done: (d) => !!d.finalCheck },
]);

/** The first stage of the run that is not done yet, or null when the run is finished, not in use, or a stockroom-only plan. */
export function nextStartStage(doc, { platformCards = false, open = false } = {}) {
  if (!doc || doc.plan === "stockroom" || open) return null;
  // Older shops (no details) never had a run, so they hear nothing about it.
  if (!doc.details) return null;
  for (const stage of START_STAGES) {
    if (stage.platform && !platformCards) continue;
    if (!stage.done(doc)) return stage.id;
  }
  return null;
}

/** The nudge day that today falls in: day 2 or 4, and the day after either if the run was missed. Null otherwise. */
export function nudgeDayOf(day) {
  if (day === null || day === undefined) return null;
  const hit = START_NUDGE_DAYS.filter((d) => day >= d && day <= d + 1);
  return hit.length ? hit[hit.length - 1] : null;
}

/**
 * Whether a nudge is due today, and for which stage. `record` is the sweep's own row for the shop (`startNudges`, `off`).
 * Returns { nudge: { day, stage } } or { nudge: null, why }.
 */
export function startNudgeDue({ day, doc, platformCards = false, open = false, record }) {
  if (record?.off) return { nudge: null, why: "tips-off" };
  const nudgeDay = nudgeDayOf(day);
  if (nudgeDay === null) return { nudge: null, why: "not-a-nudge-day" };
  const stage = nextStartStage(doc, { platformCards, open });
  if (!stage) return { nudge: null, why: "nothing-to-nudge" };
  if (record?.startNudges?.[stage]) return { nudge: null, why: "already-sent" };
  return { nudge: { day: nudgeDay, stage }, why: "due" };
}
