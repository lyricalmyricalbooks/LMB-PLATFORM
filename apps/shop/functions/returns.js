// Pure return transitions. Stock and refunds stay in the verified refund path.
const { isPhysicalItem } = require("./shared/localFulfillment");
const fail = message => { const error = new Error(message); error.status = 409; throw error; };
function physicalLines(order) {
  return (order.items || []).map((item, index) => ({ ...item, index })).filter(item => isPhysicalItem({ ...item, format: item.format || item.variantName || "" }));
}
function returnTransition(order, current, action, input, now, actor) {
  if (!["approved", "rejected", "received", "inspected", "closed"].includes(action)) fail("Invalid return action.");
  if (order.customerRequest?.type !== "return") fail("This order has no return request.");
  // A request the shop already closed (marked handled or declined) is never reopened by a later click.
  if (order.customerRequest.status !== "open" && !(current?.state === action)) fail("This return request is closed. Refresh the order.");
  if (order.paymentStatus !== "paid") fail("Only paid orders can progress through a return.");
  if (order.refundRequest) fail("A refund has already been requested. Reconcile it before changing the return.");
  const state = current?.state || "requested";
  if (action === state) return current;
  // Close an approved/received/inspected return with no refund (parcel never came, or nothing to refund).
  // Money and stock are untouched; the request leaves Needs attention. A refund can still be made later.
  if (action === "closed") {
    if (!["approved", "received", "inspected"].includes(state)) fail("Only an approved return can be closed this way. Decline or close a new request instead.");
    return { ...(current || {}), state: "closed", updatedAt: now, actor, closedAt: now, closedFrom: state };
  }
  const next = { ...(current || {}), state: action, updatedAt: now, actor };
  if (action === "approved" && state === "requested") {
    if (!physicalLines(order).length) fail("This order has no physical books to return. Use the refund workflow instead.");
    const instructions = String(input.instructions || "").trim();
    if (!instructions || instructions.length > 3000) fail("Enter return instructions (up to 3000 characters).");
    return { ...next, instructions, approvedAt: now };
  }
  if (action === "rejected" && state === "requested") {
    const instructions = String(input.instructions || "").trim();
    if (!instructions || instructions.length > 3000) fail("Explain the decision to the customer.");
    return { ...next, instructions, rejectedAt: now };
  }
  if (action === "received" && state === "approved") return { ...next, receivedAt: now };
  if (action === "inspected" && state === "received") {
    const lines = physicalLines(order);
    if (!Array.isArray(input.inspection) || input.inspection.length !== lines.length) fail("Inspect every physical order line before a full-order refund.");
    const inspection = lines.map(item => {
      const rows = input.inspection.filter(row => row?.index === item.index);
      const row = rows[0];
      // Fewer copies than ordered may come back (a partial return); never more.
      if (rows.length !== 1 || !Number.isInteger(row?.quantity) || row.quantity < 0 || row.quantity > Number(item.quantity)) fail("Enter how many copies of each book came back, between zero and the quantity ordered.");
      if (row.quantity > 0 && !["resellable", "damaged", "mixed"].includes(row.condition)) fail("Select the condition of each book that came back.");
      const restockQuantity = row.quantity === 0 || row.condition === "damaged" ? 0 : row.condition === "resellable" ? row.quantity : row.restockQuantity;
      if (!Number.isInteger(restockQuantity) || restockQuantity < 0 || restockQuantity > row.quantity) fail("Enter how many inspected copies can be resold, between zero and the received quantity.");
      return { index: item.index, id: item.id, variantId: item.variantId || null, ordered: Number(item.quantity), quantity: row.quantity, condition: row.quantity ? row.condition : "not_returned", restockQuantity };
    });
    if (!inspection.some(row => row.quantity > 0)) fail("Enter at least one copy that came back.");
    return { ...next, inspectedAt: now, inspection };
  }
  fail("The return changed or this step is out of order. Refresh the order.");
}
function publicReturn(current) {
  return Object.fromEntries(["state", "instructions", "approvedAt", "rejectedAt", "closedAt", "receivedAt", "inspectedAt", "updatedAt"].filter(key => current?.[key] !== undefined).map(key => [key, current[key]]));
}
const DISPATCHED = ["shipped", "out_for_delivery", "delivered", "completed", "picked_up", "collected"];
const dispatched = order => DISPATCHED.includes(String(order.fulfillmentStatus || "").toLowerCase()) || DISPATCHED.includes(String(order.status || "").toLowerCase());
function returnRestockItems(order, returnCase) {
  const openReturn = order.customerRequest?.type === "return" && order.customerRequest.status === "open";
  // No return in progress, a declined one, or books that never left the shop: the admin's restock choice covers every line.
  if (["rejected", "closed"].includes(order.returnProgress?.state) || (!order.returnProgress && (!openReturn || !dispatched(order)))) return order.items || [];
  if (returnCase?.state !== "inspected") return [];
  // A box set goes back as the books inside it (the order line keeps its components).
  return (returnCase.inspection || []).map(row => {
    const line = Number.isInteger(row.index) ? (order.items || [])[row.index] : null;
    const components = line && line.id === row.id && Array.isArray(line.components) && line.components.length ? { components: line.components } : {};
    return { id: row.id, variantId: row.variantId, quantity: row.restockQuantity ?? (row.condition === "resellable" ? row.quantity : 0), ...components };
  }).filter(row => row.quantity > 0);
}
module.exports = { physicalLines, returnTransition, publicReturn, returnRestockItems };
