// One timeline per shop (code plan 19.10): everything the platform already records about one shop, merged newest first,
// each entry in one plain line. Nothing new is recorded here; it only reads.
//
//   shopTimeline({ shopId, registry, auditLog?, activity, supportStore?, releases?, emailLog?, shopData?, limit, before?, kinds? })
//     -> { entries: [{ at, kind, words, by? }], next }
//
// The sources:
//   registry      readEvents(shopId): every `recordEvent` entry (billing, payments, fee, switches, closures, act-as,
//                 health, backups, repairs, email…); readReleaseChecks(shopId): the release checks; listReleases():
//                 the release runs, of which the lines naming this shop are kept
//   activity      the control room's activity log (activity.js): list({ shopId, limit }). A control-room action is
//                 written to the registry too (controlRoom.js `log`), so a registry entry the activity log already
//                 has (same time, same action) is shown once
//   supportStore  optional: listByShop(shopId), the shop's support requests (services/support)
//   emailLog      optional: listForShop(shopId), the platform's own emails about the shop (the email service's sent log,
//                 entries marked `platform`; a shop's emails to its shoppers are never read)
//   releases      optional: () -> release runs, in place of registry.listReleases
//   shopData      optional: find(shopId, "audit-log", { where }), the shop's own audit log in its own database. Only its
//                 "security" lines are read (two-step sign-in turned on or off, backup codes made or used), for a live
//                 shop; a shop that can't be read leaves the rest of the timeline
//   auditLog      optional: list(shopId) -> the shop's own audit log. It repeats the registry's events, so only its
//                 release lines are read, and only when no release runs can be read
//
// Paging: `before` is the `next` of the page before (or any time), and the page holds entries older than it.
import { ControlError, adminOf } from "./controlRoom.js";

export const TIMELINE_KINDS = Object.freeze(["billing", "release", "health", "support", "switch", "visit", "email", "security", "other"]);
export const MAX_LIMIT = 500;

const plain = (value) => String(value ?? "").replace(/[-_.]+/g, " ").trim();
const cut = (value, max = 200) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const why = (reason) => (reason ? ` (${cut(reason, 160)})` : "");

const BILLING_SOURCES = new Set(["billing", "billing-door", "closing", "payment-service", "accounting-service"]);
const EMAIL_SOURCES = new Set(["email", "email-service"]);
const HEALTH_KINDS = new Set(["health", "backup", "restore-drill", "spending"]);

/** A control-room action (the registry's copy or the activity log's) in plain words, with its kind. */
function controlAction(what, d = {}) {
  switch (what) {
    case "switch-set": return { kind: "switch", words: `Turned ${d.switch ?? "a switch"} ${d.to ? "on" : "off"}${why(d.reason)}` };
    case "act-as": return { kind: "visit", words: `Opened the shop's admin as support, ${d.mode === "edit" ? "able to make changes" : "looking only"}${why(d.reason)}` };
    case "fee-change-scheduled": return { kind: "billing", words: `Changed the fee on each order to ${(d.to?.basisPoints ?? 0) / 100}%, starting ${String(d.startsAt ?? "").slice(0, 10)}${why(d.reason)}` };
    case "fee-change-cancelled": return { kind: "billing", words: `Cancelled a waiting fee change${why(d.reason)}` };
    case "payments-moved": return { kind: "billing", words: `Moved card payments to ${d.to === "own" ? "the press's own Stripe account" : d.to === "square" ? "Square" : "the platform"}${why(d.reason)}` };
    case "shop-closed": return { kind: "other", words: `Closed the shop${why(d.reason)}` };
    case "shop-reopened": return { kind: "other", words: `Opened the shop again${why(d.reason)}` };
    case "newsletter-resumed": return { kind: "email", words: `Turned the newsletter back on${why(d.reason)}` };
    case "test-shop-reset": return { kind: "other", words: "Reset the test shop's sample books" };
    case "google-run-again": return { kind: "other", words: `Ran the Google step "${d.step ?? "?"}" again` };
    case "note-added": return { kind: "other", words: "Added a private note" };
    case "note-deleted": return { kind: "other", words: `Deleted a private note${why(d.reason)}` };
    case "tags-set": return { kind: "other", words: `Set the tags to ${(d.tags ?? []).join(", ") || "none"}${why(d.reason)}` };
    case "today-snoozed": return { kind: "other", words: `Snoozed a line on Today for ${d.days ?? "?"} days` };
    case "today-woken": return { kind: "other", words: "Put a line back on Today" };
    case "drift-snoozed": return { kind: "other", words: `Snoozed the drift warning for ${d.days ?? "?"} days${why(d.reason)}` };
    case "drift-woken": return { kind: "other", words: `Ended the drift warning's snooze${why(d.reason)}` };
    case "job-run": return { kind: "other", words: `Ran the job "${d.job ?? "?"}" by hand${why(d.reason)}` };
    default: return { kind: "other", words: `${plain(what) || "Something was done"}${why(d.reason)}` };
  }
}

