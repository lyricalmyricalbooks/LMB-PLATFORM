// Messages to presses (code plan 19.14): a short note from the control room shown at the top of every shop admin it
// reaches (every shop, the shops on one plan, or one shop), from a start to an end date. An "important" one is also
// emailed once to each press's owner. The status page's note (the run book) stays for outages.
//
// How a message reaches a shop: the platform writes the admin-only `platform/messages` document into the shop's own
// database, the same way billing writes `platform/plan` (services/billing/shopPlan.js). The shop admin follows that
// document and shows a banner (apps/shop/src/app/admin/platformMessages.ts); the storefront never reads it, and the
// shop's rules let only its admins read it and no browser write it. Not the shop profile: /shop-profile.js is public
// (anyone can read it), and changing it means putting the shop's pages live again.
//
// The document holds every message for the shop that hasn't ended yet, upcoming ones included, so a message starts and
// ends on time with no new write; the admin's banner checks the dates itself. `sweep()` rewrites every shop's document
// (nightly, beside the self-checks): it drops ended messages and reaches shops made after a message was added.
//
// Stored as pressMessages/<id> in the platform project (messagesFakes.js has the in-memory one):
//   { id, words, level, audience, startsAt, endsAt, by, reason, createdAt, endedAt?, endedBy?, endReason?,
//     emailed: { [shopId]: at } }
//
// Clients passed in:
//   store      get(id); set(id, row); list() -> every row
//   registry   listShops(); getShop(shopId); getProfile(shopId); recordEvent(shopId, entry)
//   auditLog   ready(shopId) (whether the shop's database exists yet); write(shopId, id, entry)
//   shopData   get(shopId, path); set(shopId, path, data): the shop's own database (clients/shop.js)
//   email      optional: sendPlatform({ kind, to, data, idempotencyKey, shopId }) (services/email); without it an
//              important message is refused, so nobody thinks the presses were emailed
//   activity   optional: the activity log (activity.js)
import { createHash } from "node:crypto";
import { ControlError, adminOf, noteOf } from "./controlRoom.js";
import { activityEntry } from "./activity.js";
import { PLANS } from "../setup/steps.js";
import { dateText } from "../services/billing/billing.js";

/** Where a shop's messages are written in its own database (admin-only, like platform/plan). */
export const MESSAGES_DOC = "platform/messages";
export const MAX_WORDS = 400;
/** A message can run at most this long from now: a longer note belongs on the help pages. */
export const MAX_DAYS = 60;
export const LEVELS = Object.freeze(["info", "important"]);
export const AUDIENCE_PLANS = Object.freeze(["shop", "stockroom", "both"]);

/**
 * Notices the terms promise (terms/terms.js CHANGE_NOTICE_DAYS, legal review of 3 November 2026): a price rise, a new
 * helper company or a change to the terms is told to presses by email at least this many days before it takes effect.
 * A notice is an important message with a `notice: { kind, takesEffect }`; the control room refuses one that is late.
 */
export const NOTICE_DAYS = 30;
export const NOTICE_KINDS = Object.freeze({ "price-rise": "a price rise", "new-helper": "a new helper company", "terms-change": "a change to the terms" });

/**
 * Whether presses were told in time about a change of this kind taking effect at `effectiveAt`: a notice of the kind
 * that was emailed to at least one owner, taking effect no later than that, whose message started at least
 * NOTICE_DAYS before it.
 */
export function noticeOnRecord(messages, kind, effectiveAt) {
  const when = ms(effectiveAt);
  return (messages ?? []).some((m) => m.notice?.kind === kind && Object.keys(m.emailed ?? {}).length > 0 && ms(m.notice.takesEffect) <= when
    && ms(m.startsAt) <= ms(m.notice.takesEffect) - NOTICE_DAYS * DAY);
}

/**
 * The proof that promised notices went out, newest first: what changed, when it was sent, when it takes effect, how
 * many days' notice that gave and how many owners were emailed (each address and time stays on the message).
 */
export function noticesSent(messages) {
  return (messages ?? []).filter((m) => m.notice)
    .map((m) => ({
      id: m.id, kind: m.notice.kind, words: m.words, sentAt: m.startsAt, takesEffect: m.notice.takesEffect,
      daysNotice: Math.floor((ms(m.notice.takesEffect) - ms(m.startsAt)) / DAY),
      emailed: Object.keys(m.emailed ?? {}).length, endedAt: m.endedAt ?? null,
    }))
    .sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
}

