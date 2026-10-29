// A few orders for the sample press, so the admin's Orders, Overview and Customers pages, the stockroom's sales and the
// practice inbox aren't empty the first time the demo opens. Each one is placed the way a shopper's is: the order is
// started as a guest (the shop's own rules decide), the shop's server code prices it and asks for the card payment, the
// practice card pays, and the shop's webhook marks it paid and sends its emails. Then, like the press would: one is
// shipped, one is refunded through the admin's refund, one shopper asks to cancel, and one, delivered, asks to return
// a shirt for another size (the sample press takes returns).
//
// Only run the first time the sample press is added (seed.js). Everything goes to the local emulators and the
// practice services; the people and addresses are made up.
import { randomBytes } from "node:crypto";
import { DEMO_OWNER, DEMO_PROJECT, PORTS, url } from "./config.js";

const FIRESTORE = url(PORTS.firestore, `/v1/projects/${DEMO_PROJECT}/databases/(default)/documents`);
const FUNCTION = (name) => url(PORTS.functions, `/${DEMO_PROJECT}/us-central1/${name}`);
const ORIGIN = url(PORTS.shop);
const IDENTITY = url(PORTS.auth, "/identitytoolkit.googleapis.com/v1");

/** The made-up orders: who bought what (product id, variant id, quantity) and what happens next. */
export const SAMPLE_ORDERS = Object.freeze([
  { name: "Priya Shah", email: "priya@example.com", address: { street: "12 Harbour St", city: "Halifax", state: "NS", zip: "B3J 1A1" },
    lines: [["low-tide-almanac", null, 1], ["moth-tote-bag", "moth-tote-natural", 1]], then: "ship" },
  { name: "Jun Park", email: "jun@example.com", address: { street: "400 Main St", city: "Vancouver", state: "BC", zip: "V6A 2T7" },
    lines: [["night-buses-t-shirt", "night-buses-tee-m-black", 1], ["moth-enamel-pin", null, 2]], then: null },
  { name: "Lena Kowalski", email: "lena@example.com", address: { street: "88 Rue Saint-Paul", city: "Montréal", state: "QC", zip: "H2Y 1H3" },
    lines: [["the-quiet-field", null, 1], ["night-buses", null, 1]], then: "refund" },
  { name: "Tom Reyes", email: "tom@example.com", address: { street: "9 Elm Ave", city: "Winnipeg", state: "MB", zip: "R3C 0V8" },
    lines: [["salt-and-static", null, 1], ["low-tide-print", "low-tide-print-a2", 1]], then: "cancel" },
  { name: "Noor Haddad", email: "noor@example.com", address: { street: "21 King St W", city: "Toronto", state: "ON", zip: "M5H 1A1" },
    lines: [["night-buses-t-shirt", "night-buses-tee-l-bone", 1]], then: "return" },
]);

const value = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } };
};
const plain = (v) => {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, plain(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(plain);
  return null;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const newOrderId = () => {
  const letters = () => randomBytes(3).toString("base64").replace(/[^A-Z0-9]/gi, "X").slice(0, 4).toUpperCase();
  return `${letters()}-${100000 + Math.floor(Math.random() * 900000)}-${letters()}`;
};

async function call(fetch, name, body, headers = {}) {
  const response = await fetch(FUNCTION(name), { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers }, body: JSON.stringify(body) });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { text }; }
  if (!response.ok) throw new Error(`${name} answered ${response.status}: ${text.slice(0, 200)}`);
  return json;
}

async function readOrder(fetch, orderId) {
  const response = await fetch(`${FIRESTORE}/orders/${orderId}`, { headers: { Authorization: "Bearer owner" } });
  if (!response.ok) return null;
  return plain({ mapValue: (await response.json()) });
}

