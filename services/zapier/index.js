// Colophon on Zapier (code plan 26.13, docs/app-store.md › 26.13). This folder is pushed to Zapier as its own app with
// Zapier's command line (`zapier push`, README.md); the platform never runs it. It is an app like any other on the app
// store: the press connects it on Colophon's permission page, and every call goes through the app connection
// (services/apps/connection.js) with the shop's key, so it can do only what the owner allowed.
//
//   Triggers  new_paid_order         a paid order (newest first)
//             new_newsletter_reader  someone confirmed the shop's newsletter
//             product_changed        a product added or changed
//   Actions   add_tracking           mark an order sent, with its tracking
//             change_stock           add or take copies of a product
//
// process.env.CLIENT_ID and CLIENT_SECRET are the app's id and secret on Colophon (scripts in README.md print them);
// COLOPHON_URL is the platform's address.
const BASE = () => String(process.env.COLOPHON_URL || "https://lmb-platform-prod.web.app").replace(/\/+$/, "");
const V1 = () => `${BASE()}/api/apps/v1`;
const PAGE = 100;

const addKey = (request, z, bundle) => {
  if (bundle.authData && bundle.authData.access_token) request.headers = { ...(request.headers || {}), Authorization: `Bearer ${bundle.authData.access_token}` };
  return request;
};

/** Colophon answers { ok: false, message } on a problem: show the press that message. */
const checkAnswer = (response, z) => {
  if (response.status < 400) return response;
  const said = (response.json && response.json.message) || `Colophon answered ${response.status}.`;
  if (response.status === 401) throw new z.errors.Error(`${said} Connect Colophon again in Zapier.`, "AuthenticationError", 401);
  if (response.status === 429) throw new z.errors.ThrottledError(said, 60);
  throw new z.errors.Error(said, "ColophonError", response.status);
};

const get = async (z, path, params) => (await z.request({ url: `${V1()}${path}`, params })).json;

/** Up to `pages` pages of a list, following `next`. */
async function pagesOf(z, path, field, params = {}, pages = 5) {
  const rows = [];
  let after = "";
  for (let n = 0; n < pages; n += 1) {
    const answer = await get(z, path, { ...params, limit: String(PAGE), ...(after ? { after } : {}) });
    rows.push(...(answer[field] || []));
    if (!answer.next) break;
    after = answer.next;
  }
  return rows;
}

const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();

const authentication = {
  type: "oauth2",
  oauth2Config: {
    // Colophon's permission page: the press signs in, picks their shop when they own more than one, and says yes.
    authorizeUrl: {
      url: `${BASE()}/account/install.html`,
      params: { app: "{{process.env.CLIENT_ID}}", back: "{{bundle.inputData.redirect_uri}}", state: "{{bundle.inputData.state}}" },
    },
    getAccessToken: async (z, bundle) => {
      const response = await z.request({
        url: `${BASE()}/api/apps/oauth/token`, method: "POST",
        body: { appId: process.env.CLIENT_ID, secret: process.env.CLIENT_SECRET, code: bundle.inputData.code, returnAddress: bundle.inputData.redirect_uri },
      });
      // A shop's key doesn't run out; it stops when the owner removes the app in Settings › Apps.
      return { access_token: response.json.accessToken, shop_id: response.json.shopId };
    },
    autoRefresh: false,
  },
  test: async (z) => (await get(z, "/shop")).shop,
  connectionLabel: (z, bundle) => (bundle.inputData && bundle.inputData.name) || "Colophon shop",
};

const order = {
  key: "new_paid_order",
  noun: "Order",
  display: { label: "New Paid Order", description: "Starts when a customer pays for an order in your shop." },
  operation: {
    perform: async (z) => (await get(z, "/orders", { limit: String(PAGE) })).orders || [],
    sample: {
      id: "o1", orderNumber: "1001", createdAt: "2026-11-11T12:00:00.000Z", currency: "CAD", paymentStatus: "paid", fulfillmentStatus: "unfulfilled",
      items: [{ productId: "b1", title: "Moth Songs", quantity: 1, quantityToSend: 1, price: 24 }],
      totals: { subtotal: 24, shipping: 8, tax: 4.16, total: 36.16 },
      customer: { name: "Bea Reader", email: "bea@example.com" },
      shipTo: { name: "Bea Reader", line1: "1 Main St", city: "Toronto", region: "ON", postalCode: "M6G 1A1", country: "CA" },
    },
    outputFields: [
      { key: "orderNumber", label: "Order number" }, { key: "customer__name", label: "Customer name" },
      { key: "customer__email", label: "Customer email" }, { key: "totals__total", label: "Total", type: "number" },
    ],
  },
};

