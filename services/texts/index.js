// Text-message reminders (Services plan phase 7, 17 November 2026). A shop's booking reminders can also go by text to
// a client who ticked "Text me reminders" and gave a mobile number. The platform holds the text company's keys
// (Twilio, config.js); the shop's own server (apps/shop/functions/textSender.js) asks through the shop door below, as
// it does for email. Each text costs the platform what Twilio charges, and that is what the shop pays: last month's
// text parts go on the shop's next bill as their own line, at cost (billing.billTexts, job "texts").
//
// The sent log keeps, per text: the shop, the kind, when, how many parts, what it cost, and the number's last four
// digits. Never the words of the text, never the whole number.
//
//   textSent/{shopId}_{key}   { shopId, kind, key, month, at, status: "sent" | "failed", id, parts, micros, currency,
//                               toEnd, message? }
//
// The shop door: POST /api/texts/shop, `X-Shop-Id` + `Authorization: Bearer <service key>`, body { op, args }.
//
//   texts.status                                   { available, price }           price: one text part, "1.6¢"
//   texts.send  { to, body, kind, idempotencyKey } { ok: true, id, parts, alreadySent? }
//                                                  | { ok: false, retryable, optedOut?, message }
//
// Limits: Canadian and US mobile numbers only (+1), at most MAX_BODY characters (three parts), DAILY_LIMIT texts per
// shop a day, nothing for a paused or closed shop. One text per key: a send already in the log is not sent again.
// Off until TEXTS=on with the Twilio keys (Julian's steps: server/README.md, "Text reminders").
//
// Replies by text (Bookings plan 4, 3.4, 23 November 2026). A client answers a reminder with Y (they'll be there), C
// (cancel) or M (move). The platform has one number for every shop, so a send that wants answers passes `replyRef` (the
// shop's own booking id) and the platform keeps, per number, which shop and booking texted it last:
//
//   textRoutes/{hmac(number)}   { shopId, ref, at }        never the number itself, only a keyed hash of it
//   textReplies/{id}            { shopId, ref, word, at }  "yes" | "cancel" | "move"; gone once the shop takes it
//
// Twilio posts each text that comes in to POST /api/texts/inbound (server/world.js answers it before the doors, as XML), signed with the auth token (checked here). A reply
// within REPLY_DAYS of the shop's last text is kept for that shop; any other word, or an old one, is dropped. Words
// Twilio keeps for itself (STOP, CANCEL, HELP…) never reach us as replies. The shop's booking sweep takes its replies
// every few minutes through the shop door:
//
//   texts.replies                       { replies: [{ id, ref, word, at }] }
//   texts.repliesTaken { ids }          { ok: true }
import { createHmac, timingSafeEqual } from "node:crypto";
import { serviceKeyMatches } from "../email/http.js";
import { SignupError } from "../../signup/signup.js";
import { partPriceText, readTextConfig, textCents } from "./config.js";
import { twilioClient } from "./twilio.js";

export { TEXTS_SETTING, TEXTS_SECRETS } from "./config.js";

export const DAILY_LIMIT = 500;
export const MAX_BODY = 459;
export const REPLY_DAYS = 7;
const REF = /^[A-Za-z0-9_-]{4,80}$/;

/** What a client's reply asks for: "yes", "cancel", "move" or "" for anything else. Pure. */
export function replyWord(text) {
  const word = String(text ?? "").trim().toLowerCase().replace(/[.!\s]+$/u, "");
  if (["y", "yes", "oui"].includes(word)) return "yes";
  if (["c", "annuler"].includes(word)) return "cancel";
  if (["m", "move", "déplacer", "deplacer"].includes(word)) return "move";
  return "";
}

/** Twilio's request signature: base64 HMAC-SHA1 of the address and the sorted form fields, keyed by the auth token. */
export function twilioSignature(token, url, form) {
  const text = url + Object.keys(form).sort().map((key) => key + form[key]).join("");
  return createHmac("sha1", token).update(text, "utf8").digest("base64");
}
const KIND = /^[a-z][a-z0-9-]{1,40}$/;
const KEY = /^[A-Za-z0-9_.:-]{6,200}$/;

/** A Canadian or US number as +1XXXXXXXXXX, or "" when it can't be one. Pure. */
export function phoneE164(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? `+1${digits}` : "";
}

