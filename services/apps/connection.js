// The app connection (code plan 26.3, docs/app-store.md): how an installed app reads a press's shop. Apps never get the
// shop's own keys. They call the platform with the key from the install (26.2); the platform checks the key and the
// permissions the owner agreed to, keeps each app to a fair number of calls, then reads that one shop's data with its own
// access and answers only the fields the permissions allow.
//
//   createAppConnection({ installs, shopData, registry, now })  ->  handle(request) for /api/apps/v1/...
//
// The key comes as `Authorization: Bearer cak_…` (or `X-Colophon-Access-Key`). Calls, all GET, JSON answers:
//
//   /api/apps/v1/shop                     read_shop       the shop's name, web address and currency
//   /api/apps/v1/products?limit&after     read_products   products (stock too with read_inventory), by id
//   /api/apps/v1/products/<id>            read_products
//   /api/apps/v1/inventory?limit&after    read_inventory  how many of each product (and each variant)
//   /api/apps/v1/orders?limit&after&since&status   read_orders   paid orders, newest first; email and phone only
//                                                                 with read_customers
//   /api/apps/v1/orders/<id>              read_orders
//   /api/apps/v1/subscribers?since&limit&after   read_customers   people on the newsletter who confirmed it and haven't
//                                                                  unsubscribed, oldest first by when they joined
//   /api/apps/v1/unsubscribes?since&limit&after  read_customers   opt-outs as { id: sha256 of the lower-case email, at }:
//                                                                  an app checks the addresses it holds, never sees others
//   /api/apps/v1/alerts?since&limit&after any             the alerts queued for this app, oldest first, whether or not
//                                                         they reached it: a way to catch up after its server was down
//
// Changing things (code plan 26.3b) goes through the shop's own rules, never around them. The platform writes a request
// to the shop's `appRequests/<id>`; the shop applies it with its own checks (apps/shop/functions/appRequests.js) and
// writes the answer on the same document. The call waits a few seconds for it, else answers 202 with the request's id:
//
//   POST /api/apps/v1/orders/<id>/fulfillment   write_orders   { trackingCarrier, trackingNumber, trackingUrl?, shipped? }
//   POST /api/apps/v1/inventory/<productId>     write_inventory  { change, variantId?, expected? }: add or take copies;
//                                                                with `expected`, only if the stock is still that
//   POST /api/apps/v1/subscribers/unsubscribe   write_customers  { email }: unsubscribed in the app (an email marketing
//                                                                app), so the shop records the opt-out too
//   GET  /api/apps/v1/requests/<id>             any            the answer: { status: waiting|done|refused, result, reason }
//
// An `Idempotency-Key` header makes a retried POST return the first request instead of making a second one.
//
// Nothing here ever returns cost prices, card or payment details, private notes or test orders.
import { createHash, randomBytes } from "node:crypto";
import { SignupError } from "../../signup/signup.js";

export const PER_MINUTE = 120;
export const MAX_PAGE = 250;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
export const WAIT_MS = 5000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The shop's opt-out id for an address (apps/shop/functions/marketingOptOut.js optOutId). */
export const optOutId = (email) => createHash("sha256").update(String(email ?? "").trim().toLowerCase()).digest("hex");
const short = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
/** A request as the app sees it. */
const requestView = (id, data) => ({ id, op: data.op, status: data.status ?? "waiting", result: data.result ?? null, reason: data.reason ?? "", createdAt: data.createdAt, answeredAt: data.answeredAt ?? null });

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const text = (value) => (typeof value === "string" ? value : null);

