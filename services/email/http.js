// The door shops knock on to send an email through the platform (a shop that has not connected its own Gmail, or whose
// Gmail refused a send). One HTTP handler, hosted later as one function in the platform project; it takes a plain
// { method, headers, body } and returns { status, body }, so tests need no server.
//
// Who is asking: `X-Shop-Id` names the shop and `Authorization: Bearer <shop service key>` proves it. Each shop has its
// own service key (a Functions secret in that shop's project); the registry keeps only its SHA-256 (`serviceKeyHash`),
// so the registry can't be used to send as a shop. A shop can never choose its sender name or reply-to: the email
// service takes both from the registry.
//
// Abuse limit: at most `dailyLimit` emails per shop in 24 hours (sentLog.countSince), so a broken or misused shop can't
// spend the platform's sending reputation.
import { createHash, timingSafeEqual } from "node:crypto";

export const DAILY_LIMIT = 2000;

export const hashServiceKey = (key) => createHash("sha256").update(String(key)).digest("hex");

/** True when `key` is the one whose hash the registry keeps; compared in constant time. */
export function serviceKeyMatches(key, storedHash) {
  if (typeof key !== "string" || key.length < 32 || typeof storedHash !== "string" || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  return timingSafeEqual(Buffer.from(hashServiceKey(key), "hex"), Buffer.from(storedHash, "hex"));
}

const header = (headers, name) => {
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return typeof found?.[1] === "string" ? found[1] : "";
};
const reply = (status, body) => ({ status, body });

export async function handleShopEmail(request, { service, registry, sentLog, dailyLimit = DAILY_LIMIT, now = () => new Date() }) {
  if (request?.method !== "POST") return reply(405, { ok: false, message: "Send a POST." });
  const shopId = header(request.headers, "x-shop-id");
  const key = header(request.headers, "authorization").replace(/^Bearer\s+/i, "");
  const shop = shopId ? await registry.getShop(shopId) : null;
  // One answer for "no such shop" and "wrong key", so the door can't be used to find shop ids.
  if (!shop || !serviceKeyMatches(key, shop.serviceKeyHash)) return reply(401, { ok: false, message: "This shop can't send through the platform." });

  const body = request.body && typeof request.body === "object" ? request.body : null;
  if (!body) return reply(400, { ok: false, message: "The email is missing." });
  const since = new Date(now().getTime() - 24 * 3600_000).toISOString();
  if ((await sentLog.countSince(shopId, since)) >= dailyLimit) {
    return reply(429, { ok: false, retryable: true, message: `This shop has sent ${dailyLimit} emails in the last day through the platform; try again later.` });
  }
  const { kind, to, subject, text, html, idempotencyKey } = body;
  try {
    // The key is scoped to the shop, so two shops' keys can never meet.
    const result = await service.send(shopId, { kind, to, subject, text, html, custom: true, idempotencyKey: `${shopId}/${idempotencyKey}` });
    return reply(200, { ok: true, id: result.id, alreadySent: result.alreadySent });
  } catch (error) {
    if (typeof error.retryable === "boolean") return reply(error.retryable ? 503 : 422, { ok: false, retryable: error.retryable, message: error.message });
    return reply(400, { ok: false, retryable: false, message: error.message });
  }
}
