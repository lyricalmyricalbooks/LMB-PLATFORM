// Get started nudges (code plan 17.14; one a day since the sign-up to open shop plan, move 5, 25 November 2026): while a
// press's shop isn't open, at most one email a day naming the one next step on Home's list ("One step from open: add
// your first book"). Pure: which stage is next (the order and "done" rules of apps/shop/src/app/admin/startRun.ts), and
// whether a nudge is due today. Day 0 is the welcome email (setup step 14), so nudges start on day 1 and stop on day
// 10, before the trial's last days, which belong to the billing emails.
// The daily sweep (index.js) sends these when the platform setting START_NUDGES is `instead` (the default since move 5:
// in place of that day's setup tip, so a press never gets two emails in a day) or `beside`; `hold` sends none.
//
// A nudge is sent at most once per stage (`record.startNudges[stage]`), so a press that finishes a stage is never nudged
// about it again, and a press that is stuck on one stage hears about it once.

import { sellsServices } from "../../shared/sells/sells.js";

/** The days a nudge may go out on: from the day after sign-up to day 10 (from day 11 the billing emails speak). */
export const START_NUDGE_FIRST_DAY = 1;
export const START_NUDGE_LAST_DAY = 10;

/** A services shop that sells no products has no shipping stage (servicesSetup.ts servicesOnly). */
const servicesOnly = (d) => sellsServices(d?.sells || d?.publishes || null) && d?.sellsProducts !== true;

/**
 * The run's stages in order, with the marker on firstWeek/start that says each one is done or skipped. `platform` stages
 * only exist for a press whose cards go through the platform (plan 17.10). Keep in step with startRun.ts.
 */
export const START_STAGES = Object.freeze([
  { id: "look", done: (d) => !!d.welcome },
  { id: "bring", done: (d) => !!d.bring, products: true },
  { id: "services", done: (d) => !!d.bring, services: true },
  { id: "payments", done: (d) => !!d.payments, platform: true },
  { id: "details", done: (d) => !!d.details },
  { id: "shipping", done: (d) => !!d.shipping, products: true },
  { id: "final", done: (d) => !!d.finalCheck },
]);

/**
 * The words of each stage's nudge, in the same shape as the setup tips (index.js TIPS): the step (the subject reads
 * "One step from open: <step>"), paragraphs, a button. Every button opens Home, where the list holds the step.
 */
export const START_NUDGE_WORDS = Object.freeze({
  look: { subject: "Keep your starting look, or pick another", paragraphs: ["Your shop already wears the look you saw when you signed up. Keep it with one press, or try another.", "You can make it yours in Design at any time, before or after you open."], action: "Open Home", hash: "overview" },
  bring: { subject: "Add your first book", paragraphs: ["A photo, a title and a price are enough to start. If you sell somewhere else now, bring your books over from a file instead.", "The sample books in your shop step aside when yours arrive."], action: "Open Home", hash: "overview" },
  services: { subject: "Add your first service", paragraphs: ["Name it, say how long it takes and what it costs. Clients book it straight from your website.", "You can add more services and change your hours at any time."], action: "Open Home", hash: "overview" },
  payments: { subject: "Set up getting paid", paragraphs: ["Tell the card company where to send your money. Their own secure page asks for your bank details, and you come straight back.", "Sales go straight to your bank, and Colophon never holds your money."], action: "Open Home", hash: "overview" },
  details: { subject: "Check your contact details and policies", paragraphs: ["Your email and address go on your receipts, labels and contact page.", "Your shop's policy pages come filled in with them, so you only read them over."], action: "Open Home", hash: "overview" },
  shipping: { subject: "Check your shipping prices", paragraphs: ["Shoppers see the price of delivery before they pay. We started you with prices for your country.", "Change anything you like, then press Continue."], action: "Open Home", hash: "overview" },
  final: { subject: "Open your shop", paragraphs: ["Your shop stays private until you open it. The last check names anything still missing, in plain words.", "When everything is set, press Open my shop."], action: "Open Home", hash: "overview" },
});

/** The stages still to do for this press, in order: empty when the run is finished, not in use, or a stockroom-only plan. */
export function stagesLeft(doc, { platformCards = false, open = false } = {}) {
  if (!doc || doc.plan === "stockroom" || open) return [];
  // Older shops chose a look before the run existed (no `firstRun`, nothing else done): they never had a run.
  if (doc.welcome && !doc.welcome.firstRun && !doc.details && !doc.bring) return [];
  const services = servicesOnly(doc);
  return START_STAGES.filter((stage) => {
    if (stage.platform && !platformCards) return false;
    if (stage.products && services) return false;
    if (stage.services && !services) return false;
    return !stage.done(doc);
  }).map((stage) => stage.id);
}

/** The first stage of the run that is not done yet, or null. */
export function nextStartStage(doc, opts = {}) {
  return stagesLeft(doc, opts)[0] ?? null;
}

/** The email's subject: how close the press is, and the one next step. */
export function nudgeSubject(step, left) {
  const next = step[0].toLowerCase() + step.slice(1);
  return left <= 1 ? `One step from open: ${next}` : `${left} steps from open. Next: ${next}`;
}

/** Today, when it is a day a nudge may go out on; null otherwise. */
export function nudgeDayOf(day) {
  if (day === null || day === undefined) return null;
  return day >= START_NUDGE_FIRST_DAY && day <= START_NUDGE_LAST_DAY ? day : null;
}

/**
 * Whether a nudge is due today, and for which stage. `record` is the sweep's own row for the shop (`startNudges`, `off`).
 * Returns { nudge: { day, stage, left } } (`left`: stages still to do, this one included) or { nudge: null, why }.
 */
export function startNudgeDue({ day, doc, platformCards = false, open = false, record }) {
  if (record?.off) return { nudge: null, why: "tips-off" };
  const nudgeDay = nudgeDayOf(day);
  if (nudgeDay === null) return { nudge: null, why: "not-a-nudge-day" };
  const left = stagesLeft(doc, { platformCards, open });
  if (!left.length) return { nudge: null, why: "nothing-to-nudge" };
  const stage = left[0];
  if (record?.startNudges?.[stage]) return { nudge: null, why: "already-sent" };
  // One a day at most: a press that finishes a stage after today's nudge hears about the next one tomorrow.
  if (Object.values(record?.startNudges ?? {}).some((sent) => sent?.day === nudgeDay)) return { nudge: null, why: "already-sent" };
  return { nudge: { day: nudgeDay, stage, left: left.length }, why: "due" };
}