/** A product as an app sees it. Stock only with read_inventory. */
export function product(id, data, granted) {
  const out = {
    id, title: text(data.title) ?? "", subtitle: text(data.subtitle), description: text(data.description), kind: text(data.kind) ?? "book",
    sku: text(data.sku), isbn: text(data.isbn), price: num(data.retailPrice), status: text(data.status) ?? "published",
    categories: Array.isArray(data.categories) ? data.categories.filter((c) => typeof c === "string") : [],
    options: Array.isArray(data.options) ? data.options : [],
    variants: Array.isArray(data.variants) ? data.variants.map((v) => ({ id: text(v?.id), sku: text(v?.sku), price: num(v?.price ?? v?.retailPrice), picks: v?.picks ?? v?.options ?? null })) : [],
    photos: Array.isArray(data.photos) ? data.photos.map((p) => (typeof p === "string" ? p : text(p?.url))).filter(Boolean) : [],
    weight: text(data.weight), updatedAt: text(data.updatedAt),
  };
  if (granted.includes("read_inventory")) {
    out.stock = num(data.stockLevel) ?? 0;
    out.variants = out.variants.map((v, i) => ({ ...v, stock: num(data.variants[i]?.stockLevel ?? data.variants[i]?.stock) }));
  }
  return out;
}

/** How many of each product (and variant) the shop has. */
export const stockOf = (id, data) => ({
  productId: id, sku: text(data.sku), available: num(data.stockLevel) ?? 0,
  variants: Array.isArray(data.variants) ? data.variants.map((v) => ({ id: text(v?.id), sku: text(v?.sku), available: num(v?.stockLevel ?? v?.stock) ?? 0 })) : [],
});

/**
 * Copies of line `index` still to go in a parcel: the quantity less copies sent ahead (`partShipments`) and copies
 * taken off with a partial refund (`partialRestockedItems`), as the shop's own Orders page counts them
 * (apps/shop/src/app/admin/fulfillment.ts copiesToSend).
 */
function copiesToSend(data, index) {
  const whole = (n) => Math.max(0, Math.floor(Number(n) || 0));
  let gone = 0;
  for (const part of Array.isArray(data?.partShipments) ? data.partShipments : []) for (const l of part?.lines || []) if (Number(l?.line) === index) gone += whole(l.quantity);
  for (const r of Array.isArray(data?.partialRestockedItems) ? data.partialRestockedItems : []) if (Number(r?.index) === index) gone += whole(r.quantity);
  return Math.max(0, whole(data?.items?.[index]?.quantity ?? 1) - gone);
}

/** An order as an app sees it: what was bought and where it ships; email and phone only with read_customers. */
export function order(id, data, granted) {
  const customer = data.customer ?? {};
  const address = customer.address ?? data.shippingAddress ?? null;
  const out = {
    id, orderNumber: text(data.orderId) ?? id, createdAt: text(data.createdAt), currency: text(data.currency),
    paymentStatus: text(data.paymentStatus), status: text(data.status), fulfillmentStatus: text(data.fulfillmentStatus) ?? "unfulfilled",
    fulfillmentMethod: text(data.fulfillmentMethod) ?? text(data.deliveryMethod), shippingMethod: text(data.shippingMethod),
    // quantityToSend: what a shipping app should pack, after copies sent ahead or refunded and put back in stock.
    items: (Array.isArray(data.items) ? data.items : []).map((item, index) => ({
      productId: text(item?.bookId ?? item?.id ?? item?.productId), variantId: text(item?.variantId), title: text(item?.title) ?? "",
      sku: text(item?.sku), quantity: num(item?.quantity) ?? 1, quantityToSend: copiesToSend(data, index), price: num(item?.price),
    })),
    totals: { subtotal: num(data.subtotal), shipping: num(data.shippingCost ?? data.shipping), tax: num(data.tax ?? data.taxAmount), discount: num(data.discountAmount), total: num(data.total) },
    shipTo: address ? { name: text(customer.name) ?? text(address.name), line1: text(address.line1), line2: text(address.line2), city: text(address.city), region: text(address.state ?? address.province ?? address.region), postalCode: text(address.postalCode ?? address.postal_code), country: text(address.country) } : null,
    tracking: data.trackingNumber ? { carrier: text(data.trackingCarrier), number: text(data.trackingNumber), url: text(data.trackingUrl) } : null,
  };
  if (granted.includes("read_customers")) out.customer = { name: text(customer.name), email: text(customer.email), phone: text(customer.phone) };
  return out;
}

