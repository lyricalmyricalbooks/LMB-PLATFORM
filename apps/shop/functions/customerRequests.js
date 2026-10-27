// Customer self-service requests: cancel an order, ask for a return/refund, and privacy
// (copy of my data / delete my data). Requests never change money or stock by themselves:
// they land in Orders › Needs attention (order requests) or Settings › Privacy requests,
// and the shop decides. Pure helpers here; the handlers live in index.js.

// Shoppers may only ask to cancel, before the order ships; the shop takes no returns (owner's
// decision, October 2026). Returns already open are still worked in Orders › Customer return.
const ORDER_REQUEST_TYPES = ["cancel"];
const PRIVACY_REQUEST_TYPES = ["export", "delete"];
const SHIPPED = ["shipped", "out_for_delivery", "delivered", "completed", "picked_up", "collected"];

const clean = (value, max) => String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

// Why this order can't take this request, or null.
function orderRequestProblem(order, type) {
  if (!order) return "not_found";
  if (!ORDER_REQUEST_TYPES.includes(type)) return "invalid";
  if (order.customerRequest && order.customerRequest.status === "open") return "already_open";
  const status = String(order.status || "").toLowerCase();
  const payment = String(order.paymentStatus || "").toLowerCase();
  if (status === "cancelled" || status === "refunded" || payment.startsWith("refund")) return "closed";
  const fulfillment = String(order.fulfillmentStatus || "").toLowerCase();
  // A bought label puts a tracking number on the order while the parcel is still in the shop,
  // so only the order's own status says whether it has left.
  const shipped = SHIPPED.includes(fulfillment) || SHIPPED.includes(status);
  if (shipped) return "already_shipped";
  return null;
}

function orderRequestRecord(type, message, now = new Date().toISOString()) {
  return { type, message: clean(message, 1000), status: "open", createdAt: now };
}

function privacyRequestRecord(email, type, message, now = new Date().toISOString()) {
  const normalized = clean(email, 254).toLowerCase();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/.test(normalized)) return null;
  if (!PRIVACY_REQUEST_TYPES.includes(type)) return null;
  return { email: normalized, type, message: clean(message, 1000), status: "open", createdAt: now };
}

module.exports = { ORDER_REQUEST_TYPES, PRIVACY_REQUEST_TYPES, orderRequestProblem, orderRequestRecord, privacyRequestRecord };