// The texting alphabet (GSM 03.38): its basic characters take one place, the extension ones two. Anything else
// (accents outside it, emoji) makes the whole text use the wider alphabet, with fewer characters a part.
const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";
/** How many parts a text is sent as (what Twilio charges by). Pure. */
export function textParts(body) {
  const value = String(body ?? "");
  let gsm = 0;
  for (const ch of value) {
    if (GSM_BASIC.includes(ch)) gsm += 1;
    else if (GSM_EXTENDED.includes(ch)) gsm += 2;
    else { gsm = -1; break; }
  }
  if (gsm >= 0) return gsm <= 160 ? 1 : Math.ceil(gsm / 153);
  const units = value.length; // UTF-16 code units, as the wider alphabet counts them
  return units <= 70 ? 1 : Math.ceil(units / 67);
}

const monthOf = (date) => date.toISOString().slice(0, 7);
const header = (headers, name) => {
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return typeof found?.[1] === "string" ? found[1] : "";
};

export function createTexts({ env = process.env, fetch = globalThis.fetch, registry, log, replies = null, inboundUrl = "", twilio = null, dailyLimit = DAILY_LIMIT, now = () => new Date() } = {}) {
  if (!registry?.getShop || !registry?.listShops) throw new Error("Text reminders need the shop registry");
  if (!log?.get || !log?.put || !log?.countSince || !log?.listMonth) throw new Error("Text reminders need the sent log");
  const config = readTextConfig(env);
  const available = config.on;
  const client = twilio ?? (config.sid ? twilioClient({ fetch, sid: config.sid, token: config.token, from: config.from }) : null);
  const currencyOf = (row) => (String(row?.billing?.currency ?? "").toUpperCase() === "USD" ? "USD" : "CAD");
  /** Paused or closed (services/billing ACCESS), or given up on: no texts. */
  const stopped = (row) => row?.status === "abandoned" || ["paused", "closed"].includes(row?.billing?.access);
  // Replies need the stores and the address Twilio posts to; without them shops' reminders don't ask for answers.
  const repliesOn = available && Boolean(replies && /^https:\/\//.test(inboundUrl));
  const numberKey = (to) => createHmac("sha256", `${config.sid}:${config.token}`).update(to).digest("hex").slice(0, 40);
  const status = (row) => ({ available, price: available ? partPriceText(config.partMicros[currencyOf(row)]) : "", replies: repliesOn && !stopped(row) });

  async function send(shopId, row, args) {
    if (!available) return { ok: false, retryable: false, message: "Text reminders aren't open yet." };
    if (stopped(row)) return { ok: false, retryable: false, message: "This shop is paused, so it can't send texts." };
    const to = phoneE164(args.to);
    if (!to) return { ok: false, retryable: false, message: "Texts go only to Canadian and US mobile numbers." };
    const body = String(args.body ?? "").trim();
    if (!body || body.length > MAX_BODY) return { ok: false, retryable: false, message: `A text needs words, and at most ${MAX_BODY} characters.` };
    const kind = KIND.test(String(args.kind ?? "")) ? args.kind : "shop-text";
    if (!KEY.test(String(args.idempotencyKey ?? ""))) return { ok: false, retryable: false, message: "The text needs its own key." };
    // The key is scoped to the shop, so two shops' keys can never meet.
    const key = `${shopId}/${args.idempotencyKey}`;
    const before = await log.get(key);
    if (before?.status === "sent") return { ok: true, id: before.id, parts: before.parts, alreadySent: true };
    const at = now();
    if ((await log.countSince(shopId, new Date(at.getTime() - 24 * 3600_000).toISOString())) >= dailyLimit) {
      return { ok: false, retryable: true, message: `This shop has sent ${dailyLimit} texts in the last day; the rest wait until tomorrow.` };
    }
    const currency = currencyOf(row);
    const entry = { shopId, kind, key, month: monthOf(at), at: at.toISOString(), currency, toEnd: to.slice(-4) };
    try {
      const sent = await client.send({ to, body });
      const parts = sent.parts || textParts(body);
      await log.put(key, { ...entry, status: "sent", id: sent.id, parts, micros: parts * config.partMicros[currency] });
      if (repliesOn && REF.test(String(args.replyRef ?? ""))) {
        await replies.routePut(numberKey(to), { shopId, ref: args.replyRef, at: at.toISOString() }).catch(() => {});
      }
      return { ok: true, id: sent.id, parts };
    } catch (error) {
      // A text that may have gone is logged as sent-unsure, so it is never sent twice and never billed.
      await log.put(key, { ...entry, status: error.unsure ? "unsure" : "failed", id: "", parts: 0, micros: 0, message: String(error.message).slice(0, 300) });
      return { ok: false, retryable: error.retryable === true, ...(error.optedOut ? { optedOut: true } : {}), message: error.message };
    }
  }

  /** Each shop's sent text parts in `month`: { [shopId]: { texts, parts } }. */
  async function monthTexts(month) {
    const out = {};
    for (const entry of await log.listMonth(month)) {
      if (entry.status !== "sent") continue;
      const shop = (out[entry.shopId] ??= { texts: 0, parts: 0 });
      shop.texts += 1;
      shop.parts += Number(entry.parts) || 0;
    }
    return out;
  }

  /** A text that came in (Twilio's webhook): kept for the shop that texted the number last, when it's an answer. */
  async function inbound(request = {}) {
    const empty = { status: 200, xml: "<Response></Response>" };
    if (!repliesOn) return { status: 404, body: { ok: false, message: "Not here." } };
    const form = Object.fromEntries(new URLSearchParams(String(request.rawBody ?? "")));
    const given = header(request.headers, "x-twilio-signature");
    const want = twilioSignature(config.token, inboundUrl, form);
    if (!given || given.length !== want.length || !timingSafeEqual(Buffer.from(given), Buffer.from(want))) {
      return { status: 403, body: { ok: false, message: "Not signed." } };
    }
    if (form.AccountSid !== config.sid) return { status: 403, body: { ok: false, message: "Not signed." } };
    const word = replyWord(form.Body);
    const from = phoneE164(form.From);
    if (!word || !from) return empty;
    const route = await replies.routeGet(numberKey(from));
    const at = now();
    if (!route?.shopId || !REF.test(String(route.ref ?? "")) || at.getTime() - Date.parse(route.at) > REPLY_DAYS * 86_400_000) return empty;
    const row = await registry.getShop(route.shopId);
    if (!row || stopped(row)) return empty;
    const id = String(form.MessageSid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 64) || `r${at.getTime()}`;
    await replies.inboxPut(id, { shopId: route.shopId, ref: route.ref, word, at: at.toISOString() });
    return empty;
  }

  const OPS = {
    "texts.status": async (_shopId, _args, row) => status(row),
    "texts.send": async (shopId, args, row) => send(shopId, row, args),
    "texts.replies": async (shopId) => ({
      replies: repliesOn ? (await replies.inboxList(shopId)).slice(0, 50).map(({ id, ref, word, at }) => ({ id, ref, word, at })) : [],
    }),
    "texts.repliesTaken": async (shopId, args) => {
      if (!repliesOn) return { ok: true };
      const ids = Array.isArray(args.ids) ? args.ids.filter((id) => typeof id === "string").slice(0, 50) : [];
      for (const id of ids) {
        const kept = await replies.inboxGet(id);
        // A shop only ever takes its own replies.
        if (kept?.shopId === shopId) await replies.inboxRemove(id);
      }
      return { ok: true };
    },
  };

  return {
    available,
    repliesOn,
    inbound,
    monthTexts,
    cents: (currency, parts) => textCents(config, currency, parts),
    /** For the control room: a shop's texts this month and what they cost so far. */
    async forShop(shopId) {
      const row = await registry.getShop(shopId);
      const month = monthOf(now());
      const mine = (await monthTexts(month))[shopId] ?? { texts: 0, parts: 0 };
      const currency = currencyOf(row);
      return { available, month, ...mine, cents: textCents(config, currency, mine.parts), currency };
    },
    async shopCall(request = {}) {
      const shopId = header(request.headers, "x-shop-id");
      const row = shopId ? await registry.getShop(shopId) : null;
      // One answer for "no such shop" and "wrong key", so the door can't be used to find shop ids.
      if (!row || !serviceKeyMatches(header(request.headers, "authorization").replace(/^Bearer\s+/i, ""), row.serviceKeyHash)) {
        throw new SignupError(401, "This shop can't send texts through the platform.");
      }
      const body = request.body && typeof request.body === "object" ? request.body : {};
      const op = Object.hasOwn(OPS, body.op) ? OPS[body.op] : null;
      if (!op) throw new SignupError(400, "Unknown call.");
      const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
      return op(shopId, args, row);
    },
  };
}

export function textShopDoorRoutes(texts) {
  return { "POST /api/texts/shop": async (request) => texts.shopCall(request) };
}

/** The daily job (job "texts"): put last month's texts on each shop's next bill, once per shop and month. */
export async function runTexts({ texts, billing, now = () => new Date() }) {
  const today = now();
  const month = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const sent = await texts.monthTexts(month);
  const billed = await billing.billTexts({ month, texts: sent, cents: texts.cents });
  const count = Object.values(sent).reduce((sum, shop) => sum + shop.texts, 0);
  return { summary: `${month}: ${count} text${count === 1 ? "" : "s"} from ${Object.keys(sent).length} shop${Object.keys(sent).length === 1 ? "" : "s"}; billed ${billed.billed.length}`, billed };
}