/** One page of rows sorted by `key`, after the cursor. */
function page(rows, { limit, after }, key = (row) => row.id) {
  const size = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), MAX_PAGE);
  const start = after ? rows.findIndex((row) => key(row) === after) + 1 : 0;
  const slice = rows.slice(Math.max(start, 0), Math.max(start, 0) + size);
  const more = start + size < rows.length;
  return { slice, next: more && slice.length ? key(slice.at(-1)) : null };
}

export function createAppConnection({
  installs, shopData, registry, outbox = null, now = () => new Date(), sleep = (ms) => new Promise((done) => setTimeout(done, ms)), waitMs = WAIT_MS,
  newRequestId = () => `req_${randomBytes(12).toString("hex")}`,
}) {
  // Calls per install in the current minute. Each server keeps its own count, so a busy app spread over servers gets a
  // little more; the point is that one app can't flood a shop.
  const counts = new Map();

  function spend(installId) {
    const minute = Math.floor(now().getTime() / 60_000);
    const seen = counts.get(installId);
    const used = seen?.minute === minute ? seen.used + 1 : 1;
    counts.set(installId, { minute, used });
    if (counts.size > 10_000) for (const [id, entry] of counts) if (entry.minute < minute) counts.delete(id);
    if (used > PER_MINUTE) {
      const error = new SignupError(429, `Too many calls: at most ${PER_MINUTE} a minute for each shop. Try again shortly.`);
      error.retryAfter = 60 - (Math.floor(now().getTime() / 1000) % 60);
      throw error;
    }
  }

  function need(install, scope) {
    if (!install.granted.includes(scope)) throw new SignupError(403, `This needs the ${scope} permission, which the shop's owner didn't give your app.`);
  }

  const keyOf = (headers = {}) => {
    const find = (name) => Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
    const bearer = String(find("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    return bearer || String(find("x-colophon-access-key") ?? "").trim();
  };

  const header = (headers = {}, name) => Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];

  /** Writes a request into the shop, then waits a little for the shop's answer. A repeated Idempotency-Key reuses it. */
  async function ask(install, op, input, headers) {
    const key = short(String(header(headers, "idempotency-key") ?? ""), 200);
    const id = key ? `req_${createHash("sha256").update(`${install.installId}\n${key}`).digest("hex").slice(0, 24)}` : newRequestId();
    const path = `appRequests/${id}`;
    const request = { op, appId: install.appId, appName: install.appName ?? install.appId, installId: install.installId, input, createdAt: now().toISOString() };
    try {
      await shopData.create(install.shopId, path, request);
    } catch (error) {
      const before = key ? await shopData.get(install.shopId, path) : null;
      if (!before) throw error;
      // A key reused for a different call (another order, other tracking) would answer with the first call's result.
      if (before.appId !== install.appId || before.op !== op || JSON.stringify(before.input ?? null) !== JSON.stringify(input ?? null)) {
        throw new SignupError(409, "That Idempotency-Key was already used for a different request. Use a new key for each change.");
      }
    }
    for (let waited = 0; ; waited += 500) {
      const data = await shopData.get(install.shopId, path);
      if (data?.status || waited >= waitMs) return { status: data?.status ? 200 : 202, body: { request: requestView(id, data ?? request) } };
      await sleep(500);
    }
  }

  async function change(install, parts, body, headers) {
    const [what, id, action, ...rest] = parts;
    if (what === "orders" && ID.test(id ?? "") && action === "fulfillment" && !rest.length) {
      need(install, "write_orders");
      const input = {
        orderId: id, trackingCarrier: short(body?.trackingCarrier, 80), trackingNumber: short(body?.trackingNumber, 100),
        trackingUrl: short(body?.trackingUrl, 500), shipped: body?.shipped !== false,
      };
      if (!input.trackingCarrier || !input.trackingNumber) throw new SignupError(400, "Give trackingCarrier and trackingNumber.");
      if (input.trackingUrl && !input.trackingUrl.startsWith("https://")) throw new SignupError(400, "trackingUrl must start with https://");
      return ask(install, "order.dispatch", input, headers);
    }
    if (what === "inventory" && ID.test(id ?? "") && action === undefined) {
      need(install, "write_inventory");
      const change = Number(body?.change);
      const expected = body?.expected === undefined || body?.expected === null ? undefined : Number(body.expected);
      if (!Number.isInteger(change) || change === 0 || Math.abs(change) > 10_000) throw new SignupError(400, "Give change as a whole number between -10000 and 10000, not 0.");
      if (expected !== undefined && (!Number.isInteger(expected) || expected < 0)) throw new SignupError(400, "expected must be a whole number, 0 or more.");
      const variantId = short(body?.variantId, 128);
      if (variantId && !ID.test(variantId)) throw new SignupError(400, "That isn't a variant id.");
      return ask(install, "inventory.adjust", { productId: id, variantId, change, ...(expected === undefined ? {} : { expected }) }, headers);
    }
    if (what === "subscribers" && id === "unsubscribe" && action === undefined && !rest.length) {
      need(install, "write_customers");
      const email = short(body?.email, 254).toLowerCase();
      if (!EMAIL.test(email)) throw new SignupError(400, "Give the email address.");
      return ask(install, "newsletter.unsubscribe", { email }, headers);
    }
    throw new SignupError(404, "There's nothing here.");
  }

  const visibleOrder = (data) => data && data.isTest !== true && ["paid", "refunded", "partially_refunded"].includes(data.paymentStatus);

  async function answer(install, parts, query) {
    const shopId = install.shopId;
    const [what, id, ...rest] = parts;
    if (rest.length || (id !== undefined && !ID.test(id))) throw new SignupError(404, "There's nothing here.");

    if (what === "shop" && id === undefined) {
      need(install, "read_shop");
      const row = (await registry.getShop(shopId)) ?? {};
      const website = (await shopData.get(shopId, "settings/website").catch(() => null)) ?? {};
      return { shop: { id: shopId, name: row.pressName ?? website.storeName ?? shopId, webAddress: row.domain ? `https://${row.domain}` : row.siteUrl ?? null, currency: website.currency ?? row.currency ?? null } };
    }

    if (what === "products") {
      need(install, "read_products");
      if (id) {
        const data = await shopData.get(shopId, `books/${id}`);
        if (!data) throw new SignupError(404, "There's no such product.");
        return { product: product(id, data, install.granted) };
      }
      const rows = (await shopData.list(shopId, "books")).sort((a, b) => (a.id < b.id ? -1 : 1));
      const { slice, next } = page(rows, query);
      return { products: slice.map((row) => product(row.id, row.data, install.granted)), next };
    }

    if (what === "inventory" && id === undefined) {
      need(install, "read_inventory");
      const rows = (await shopData.list(shopId, "books")).sort((a, b) => (a.id < b.id ? -1 : 1));
      const { slice, next } = page(rows, query);
      return { inventory: slice.map((row) => stockOf(row.id, row.data)), next };
    }

    if (what === "alerts" && id === undefined && outbox) {
      const since = typeof query.since === "string" ? query.since : "";
      const rows = (await outbox.listByInstall(install.installId))
        .filter((alert) => alert.status !== "dropped" && (!since || String(alert.createdAt) >= since))
        .sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1));
      const { slice, next } = page(rows, query);
      return { alerts: slice.map((alert) => ({ id: alert.id, topic: alert.topic, createdAt: alert.createdAt, data: alert.data, delivered: alert.status === "sent" })), next };
    }

    if (what === "subscribers" && id === undefined) {
      need(install, "read_customers");
      const since = typeof query.since === "string" ? query.since : "";
      const rows = since ? await shopData.find(shopId, "newsletter", { where: [["subscribedAt", ">=", since]], limit: 5000 }) : await shopData.list(shopId, "newsletter");
      const optedOut = new Set((await shopData.list(shopId, "marketing-optout")).map((row) => row.id));
      const when = (row) => String(row.data.subscribedAt ?? row.data.confirmedAt ?? "");
      const list = rows
        .map((row) => ({ ...row, email: String(row.data?.email ?? row.id).trim().toLowerCase() }))
        // Only people who confirmed (newsletter.js mayMail: older rows with no status count) and never unsubscribed.
        .filter((row) => row.data && row.data.status !== "pending" && EMAIL.test(row.email) && !optedOut.has(optOutId(row.email)))
        .sort((a, b) => (when(a) === when(b) ? (a.id < b.id ? -1 : 1) : when(a) < when(b) ? -1 : 1));
      const { slice, next } = page(list, query);
      return { subscribers: slice.map((row) => ({ email: row.email, subscribedAt: when(row) || null, source: text(row.data.source) })), next };
    }

    if (what === "unsubscribes" && id === undefined) {
      need(install, "read_customers");
      const since = typeof query.since === "string" ? query.since : "";
      const rows = (since ? await shopData.find(shopId, "marketing-optout", { where: [["at", ">=", since]], limit: 5000 }) : await shopData.list(shopId, "marketing-optout"))
        .sort((a, b) => (String(a.data?.at ?? "") === String(b.data?.at ?? "") ? (a.id < b.id ? -1 : 1) : String(a.data?.at ?? "") < String(b.data?.at ?? "") ? -1 : 1));
      const { slice, next } = page(rows, query);
      return { unsubscribes: slice.map((row) => ({ id: row.id, at: text(row.data?.at) })), next };
    }

    if (what === "requests" && id) {
      const data = await shopData.get(shopId, `appRequests/${id}`);
      if (!data || data.appId !== install.appId) throw new SignupError(404, "There's no such request.");
      return { request: requestView(id, data) };
    }

    if (what === "orders") {
      need(install, "read_orders");
      if (id) {
        const data = await shopData.get(shopId, `orders/${id}`);
        if (!visibleOrder(data)) throw new SignupError(404, "There's no such order.");
        return { order: order(id, data, install.granted) };
      }
      const since = typeof query.since === "string" ? query.since : "";
      const status = typeof query.status === "string" ? query.status : "";
      const rows = (await shopData.list(shopId, "orders"))
        .filter((row) => visibleOrder(row.data))
        .filter((row) => !since || String(row.data.createdAt ?? "") >= since)
        .filter((row) => !status || (row.data.fulfillmentStatus ?? "unfulfilled") === status)
        .sort((a, b) => (String(a.data.createdAt ?? "") < String(b.data.createdAt ?? "") ? 1 : -1));
      const { slice, next } = page(rows, query);
      return { orders: slice.map((row) => order(row.id, row.data, install.granted)), next };
    }

    throw new SignupError(404, "There's nothing here.");
  }

  /** Answers one call under /api/apps/v1 (server/http.js request shape: method, path, headers, query). */
  return async function handle(request) {
    try {
      if (!["GET", "POST"].includes(request.method)) throw new SignupError(405, "Use GET or POST.");
      const install = await installs.authenticate(keyOf(request.headers));
      if (!install) throw new SignupError(401, "That key isn't valid. It may have been removed: install the app again.");
      spend(install.installId);
      const [pathOnly, search = ""] = String(request.path ?? "").split("?");
      const parts = pathOnly.replace(/^\/api\/apps\/v1\/?/, "").replace(/\/+$/, "").split("/").filter(Boolean).map(decodeURIComponent);
      const query = request.query ?? Object.fromEntries(new URLSearchParams(search));
      if (request.method === "POST") {
        const done = await change(install, parts, request.body, request.headers);
        return { status: done.status, body: { ok: true, ...done.body } };
      }
      return { status: 200, body: { ok: true, ...(await answer(install, parts, query)) } };
    } catch (error) {
      if (Number.isInteger(error?.status) && error.status < 500) {
        return { status: error.status, headers: error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined, body: { ok: false, message: error.message } };
      }
      return { status: 500, body: { ok: false, message: "Something went wrong on our side. Try again in a minute." } };
    }
  };
}