/** One registry event in plain words, or null when it says nothing a person needs. */
export function eventLine(e) {
  const at = e.at ?? null;
  if (!at) return null;
  const by = e.by ?? null;
  const line = (kind, words) => ({ at, kind, words: cut(words), ...(by ? { by } : {}), key: `event:${e.id ?? at}` });
  if (e.kind === "health") return line("health", `The ${e.check ?? "health"} check ${e.ok ? "passes again" : `started failing${e.detail ? `: ${e.detail}` : ""}`}`);
  if (e.kind === "backup") return line("health", `Nightly backup of the ${e.database ?? "shop's"} records ${e.ok ? "done" : `failed${e.error ? `: ${e.error}` : ""}`}`);
  if (e.kind === "restore-drill") return line("health", `Monthly restore test ${e.ok ? "passed" : `failed${e.detail ? `: ${e.detail}` : ""}`}`);
  if (e.kind === "spending") return line("health", `Spending level went from ${e.from ?? "normal"} to ${e.to ?? "?"}`);
  if (HEALTH_KINDS.has(e.kind)) return line("health", plain(e.kind));
  if (e.source === "repairs") return line("health", `${e.what === "repair-fixed" ? "Repair fixed" : "Repair opened"}: ${e.problem ?? e.check ?? "?"}`);
  if (e.source === "self-check") return line("health", `Self-checks ${e.ok ? "all passed" : "found a problem"} (${cut(e.why, 80)})`);
  if (e.source === "control-room") {
    const { kind, words } = controlAction(e.what, e);
    return line(kind, words);
  }
  if (e.source === "accounts" && e.what === "member-deleted-account") return line("other", `${e.email ?? "A team member"}${e.role ? ` (${plain(e.role)})` : ""} deleted their own Colophon account and left the team`);
  if (e.source === "run-book") return line("release", `Rolled back to version ${e.version ?? "?"} from the run book${why(e.reason)}`);
  if (BILLING_SOURCES.has(e.source)) return line("billing", `${e.source === "closing" ? "Closing: " : e.source === "payment-service" ? "Payments: " : ""}${plain(e.what ?? e.kind) || "billing changed"}${e.status ? ` (${plain(e.status)})` : ""}`);
  if (EMAIL_SOURCES.has(e.source)) return line("email", plain(e.what ?? e.kind) || "email changed");
  if (e.source === "trial-tips") return line("email", `Sent a setup tip${e.day ? ` (day ${e.day})` : ""}`);
  return line("other", `${plain(e.what ?? e.kind ?? e.source) || "Something changed"}${e.state ? ` (${plain(e.state)})` : ""}`);
}

const checkLine = (run) => ({
  at: run.finishedAt ?? run.startedAt ?? null, kind: "release", key: `check:${run.runId ?? run.startedAt}`,
  words: cut(`Release check ${run.ok ? "passed" : `failed${run.failedCheck ? ` at check ${run.failedCheck}` : ""}${run.error ? `: ${run.error}` : ""}`}${run.version ? ` on version ${run.version}` : ""}`),
});

const RELEASE_WORDS = { shipped: "reached the shop", "already-on": "was already on the shop", failed: "failed", "rolled-back": "rolled the shop back" };
function releaseLines(runs, shopId) {
  const lines = [];
  for (const run of runs ?? []) {
    for (const shop of run.shops ?? []) {
      if (shop?.shopId !== shopId) continue;
      const at = run.finishedAt ?? run.startedAt ?? null;
      const status = shop.status ?? (run.ok ? "shipped" : "failed");
      const words = run.kind === "roll-back"
        ? `Rolled back to version ${run.version ?? "?"}${run.by ? ` by ${run.by}` : ""}${why(run.reason)}`
        : `Release ${run.version ?? "?"} ${RELEASE_WORDS[status] ?? plain(status)}${shop.error ? `: ${shop.error}` : ""}`;
      lines.push({ at, kind: "release", words: cut(words), key: `release:${run.runId ?? at}:${shopId}`, ...(run.by ? { by: run.by } : {}) });
    }
  }
  return lines;
}

const SUPPORT_WORDS = { open: "waiting for an answer", answered: "answered", closed: "closed" };
const supportLine = (t) => ({
  at: t.openedAt ?? t.updatedAt ?? null, kind: "support", key: `support:${t.id}`,
  words: cut(`Support request "${t.subject ?? ""}" (${SUPPORT_WORDS[t.status] ?? t.status ?? "?"})`),
});

const emailLine = (m) => ({
  at: m.at ?? null, kind: "email", key: `email:${m.kind}:${m.at}`,
  words: cut(m.status === "sent" ? `Emailed the press: ${plain(m.kind)}` : `Couldn't email the press: ${plain(m.kind)}`),
});

