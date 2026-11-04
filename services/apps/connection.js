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
//
// Changing things (code plan 26.3b) goes through the shop's own rules, never around them. The platform writes a request
// to the shop's `appRequests/<id>`; the shop applies it with its own checks (apps/shop/functions/appRequests.js) and
// writes the answer on the same document. The call waits a few seconds for it, else answers 202 with the request's id:
//
//   POST /api/apps/v1/orders/<id>/fulfillment   write_orders   { trackingCarrier, trackingNumber, trackingUrl?, shipped? }
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

/** An order as an app sees it: what was bought and where it ships; email and phone only with read_customers. */
export function order(id, data, granted) {
  const customer = data.customer ?? {};
  const address = customer.address ?? data.shippingAddress ?? null;
  const out = {
    id, orderNumber: text(data.orderId) ?? id, createdAt: text(data.createdAt), currency: text(data.currency),
    paymentStatus: text(data.paymentStatus), status: text(data.status), fulfillmentStatus: text(data.fulfillmentStatus) ?? "unfulfilled",
    fulfillmentMethod: text(data.fulfillmentMethod) ?? text(data.deliveryMethod), shippingMethod: text(data.shippingMethod),
    items: (Array.isArray(data.items) ? data.items : []).map((item) => ({
      productId: text(item?.bookId ?? item?.id ?? item?.productId), variantId: text(item?.variantId), title: text(item?.title) ?? "",
      sku: text(item?.sku), quantity: num(item?.quantity) ?? 1, price: num(item?.price),
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
  installs, shopData, registry, now = () => new Date(), sleep = (ms) => new Promise((done) => setTimeout(done, ms)), waitMs = WAIT_MS,
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
      if (before.appId !== install.appId) throw new SignupError(409, "Use a different Idempotency-Key.");
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
