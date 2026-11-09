// The Chit Chats app (code plan 26.11, docs/app-store.md): Colophon's own shipping app, built on the same app store
// plumbing as any outside app. It proves that plumbing, and it gives presses cheap Canadian postage:
//
//   1. The press adds "Chit Chats" from Settings › Apps. The permission page asks for read_orders + write_orders; coming
//      back, the connect page (accounts/chitchats.html) takes the press's Chit Chats client ID and access token.
//      `connect` swaps the install code for the app's key (POST /api/apps/oauth/token, as any app does), checks the Chit
//      Chats details, and keeps both sealed.
//   2. When an order is paid, the platform's alert (orders/paid, signed like every app alert) reaches `alert`, which makes
//      a Chit Chats shipment for it: the address, the items and the press's usual parcel. No postage is bought: the press
//      picks it and prints labels on Chit Chats, as with its other shop connections.
//   3. Every 10 minutes (`sweep`, the `chitchats-tracking` job), each open shipment is looked up. Once Chit Chats has a
//      tracking number, the app marks the order sent with it (POST /api/apps/v1/orders/<id>/fulfillment), and the shop's
//      own checks send the customer the usual shipped email.
//
// Removing the app (alert app/uninstalled, or the press disconnecting) forgets the key and the Chit Chats details.
//
//   createChitChatsApp({ appId, appSecret, connections, shipments, sealKey, exchange, appCall, roleIn, fetch, base, now })
//
// Clients passed in:
//   connections  get(shopId); put(shopId, row); remove(shopId); list()      chitchatsShops/<shopId>
//   shipments    get(id); put(id, row); listOpen(shopId)                     chitchatsShipments/<shopId~orderId>
//   exchange     ({ appId, secret, code, returnAddress }) -> { accessToken, shopId, scopes }  (installs.exchange)
//   appCall      ({ method, path, headers, body }) -> { status, body }  the app connection, called like an app would
//   roleIn       (person, shopId) -> role | null
import { createHash, timingSafeEqual } from "node:crypto";
import { SignupError, personOf } from "../../signup/signup.js";
import { seal, unseal } from "../payments/tokenSeal.js";
import { alertSignature } from "../apps/alerts.js";
import { ChitChatsError, createChitChatsClient } from "./client.js";