// The shop's own security lines (apps/shop functions/twoStepBackup.js): its words are already plain.
const securityLine = (doc) => ({ at: doc.data?.createdAt ?? null, kind: "security", key: `security:${doc.id}`, words: cut(doc.data?.message ?? "A sign-in safety change") });
export const MAX_SECURITY = 500;

/** Sorts newest first; equal times by key, so paging is stable. */
const newestFirst = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.key < b.key ? 1 : a.key > b.key ? -1 : 0);
const cursorOf = (entry) => `${entry.at}|${entry.key}`;
function olderThan(entry, before) {
  if (!before) return true;
  const bar = String(before).indexOf("|");
  const at = bar < 0 ? String(before) : String(before).slice(0, bar);
  const key = bar < 0 ? null : String(before).slice(bar + 1);
  if (entry.at !== at) return entry.at < at;
  return key !== null && entry.key < key;
}

export async function shopTimeline({ shopId, registry, auditLog, activity, supportStore, releases, emailLog, shopData, live = false, limit = 200, before, kinds } = {}) {
  if (typeof shopId !== "string" || !shopId) throw new ControlError(400, "Choose a shop.");
  const wanted = kinds == null ? null : new Set(kinds);
  if (wanted && (!Array.isArray(kinds) || kinds.some((k) => !TIMELINE_KINDS.includes(k)))) throw new ControlError(400, `The kinds are: ${TIMELINE_KINDS.join(", ")}.`);
  const n = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : 200;
  if (before != null && (typeof before !== "string" || Number.isNaN(Date.parse(before.split("|")[0])))) throw new ControlError(400, "Show older from a time.");

  const lines = [];
  const actions = activity ? await activity.list({ shopId, limit: 1000 }) : [];
  const seen = new Set(actions.map((a) => `${a.at} ${a.what}`));
  for (const a of actions) {
    const { kind, words } = controlAction(a.what, a.detail ?? {});
    lines.push({ at: a.at, kind, words: cut(words), ...(a.by ? { by: a.by } : {}), key: `activity:${a.id}` });
  }
  // The registry reads its newest events only: from `before` back, so an older page isn't cut off by the newest ones.
  const eventsBefore = before ? before.split("|")[0] : null;
  for (const e of registry.readEvents ? await registry.readEvents(shopId, { before: eventsBefore }) : []) {
    if (e.source === "control-room" && seen.has(`${e.at} ${e.what}`)) continue;
    const line = eventLine(e);
    if (line) lines.push(line);
  }
  for (const run of await registry.readReleaseChecks(shopId)) lines.push(checkLine(run));
  const runs = releases ? await releases() : registry.listReleases ? await registry.listReleases() : null;
  if (runs) lines.push(...releaseLines(runs, shopId));
  else if (auditLog?.list) {
    for (const e of (await auditLog.list(shopId)).filter((x) => x.kind === "release")) {
      lines.push({ at: e.at, kind: "release", key: `audit:${e.runId}:${e.at}`, words: cut(`Release ${e.version ?? "?"} ${RELEASE_WORDS[e.status] ?? plain(e.status)}${e.error ? `: ${e.error}` : ""}`) });
    }
  }
  if (supportStore?.listByShop) for (const t of await supportStore.listByShop(shopId)) lines.push(supportLine(t));
  if (emailLog?.listForShop) for (const m of await emailLog.listForShop(shopId, { limit: 1000 })) if (m.platform === true) lines.push(emailLine(m));
  if (live && shopData?.find && (!wanted || wanted.has("security"))) {
    const docs = await shopData.find(shopId, "audit-log", { where: [["type", "==", "security"]], limit: MAX_SECURITY }).catch(() => []);
    for (const doc of docs) lines.push(securityLine(doc));
  }

  const shown = lines.filter((l) => l.at && (!wanted || wanted.has(l.kind)) && olderThan(l, before)).sort(newestFirst);
  const page = shown.slice(0, n);
  return {
    entries: page.map(({ at, kind, words, by }) => ({ at, kind, words, ...(by ? { by } : {}) })),
    next: shown.length > n ? cursorOf(page.at(-1)) : null,
  };
}

/** The control room's door to it: platform admins only (adminOf). */
export function createTimeline({ admins, registry, auditLog, activity, supportStore, releases, emailLog, shopData, now = () => new Date() }) {
  return {
    async timeline(claims, { shopId, kinds, before, limit } = {}) {
      adminOf(claims, admins, now().getTime());
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      return shopTimeline({ shopId, registry, auditLog, activity, supportStore, releases, emailLog, shopData, live: row.status === "live", kinds, before, ...(limit ? { limit } : {}) });
    },
  };
}

//   POST /api/control/timeline  { shopId, kinds?, before? }: one shop's timeline, newest first (plan 19.10)
export function timelineRoutes(timeline) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "POST /api/control/timeline": (claims, request) => timeline.timeline(claims, body(request)),
  };
}