function noticeOf(notice, takesEffect, startMs) {
  if (notice === undefined || notice === null || notice === "") return null;
  if (!Object.hasOwn(NOTICE_KINDS, notice)) throw new ControlError(400, "Choose what the notice is about: a price rise, a new helper company or a change to the terms.");
  const effect = ms(takesEffect);
  if (!Number.isFinite(effect)) throw new ControlError(400, "Give the day the change takes effect.");
  if (effect < startMs + NOTICE_DAYS * DAY) {
    throw new ControlError(400, `The terms promise presses ${NOTICE_DAYS} days' notice: ${NOTICE_KINDS[notice]} can take effect on ${dateText(new Date(startMs + NOTICE_DAYS * DAY).toISOString())} at the earliest.`);
  }
  return { kind: notice, takesEffect: new Date(effect).toISOString() };
}

const DAY = 86_400_000;
const ms = (time) => (typeof time === "string" ? Date.parse(time) : NaN);
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** A shop a message can reach: live, and not deleted. */
export const reachable = (row) => row?.status === "live" && row?.closing?.stage !== "deleted";

/** Whether a message is meant for this shop (its audience), whatever the dates. */
export function messageReaches(message, row) {
  const audience = message?.audience ?? {};
  if (audience.all === true) return true;
  if (typeof audience.plan === "string") return row?.plan === audience.plan;
  if (typeof audience.shopId === "string") return row?.shopId === audience.shopId;
  return false;
}

/** "showing" (between its dates), "upcoming" or "ended" (ended by hand, or past its end date). */
export function messageState(message, nowMs) {
  if (message.endedAt || nowMs >= ms(message.endsAt)) return "ended";
  return nowMs < ms(message.startsAt) ? "upcoming" : "showing";
}

/**
 * What a shop's `platform/messages` document holds: every message for it that hasn't ended, important first, then by
 * start. Only what the banner shows: no author, reason or audience.
 */
export function messagesForShop(row, messages, nowMs) {
  return messages
    .filter((m) => messageReaches(m, row) && messageState(m, nowMs) !== "ended")
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "important" ? -1 : 1) || ms(a.startsAt) - ms(b.startsAt) || a.id.localeCompare(b.id))
    .map(({ id, words, level, startsAt, endsAt }) => ({ id, words, level, startsAt, endsAt }));
}

/** The audience in one shape, or a refusal in plain words. */
function audienceOf(audience) {
  if (!audience || typeof audience !== "object" || Array.isArray(audience)) throw new ControlError(400, "Choose who sees it: every shop, the shops on one plan, or one shop.");
  const keys = Object.keys(audience).filter((k) => audience[k] !== undefined && audience[k] !== null && audience[k] !== false && audience[k] !== "");
  if (keys.length !== 1) throw new ControlError(400, "Choose one audience: every shop, the shops on one plan, or one shop.");
  if (keys[0] === "all" && audience.all === true) return { all: true };
  if (keys[0] === "plan" && AUDIENCE_PLANS.includes(audience.plan)) return { plan: audience.plan };
  if (keys[0] === "shopId" && typeof audience.shopId === "string") return { shopId: audience.shopId.trim() };
  throw new ControlError(400, "Choose who sees it: every shop, the shops on one plan (shop, stockroom or both), or one shop.");
}

/** The words, plain text only: no tags, at most 400 characters. */
function wordsOf(words) {
  const text = typeof words === "string" ? words.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim() : "";
  if (!text) throw new ControlError(400, "Write the message.");
  if (text.length > MAX_WORDS) throw new ControlError(400, `Keep the message to ${MAX_WORDS} characters (it has ${text.length}).`);
  if (/<\/?[a-z!?][^>]*>/i.test(text) || /&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(text)) throw new ControlError(400, "Write the message as plain words, without page markup.");
  return text;
}

/** Start and end, checked: the end is required, after the start and after now, and at most 60 days away. */
function datesOf({ startsAt, endsAt }, nowMs) {
  const start = startsAt === undefined || startsAt === null || startsAt === "" ? nowMs : ms(startsAt);
  const end = ms(endsAt);
  if (!Number.isFinite(start)) throw new ControlError(400, "The start date isn't a date.");
  if (!Number.isFinite(end)) throw new ControlError(400, "Choose when the message ends.");
  if (end <= start || end <= nowMs) throw new ControlError(400, "The message must end after it starts, and after now.");
  if (end > nowMs + MAX_DAYS * DAY) throw new ControlError(400, `A message can run at most ${MAX_DAYS} days from today.`);
  return { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() };
}