export const SHOP = /^[a-z0-9][a-z0-9-]{1,62}$/;
const ORDER = /^[A-Za-z0-9_-]{1,128}$/;
/** A parcel when the press hasn't said: a book in a padded mailer. */
export const USUAL_PARCEL = Object.freeze({ weightGrams: 500, lengthCm: 25, widthCm: 18, heightCm: 4 });
/** Chit Chats states with no tracking yet, or that ended without sending. */
const NOT_YET = new Set(["unpaid", "pending", "ready"]);
const ENDED = new Set(["voided", "canceled", "cancelled"]);
/** Where an app marks an order sent (services/apps/connection.js). */
const FULFILLMENT = (orderId) => ["", "api", "apps", "v1", "orders", encodeURIComponent(orderId), "fulfillment"].join("/");
const text = (value, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const sha256 = (value) => createHash("sha256").update(String(value), "utf8").digest("hex");

/** The press's usual parcel, checked: grams 1 to 30,000 and centimetres 1 to 200. */
export function parcelOf(input = {}) {
  const parcel = {};
  for (const [field, max] of [["weightGrams", 30000], ["lengthCm", 200], ["widthCm", 200], ["heightCm", 200]]) {
    const value = input[field] === undefined || input[field] === "" ? USUAL_PARCEL[field] : Number(input[field]);
    if (!Number.isFinite(value) || value < 1 || value > max) throw new SignupError(400, field === "weightGrams" ? "Give the parcel's weight in grams, from 1 to 30000." : "Give each side of the parcel in centimetres, from 1 to 200.");
    parcel[field] = Math.round(value);
  }
  return parcel;
}

/** The Chit Chats shipment for a paid order, or null when there's nothing to post. */
export function shipmentFor(order, parcel) {
  const to = order?.shipTo;
  if (!to?.line1 || !to.city || !to.country) return null;
  const currency = String(order.currency ?? "CAD").toLowerCase();
  const items = (order.items ?? []).filter((item) => (item.quantity ?? 1) > 0);
  const value = order.totals?.subtotal ?? items.reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0);
  return {
    name: text(to.name, 100) || "Customer", address_1: text(to.line1), address_2: text(to.line2) || undefined, city: text(to.city, 100),
    province_code: text(to.region, 50) || undefined, postal_code: text(to.postalCode, 20) || undefined, country_code: text(to.country, 2).toUpperCase(),
    ...(order.customer?.phone ? { phone: text(order.customer.phone, 30) } : {}),
    description: text(items.map((item) => item.title).filter(Boolean).join(", "), 255) || "Merchandise",
    value: String(Math.max(Number(value) || 0, 0).toFixed(2)), value_currency: currency === "usd" ? "usd" : "cad",
    package_type: "parcel", package_contents: "merchandise",
    weight_unit: "g", weight: parcel.weightGrams, size_unit: "cm", size_x: parcel.lengthCm, size_y: parcel.widthCm, size_z: parcel.heightCm,
    line_items: items.map((item) => ({
      quantity: item.quantity ?? 1, description: text(item.title, 255) || "Merchandise",
      value_amount: String(Math.max(Number(item.price) || 0, 0).toFixed(2)), currency_code: currency === "usd" ? "usd" : "cad",
      ...(item.sku ? { sku_code: text(item.sku, 100) } : {}),
    })),
    order_id: text(order.orderNumber ?? order.id, 100), order_store: "other", postage_type: "unknown",
  };
}