const reader = {
  key: "new_newsletter_reader",
  noun: "Newsletter Reader",
  display: { label: "New Newsletter Reader", description: "Starts when someone confirms your shop's newsletter." },
  operation: {
    perform: async (z) => {
      // Oldest first from Colophon; Zapier wants the newest first, each with an id.
      const rows = await pagesOf(z, "/subscribers", "subscribers", { since: daysAgo(30) });
      return rows.reverse().map((row) => ({ id: `${row.email}|${row.subscribedAt || ""}`, ...row }));
    },
    sample: { id: "bea@example.com|2026-11-11T12:00:00.000Z", email: "bea@example.com", subscribedAt: "2026-11-11T12:00:00.000Z", source: "footer" },
    outputFields: [{ key: "email", label: "Email" }, { key: "subscribedAt", label: "Joined", type: "datetime" }],
  },
};

const product = {
  key: "product_changed",
  noun: "Product",
  display: { label: "Product Added or Changed", description: "Starts when a product is added or changed in your shop." },
  operation: {
    perform: async (z) => {
      const rows = await pagesOf(z, "/products", "products");
      return rows
        .sort((a, b) => (String(a.updatedAt) < String(b.updatedAt) ? 1 : -1))
        .map((row) => ({ ...row, productId: row.id, id: `${row.id}|${row.updatedAt || ""}` }));
    },
    sample: { id: "b1|2026-11-11T12:00:00.000Z", productId: "b1", title: "Moth Songs", price: 24, stock: 12, updatedAt: "2026-11-11T12:00:00.000Z" },
    outputFields: [{ key: "productId", label: "Product ID" }, { key: "title", label: "Title" }, { key: "stock", label: "Copies in stock", type: "integer" }],
  },
};

/** Hidden: the product dropdown on Change Stock. */
const productList = {
  key: "product_list",
  noun: "Product",
  display: { label: "Products", description: "Your products, for picking one.", hidden: true },
  operation: {
    perform: async (z) => (await pagesOf(z, "/products", "products", {}, 10)).map((row) => ({ id: row.id, title: row.title || row.id })),
  },
};

/** A change waits briefly for the shop's answer; a refusal is shown, a wait is fine. */
function settled(answer, z) {
  const request = answer.request || {};
  if (request.status === "refused") throw new z.errors.Error(request.reason || "Your shop didn't accept that.", "Refused", 400);
  return { id: request.id, status: request.status, result: request.result, reason: request.reason };
}

const tracking = {
  key: "add_tracking",
  noun: "Tracking",
  display: { label: "Add Tracking to an Order", description: "Marks an order sent and emails your customer the tracking." },
  operation: {
    inputFields: [
      { key: "orderId", label: "Order", required: true, dynamic: "new_paid_order.id.orderNumber", helpText: "The order, from a step before this one or from the list." },
      { key: "trackingCarrier", label: "Carrier", required: true, helpText: "For example Canada Post." },
      { key: "trackingNumber", label: "Tracking number", required: true },
      { key: "trackingUrl", label: "Tracking link", required: false, helpText: "Starts with https://" },
    ],
    perform: async (z, bundle) => {
      const { orderId, trackingCarrier, trackingNumber, trackingUrl } = bundle.inputData;
      const response = await z.request({
        url: `${V1()}/orders/${encodeURIComponent(orderId)}/fulfillment`, method: "POST",
        headers: { "Idempotency-Key": `zapier-${orderId}-${trackingNumber}` },
        body: { trackingCarrier, trackingNumber, ...(trackingUrl ? { trackingUrl } : {}) },
      });
      return settled(response.json, z);
    },
    sample: { id: "req_1", status: "done", result: "dispatched", reason: "" },
  },
};

const stock = {
  key: "change_stock",
  noun: "Stock",
  display: { label: "Change Stock", description: "Adds or takes copies of a product." },
  operation: {
    inputFields: [
      { key: "productId", label: "Product", required: true, dynamic: "product_list.id.title" },
      { key: "change", label: "Copies to add", type: "integer", required: true, helpText: "Use a minus to take copies off, for example -2." },
    ],
    perform: async (z, bundle) => {
      const response = await z.request({
        url: `${V1()}/inventory/${encodeURIComponent(bundle.inputData.productId)}`, method: "POST",
        body: { change: Number(bundle.inputData.change) },
      });
      return settled(response.json, z);
    },
    sample: { id: "req_2", status: "done", result: "12", reason: "" },
  },
};

module.exports = {
  version: require("./package.json").version,
  platformVersion: require("./package.json").dependencies["zapier-platform-core"],
  authentication,
  beforeRequest: [addKey],
  afterResponse: [checkAnswer],
  triggers: { [order.key]: order, [reader.key]: reader, [product.key]: product, [productList.key]: productList },
  creates: { [tracking.key]: tracking, [stock.key]: stock },
};
