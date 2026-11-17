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
import { serviceKeyMatches } from "../email/http.js";
import { SignupError } from "../../signup/signup.js";
import { partPriceText, readTextConfig, textCents } from "./config.js";
import { twilioClient } from "./twilio.js";

export { TEXTS_SETTING, TEXTS_SECRETS } from "./config.js";

export const DAILY_LIMIT = 500;
export const MAX_BODY = 459;
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

export function createTexts({ env = process.env, fetch = globalThis.fetch, registry, log, twilio = null, dailyLimit = DAILY_LIMIT, now = () => new Date() } = {}) {
  if (!registry?.getShop || !registry?.listShops) throw new Error("Text reminders need the shop registry");
  if (!log?.get || !log?.put || !log?.countSince || !log?.listMonth) throw new Error("Text reminders need the sent log");
  const config = readTextConfig(env);
  const available = config.on;
  const client = twilio ?? (config.sid ? twilioClient({ fetch, sid: config.sid, token: config.token, from: config.from }) : null);
  const currencyOf = (row) => (String(row?.billing?.currency ?? "").toUpperCase() === "USD" ? "USD" : "CAD");
  /** Paused or closed (services/billing ACCESS), or given up on: no texts. */
  const stopped = (row) => row?.status === "abandoned" || ["paused", "closed"].includes(row?.billing?.access);
  const status = (row) => ({ available, price: available ? partPriceText(config.partMicros[currencyOf(row)]) : "" });

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

  const OPS = {
    "texts.status": async (_shopId, _args, row) => status(row),
    "texts.send": async (shopId, args, row) => send(shopId, row, args),
  };

  return {
    available,
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