export function createChitChatsApp({
  appId, appSecret, connections, shipments, sealKey, exchange, appCall, roleIn, fetch = globalThis.fetch, base, now = () => new Date(),
  returnAddress,
}) {
  const at = () => now().toISOString();
  const ready = () => Boolean(appId && appSecret && sealKey);
  const bound = (shopId) => `chitchats:${shopId}`;
  const open = (row) => unseal(sealKey, bound(row.shopId), row.sealed);
  const clientFor = (secrets) => createChitChatsClient({ clientId: secrets.clientId, accessToken: secrets.accessToken, fetch, base });
  const idOf = (shopId, orderId) => `${shopId}~${orderId}`;

  function needReady() {
    if (!ready()) throw new SignupError(503, "Chit Chats isn't connected to Colophon yet. Try again soon.");
  }

  async function ownerOf(claims, shopId) {
    const person = personOf(claims);
    if (typeof shopId !== "string" || !SHOP.test(shopId)) throw new SignupError(400, "Pick a shop.");
    const role = await roleIn(person, shopId);
    if (role !== "owner") throw new SignupError(403, role ? "Only the shop's owner can connect Chit Chats." : "You're not on that shop's team.");
    return person;
  }

  /** Calls the app connection with this shop's key, like any app. */
  async function asApp(secrets, method, path, body, idempotencyKey) {
    const answer = await appCall({
      method, path, body,
      headers: { authorization: `Bearer ${secrets.appKey}`, "content-type": "application/json", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
    });
    return answer;
  }

  async function forget(shopId, why) {
    const row = await connections.get(shopId);
    if (row) await connections.remove(shopId);
    return { removed: Boolean(row), why };
  }

  /** Makes the Chit Chats shipment for one paid order (once). */
  async function post(row, secrets, order) {
    if (!order?.id || !ORDER.test(order.id)) return { skipped: "no order" };
    if (order.fulfillmentStatus && order.fulfillmentStatus !== "unfulfilled") return { skipped: "already sent" };
    if (/pickup|local|digital/i.test(order.fulfillmentMethod ?? "")) return { skipped: "not shipped" };
    const id = idOf(row.shopId, order.id);
    if (await shipments.get(id)) return { skipped: "already in Chit Chats" };
    const shipment = shipmentFor(order, row.parcel ?? USUAL_PARCEL);
    if (!shipment) {
      await shipments.put(id, { id, shopId: row.shopId, orderId: order.id, orderNumber: order.orderNumber ?? order.id, status: "problem", problem: "The order has no full shipping address.", createdAt: at() });
      return { skipped: "no address" };
    }
    try {
      const made = await clientFor(secrets).createShipment(shipment);
      await shipments.put(id, { id, shopId: row.shopId, orderId: order.id, orderNumber: order.orderNumber ?? order.id, shipmentId: made.id, status: "open", createdAt: at() });
      return { shipmentId: made.id };
    } catch (error) {
      if (!(error instanceof ChitChatsError)) throw error;
      // Wrong details or a refused shipment: noted so the press sees it; anything else is tried again by the next alert retry.
      if ([400, 401, 403, 404, 422].includes(error.status)) {
        await shipments.put(id, { id, shopId: row.shopId, orderId: order.id, orderNumber: order.orderNumber ?? order.id, status: "problem", problem: error.message, createdAt: at() });
        await connections.put(row.shopId, { ...row, lastProblem: { at: at(), words: error.message } });
        return { skipped: "refused" };
      }
      throw error;
    }
  }

  return {
    ready,

    /** The connect page: the owner's Chit Chats details plus the install code from the permission page. */
    async connect(claims, { shopId, code, clientId, accessToken, parcel } = {}) {
      needReady();
      const person = await ownerOf(claims, shopId);
      const usual = parcelOf(parcel);
      const secrets = { clientId: String(clientId ?? "").trim(), accessToken: String(accessToken ?? "").trim() };
      let client;
      try {
        client = clientFor(secrets);
        await client.check();
      } catch (error) {
        if (error instanceof ChitChatsError) throw new SignupError(error.status === 503 ? 503 : 400, error.message);
        throw error;
      }
      const before = await connections.get(shopId);
      let appKey = before ? open(before).appKey : null;
      if (code) {
        const swapped = await exchange({ appId, secret: appSecret, code, returnAddress });
        if (swapped.shopId !== shopId) throw new SignupError(400, "That code was for another shop. Add the app again from Settings › Apps.");
        appKey = swapped.accessToken;
      }
      if (!appKey) throw new SignupError(400, "Add Chit Chats from Settings › Apps first.");
      const row = {
        shopId, sealed: seal(sealKey, bound(shopId), { ...secrets, appKey }), clientId: secrets.clientId,
        tokenFingerprint: sha256(secrets.accessToken).slice(0, 12), parcel: usual,
        connectedAt: before?.connectedAt ?? at(), updatedAt: at(), connectedBy: person.email, lastProblem: null,
        ...(before?.emailsOff ? { emailsOff: true } : {}),
      };
      await connections.put(shopId, row);
      return { connected: true, clientId: row.clientId, parcel: usual };
    },

    /** What the connect page shows for a shop that's already connected. */
    async status(claims, { shopId } = {}) {
      await ownerOf(claims, shopId);
      if (!ready()) return { available: false, connected: false };
      const row = await connections.get(shopId);
      if (!row) return { available: true, appId, connected: false, parcel: USUAL_PARCEL };
      const waiting = await shipments.listOpen(shopId);
      return { available: true, appId, connected: true, clientId: row.clientId, parcel: row.parcel ?? USUAL_PARCEL, connectedAt: row.connectedAt, waiting: waiting.length, lastProblem: row.lastProblem ?? null, emails: !row.emailsOff };
    },

    /** The owner's choice of the morning email about late or refused orders (control-room/chitChatsNote.js); on by default. */
    async setEmails(claims, { shopId, on } = {}) {
      await ownerOf(claims, shopId);
      if (typeof on !== "boolean") throw new SignupError(400, "Say on or off.");
      const row = await connections.get(shopId);
      if (!row) throw new SignupError(409, "Connect Chit Chats first.");
      const { emailsOff: _was, ...rest } = row;
      await connections.put(shopId, { ...rest, ...(on ? {} : { emailsOff: true }), updatedAt: at() });
      return { emails: on };
    },

    async disconnect(claims, { shopId } = {}) {
      await ownerOf(claims, shopId);
      return forget(shopId, "press");
    },

    /**
     * A signed alert from the platform (POST /api/chitchats/alerts). Checks the signature like any app would; answers
     * 200 for anything it handled or doesn't need, so the platform stops retrying, and throws for a failure worth a retry.
     */
    async alert({ headers = {}, rawBody = "" }) {
      needReady();
      const given = String(headers["x-colophon-signature"] ?? "");
      const expected = alertSignature(sha256(appSecret), rawBody);
      const a = Buffer.from(given);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new SignupError(401, "That alert isn't signed by Colophon.");
      let alert;
      try { alert = JSON.parse(rawBody); } catch { throw new SignupError(400, "That alert isn't readable."); }
      const shopId = text(alert?.shopId, 63);
      if (!SHOP.test(shopId)) return { ignored: "no shop" };
      if (alert.topic === "app/uninstalled") return forget(shopId, "app removed");
      if (alert.topic !== "orders/paid") return { ignored: alert.topic };
      const row = await connections.get(shopId);
      if (!row) return { ignored: "not connected" };
      return post(row, open(row), alert.data?.order ?? alert.data);
    },

    /** The `chitchats-tracking` job: sends tracking back for shipments Chit Chats has sent. */
    async sweep() {
      const summary = { shops: 0, checked: 0, sent: 0, problems: 0 };
      if (!ready()) return { ...summary, skipped: "not connected" };
      for (const row of await connections.list()) {
        summary.shops += 1;
        let secrets;
        try { secrets = open(row); } catch { summary.problems += 1; continue; }
        const client = clientFor(secrets);
        for (const item of await shipments.listOpen(row.shopId)) {
          summary.checked += 1;
          try {
            const found = await client.getShipment(item.shipmentId);
            const status = String(found?.status ?? "").toLowerCase();
            if (ENDED.has(status)) { await shipments.put(item.id, { ...item, status: "ended", updatedAt: at() }); continue; }
            const number = text(found?.carrier_tracking_code, 100);
            if (!number || NOT_YET.has(status)) continue;
            const answer = await asApp(secrets, "POST", FULFILLMENT(item.orderId), {
              trackingCarrier: text(found.carrier, 60) || "Chit Chats", trackingNumber: number, ...(found.tracking_url ? { trackingUrl: text(found.tracking_url, 500) } : {}), shipped: true,
            }, `chitchats-${item.id}`);
            if (answer.status === 200 || answer.status === 202) {
              await shipments.put(item.id, { ...item, status: "sent", trackingNumber: number, sentAt: at(), requestId: answer.body?.request?.id ?? null });
              summary.sent += 1;
            } else if (answer.status === 401) {
              // The key was taken back (app removed): forget this shop.
              await forget(row.shopId, "app removed from the shop");
              break;
            } else {
              await shipments.put(item.id, { ...item, status: "problem", problem: answer.body?.message ?? "The shop didn't take the tracking number.", updatedAt: at() });
              summary.problems += 1;
            }
          } catch (error) {
            if (error instanceof ChitChatsError && (error.status === 401 || error.status === 403)) {
              await connections.put(row.shopId, { ...row, lastProblem: { at: at(), words: error.message } });
              summary.problems += 1;
              break;
            }
            summary.problems += 1;
          }
        }
      }
      return summary;
    },
  };
}