/** The demo owner's sign-in token, with the owner role on it (seed.js ensureOwner gave the account the role). */
async function ownerToken(fetch) {
  const idToken = JSON.stringify({ sub: DEMO_OWNER.uid, email: DEMO_OWNER.email, email_verified: true, name: DEMO_OWNER.name });
  const response = await fetch(`${IDENTITY}/accounts:signInWithIdp?key=demo-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestUri: ORIGIN, postBody: new URLSearchParams({ id_token: idToken, providerId: "google.com" }).toString(), returnSecureToken: true }),
  });
  return (await response.json()).idToken;
}

/**
 * Places one order as a shopper and pays it with the practice card. `products` maps an id to its shop data (for the
 * titles, prices and pictures checkout copies onto the order). Returns `{ orderId, trackingKey }` once it is paid.
 */
export async function placeSampleOrder(fetch, order, products, confirm) {
  const orderId = newOrderId();
  const trackingKey = randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const items = order.lines.map(([id, variantId, quantity]) => {
    const product = products[id];
    const variant = variantId ? product.variants.find((v) => v.id === variantId) : null;
    return {
      id, variantId, variantName: variant?.name ?? null, title: product.title, price: variant?.price ?? (product.isOnSale ? product.salePrice : product.retailPrice),
      quantity, photoUrl: variant?.photoUrl ?? product.photos?.[0]?.url ?? "", stripePriceId: null, shippingProfileId: null,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const data = {
    customer: { name: order.name, email: order.email, phone: "", address: { ...order.address, unit: "", country: "Canada" }, billingAddress: { state: "", country: "Canada" } },
    customerId: null, referralSource: "direct", addressVerified: true, addressError: "",
    items, subtotal, discount: 0, shipping: 5, shippingMethod: "Standard Shipping", fulfillmentSelection: { method: "shipping", optionId: "legacy" },
    tax: 0, total: subtotal + 5, status: "pending_payment", paymentStatus: "unpaid", paymentMethod: "Stripe", paymentInstructions: "",
    testMode: true, appliedDiscount: null, metadata: { userAgent: "Colophon walkthrough", platform: "web" },
    orderId, trackingKey, createdAt: now, updatedAt: now, activity: [{ type: "event", message: "Order created", createdAt: now }],
  };
  // As a guest: no sign-in, so the shop's own order rules decide, as they do for a shopper.
  const created = await fetch(`${FIRESTORE}/orders?documentId=${orderId}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: value(data).mapValue.fields }),
  });
  if (!created.ok) throw new Error(`The shop refused the order: ${(await created.text()).slice(0, 300)}`);
  const intent = await call(fetch, "createStripeCheckoutSession", { orderId, key: trackingKey, currency: "cad", returnUrl: `${ORIGIN}/checkout?order_id=${orderId}&success=true`, paymentElement: true });
  if (!intent.clientSecret) throw new Error(`No card payment for ${orderId}: ${JSON.stringify(intent).slice(0, 200)}`);
  const paid = await confirm({ client_secret: intent.clientSecret, card: "4242 4242 4242 4242" });
  if (paid.error) throw new Error(paid.error.message);
  for (let i = 0; i < 40; i++) {
    const saved = await readOrder(fetch, orderId);
    if (saved?.paymentStatus === "paid") return { orderId, trackingKey };
    await sleep(500);
  }
  throw new Error(`${orderId} was paid but the shop didn't mark it paid in time.`);
}

/** Places the sample orders and plays out what happens next. Returns a line per order, for the console. */
export async function placeSampleOrders({ fetch, confirm }) {
  const products = {};
  for (const id of new Set(SAMPLE_ORDERS.flatMap((order) => order.lines.map(([bookId]) => bookId)))) {
    const response = await fetch(`${FIRESTORE}/books/${id}`, { headers: { Authorization: "Bearer owner" } });
    if (!response.ok) throw new Error(`The sample product ${id} isn't in the shop.`);
    products[id] = plain({ mapValue: await response.json() });
  }
  const done = [];
  let token = null;
  for (const order of SAMPLE_ORDERS) {
    const { orderId, trackingKey } = await placeSampleOrder(fetch, order, products, confirm);
    if (order.then === "ship" || order.then === "return") {
      const now = new Date().toISOString();
      const saved = await readOrder(fetch, orderId);
      const delivered = order.then === "return";
      const patch = { status: delivered ? "delivered" : "shipped", fulfillmentStatus: delivered ? "delivered" : "shipped", trackingNumber: "7023 4567 8901 2345", trackingCarrier: "Canada Post", shippedAt: now, ...(delivered ? { deliveredAt: now } : {}), updatedAt: now,
        activity: [...(saved.activity ?? []), { type: "event", message: `Shipped with Canada Post (tracking 7023 4567 8901 2345)${delivered ? ", and delivered" : ""}.`, createdAt: now }] };
      const mask = Object.keys(patch).map((k) => `updateMask.fieldPaths=${k}`).join("&");
      await fetch(`${FIRESTORE}/orders/${orderId}?${mask}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: value(patch).mapValue.fields }) });
      // Then the shopper asks for a return from the order page, as the shop's own order request does.
      if (delivered) await call(fetch, "createStripeCheckoutSession", { action: "orderRequest", orderId, type: "return", message: "The L is too big. Could I swap it for an M?", key: trackingKey });
    } else if (order.then === "refund") {
      token ??= await ownerToken(fetch);
      await call(fetch, "refundOrder", { orderId, reason: "requested_by_customer", restock: true }, { Authorization: `Bearer ${token}` });
    } else if (order.then === "cancel") {
      await call(fetch, "createStripeCheckoutSession", { action: "orderRequest", orderId, type: "cancel", message: "Sorry, I ordered the wrong size of print.", key: trackingKey });
    }
    done.push(`${orderId} ${order.name}${order.then ? ` (${({ ship: "shipped", refund: "refunded", cancel: "asked to cancel", return: "delivered, asked to return" })[order.then]})` : ""}`);
  }
  return done;
}