const reasonOf = noteOf;

export function createPressMessages({ store, registry, auditLog, shopData, email, activity, admins, now = () => new Date() }) {
  const at = () => now().toISOString();
  const nowMs = () => now().getTime();

  /** Logged in the activity log, and for a one-shop message in that shop's history and audit log too. */
  async function log(what, message, detail) {
    const stamp = at();
    if (activity) await activity.record(activityEntry({ at: stamp, by: detail.by, what, shopId: message.audience.shopId ?? null, detail: { id: message.id, ...detail } }));
    const shopId = message.audience.shopId;
    if (!shopId) return;
    const entry = { id: `control-room-${stamp}-${what}-${hash({ id: message.id, ...detail }).slice(0, 8)}`, source: "control-room", at: stamp, what, message: message.id, ...detail };
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
  }

  /** The shops a message reaches now: live, in its audience. */
  async function targets(message) {
    return (await registry.listShops()).filter((row) => reachable(row) && messageReaches(message, row));
  }

  /**
   * Writes one shop's messages into its database, when it has a shop admin and its database exists. Unchanged
   * messages are not written again. Returns whether the shop now has them.
   */
  async function publishShop(row, all) {
    if (!PLANS[row.plan]?.shop || !(await auditLog.ready(row.shopId))) return false;
    const messages = messagesForShop(row, all, nowMs());
    const saved = await shopData.get(row.shopId, MESSAGES_DOC);
    if (saved && JSON.stringify(saved.messages ?? []) === JSON.stringify(messages)) return true;
    await shopData.set(row.shopId, MESSAGES_DOC, { messages, updatedAt: at() });
    return true;
  }

  /** Emails the owner once for an important message that is showing or about to (one key per message and shop). */
  async function emailOnce(message, row) {
    if (message.level !== "important" || messageState(message, nowMs()) === "ended" || message.emailed?.[row.shopId]) return false;
    if (!row.ownerEmail) return false;
    const profile = await registry.getProfile(row.shopId);
    const site = typeof profile?.siteUrl === "string" && /^https:\/\/[^\s<>"']+$/.test(profile.siteUrl) ? profile.siteUrl.replace(/\/+$/, "") : null;
    await email.sendPlatform({
      kind: "press-message", to: row.ownerEmail, shopId: row.shopId, idempotencyKey: `press-message/${message.id}/${row.shopId}`,
      data: { pressName: row.pressName ?? row.shopId, words: message.words, endsOn: dateText(message.endsAt), link: site && PLANS[row.plan]?.shop ? `${site}/admin` : null },
    });
    return true;
  }

  /** Puts a message in front of every shop it reaches; important ones are emailed. Safe to repeat. */
  async function deliver(message) {
    const all = await store.list();
    let shops = 0;
    let emailed = 0;
    const sentTo = { ...(message.emailed ?? {}) };
    const failed = [];
    for (const row of await targets(message)) {
      // One shop's failure never stops the rest; the hourly sweep tries the failed ones again.
      try {
        if (await publishShop(row, all)) shops += 1;
        if (await emailOnce({ ...message, emailed: sentTo }, row)) {
          sentTo[row.shopId] = at();
          emailed += 1;
          // Recorded after each email, so a run that stops half-way never emails a press twice.
          await store.set(message.id, { ...message, emailed: sentTo });
        }
      } catch (error) {
        failed.push(row.shopId);
        console.error(`press message ${message.id} to ${row.shopId} failed: ${error?.message ?? error}`);
      }
    }
    return { shops, emailed, failed };
  }

  const shown = (message) => ({ ...message, state: messageState(message, nowMs()) });

  return {
    /** Every message, newest first, with its state and how many shops it reaches now. */
    async list(claims) {
      adminOf(claims, admins, nowMs());
      const rows = (await registry.listShops()).filter(reachable);
      const messages = (await store.list()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return { messages: messages.map((m) => ({ ...shown(m), reaches: rows.filter((row) => messageReaches(m, row)).length })), notices: noticesSent(messages), maxWords: MAX_WORDS, maxDays: MAX_DAYS };
    },

    /**
     * Adds a message: { words, level, audience, startsAt?, endsAt, reason }. Logged, written to every shop it reaches,
     * and emailed once to each owner when important. Adding the same message again changes nothing and finishes any
     * delivery a first run didn't.
     */
    async add(claims, { words, level = "info", audience, startsAt, endsAt, reason, notice, takesEffect } = {}) {
      const by = adminOf(claims, admins, nowMs());
      const who = audienceOf(audience);
      const dates = datesOf({ startsAt, endsAt }, nowMs());
      // A promised notice is always emailed, and says the day the change takes effect.
      const promised = noticeOf(notice, takesEffect, ms(dates.startsAt));
      if (promised) level = "important";
      const plain = String(words ?? "").trim();
      const text = wordsOf(promised && plain && !plain.includes(dateText(promised.takesEffect)) ? `${plain} This takes effect on ${dateText(promised.takesEffect)}.` : words);
      if (!LEVELS.includes(level)) throw new ControlError(400, "Choose info or important.");
      const why = reasonOf(reason);
      if (who.shopId && !(await registry.getShop(who.shopId))) throw new ControlError(404, "There's no shop with that id.");
      if (level === "important" && !email) throw new ControlError(503, "The control room can't email presses here, so the important message wasn't added.");
      // With no start date given, "now" is left out of the id, so sending the same message again after a failure
      // finishes the first one instead of making a second message (and emailing presses twice).
      const startGiven = !(startsAt === undefined || startsAt === null || startsAt === "");
      const id = `msg-${hash({ words: text, level, audience: who, startsAt: startGiven ? dates.startsAt : null, endsAt: dates.endsAt, by, ...(promised ? { notice: promised } : {}) }).slice(0, 20)}`;
      let message = await store.get(id);
      const added = !message;
      if (!message) {
        message = { id, words: text, level, audience: who, ...dates, by, reason: why, createdAt: at(), endedAt: null, emailed: {}, ...(promised ? { notice: promised } : {}) };
        // Logged before any shop sees it.
        await log("press-message-added", message, { by, reason: why, level, audience: who, endsAt: dates.endsAt });
        await store.set(id, message);
      }
      if (message.endedAt) return { message: shown(message), added: false, shops: 0, emailed: 0, failed: [] };
      const { shops, emailed, failed } = await deliver(message);
      return { message: shown((await store.get(id)) ?? message), added, shops, emailed, failed };
    },

    /** Ends a message now, with a reason: it leaves every shop's admin. Ending it twice changes nothing. */
    async end(claims, { id, reason } = {}) {
      const by = adminOf(claims, admins, nowMs());
      const why = reasonOf(reason);
      const message = typeof id === "string" ? await store.get(id) : null;
      if (!message) throw new ControlError(404, "There's no message with that id.");
      if (message.endedAt) return { message: shown(message), ended: false };
      const ended = { ...message, endedAt: at(), endedBy: by, endReason: why };
      await log("press-message-ended", message, { by, reason: why });
      await store.set(id, ended);
      const all = await store.list();
      for (const row of await targets(message)) await publishShop(row, all);
      return { message: shown(ended), ended: true };
    },

    /** One shop's messages written again (a new shop, or a check). */
    async publish(shopId) {
      const row = await registry.getShop(shopId);
      if (!reachable(row)) return { shopId, written: false };
      return { shopId, written: await publishShop(row, await store.list()) };
    },

    /**
     * The nightly sweep: every live shop's messages written again (ended ones drop off, new shops get theirs), and an
     * important message still showing is emailed to an owner who hasn't had it. One shop's trouble doesn't stop the rest.
     */
    async sweep() {
      const all = await store.list();
      const results = [];
      for (const row of (await registry.listShops()).filter(reachable)) {
        try {
          results.push({ shopId: row.shopId, written: await publishShop(row, all) });
        } catch (error) {
          results.push({ shopId: row.shopId, error: error.message });
        }
      }
      if (email) {
        for (const message of all.filter((m) => m.level === "important" && messageState(m, nowMs()) !== "ended")) {
          try {
            await deliver(message);
          } catch (error) {
            results.push({ message: message.id, error: error.message });
          }
        }
      }
      return results;
    },
  };
}

/** The control room's calls for messages (added to the web door beside controlRoutes). Platform admins only. */
export function messageRoutes(messages) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/control/messages": (claims) => messages.list(claims),
    "POST /api/control/messages/add": (claims, request) => messages.add(claims, body(request)),
    "POST /api/control/messages/end": (claims, request) => messages.end(claims, body(request)),
  };
}
