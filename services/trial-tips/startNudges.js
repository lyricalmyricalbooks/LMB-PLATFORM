// Get started nudges (code plan 17.14): a reminder on days 2 and 4 for a press whose Get started run isn't finished, each
// pointing at the next stage. Pure: which stage is next (the order and "done" rules of apps/shop/src/app/admin/startRun.ts),
// and whether a nudge is due today. Day 0 is the welcome email (setup step 14), so it is not repeated here.
// The daily sweep (index.js) sends these only when the platform setting START_NUDGES is `beside` (sent with the setup tips)
// or `instead` (sent in place of that day's setup tip). The default, `hold`, sends none, until Julian chooses.
//
// A nudge is sent at most once per stage (`record.startNudges[stage]`), so a press that finishes a stage is never nudged
// about it again, and a press that is stuck on one stage hears about it twice at most. A missed run may send the day after, and a nudge day sends one nudge at most.

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

/** The words of each stage's nudge, in the same shape as the setup tips (index.js TIPS): a subject, paragraphs, a button. */
export const START_NUDGE_WORDS = Object.freeze({
  details: { subject: "Start with your press's details", paragraphs: ["Your press's name, contact email and address go on your receipts, labels and contact page.", "Open the Overview and fill in step 1, Your press. It takes a few minutes."], action: "Open the Overview", hash: "overview" },
  bring: { subject: "Bring your books over, or add them by hand", paragraphs: ["If you sell somewhere else now, export your products as a file and choose it in Books › Import spreadsheet.", "Or skip this step and add your first book by hand. You can come back to it at any time."], action: "Open Books", hash: "catalog" },
  look: { subject: "Pick the look for your shop", paragraphs: ["Choose a look and see it on a phone before you publish, so shoppers see something you're happy with.", "Your changes stay a draft until you publish them."], action: "Open Design", hash: "designer" },
  google: { subject: "Connect Google when it's ready", paragraphs: ["Connecting Google links the search and shopping tools your shop uses. Google is still approving the sign-in, so you can carry on without it.", "The step tells you when it's ready."], action: "Open the Overview", hash: "overview" },
  payments: { subject: "Get paid before your first sale", paragraphs: ["Tell the card company where to send your money. Their own secure page asks for your bank details, and you come straight back.", "Sales go straight to your bank, and Colophon never holds your money."], action: "Open Payments", hash: "settings/payments" },
  shipping: { subject: "Set your shipping prices", paragraphs: ["Shoppers see the price of delivery before they pay. Add the places you send to and a price for each.", "You can add free shipping over an amount at any time."], action: "Open Shipping", hash: "settings/shipping" },
  final: { subject: "Finish the final check and open your shop", paragraphs: ["Your shop stays private until you open it. The final check names anything still missing, in plain words.", "When everything is set, press Open your shop."], action: "Open the Overview", hash: "overview" },
});

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
  // One nudge per nudge day: the day after is only for a run that missed the day itself, never a second nudge.
  if (Object.values(record?.startNudges ?? {}).some((sent) => sent?.day === nudgeDay)) return { nudge: null, why: "already-sent" };
  return { nudge: { day: nudgeDay, stage }, why: "due" };
}
