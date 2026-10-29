// Stockists (code plan 12.10): shops that resell the press's products and pay wholesale prices, by card.
//
//   stockists/{email}        { status: "approved" | "paused", name, createdAt }   admin-only; the owner approves an email
//   books/{id}/private/admin { wholesalePrice }                                    the product's wholesale price (private)
//   order.stockistId         the stockists/ id the order is priced for              written here (Admin SDK), never by the browser
//
// A signed-in, verified person whose email is an approved stockist asks to price their order at wholesale
// (`claimStockistPricing`); every pricing path (priceOrder) then reads `order.stockistId`, checks the registry again, and
// charges the wholesale price where the product has one lower than the shop's price. Without a stockist nothing changes.

const idOf = (email) => String(email || "").trim().toLowerCase();
const validId = (id) => /^[^\s/@]+@[^\s/@]+\.[^\s/@]{2,}$/.test(String(id || "")) && String(id).length <= 254;

/** The approved stockist for an id (a lower-case email), or null. */
async function loadStockist(db, id) {
  if (!validId(id)) return null;
  const snap = await db.collection("stockists").doc(id).get();
  const data = snap.exists ? snap.data() : null;
  return data && data.status === "approved" ? { id, name: String(data.name || "").slice(0, 200) } : null;
}

/**
 * The wholesale unit price for a line, or null when this product has none that beats `basePrice`. `wholesale` is the
 * product's private wholesale price; `book` gives the retail price it is measured against. An edition (variant) pays the
 * product's wholesale share of its own price, the same rule as the printed line sheet (admin/lineSheet.ts).
 */
function wholesaleUnitPrice({ book, variant, wholesale, basePrice }) {
  const w = Number(wholesale);
  const retail = Number(book && book.retailPrice);
  if (!(w > 0) || !(retail > 0) || !Number.isFinite(basePrice)) return null;
  const price = variant ? Math.round(basePrice * (w / retail) * 100) / 100 : w;
  return price > 0 && price < basePrice ? price : null;
}

/** A product's private wholesale price (cached per book for one pricing run). */
async function privateWholesale(db, bookId, cache = new Map()) {
  if (!cache.has(bookId)) {
    const snap = await db.collection("books").doc(bookId).collection("private").doc("admin").get();
    cache.set(bookId, snap.exists ? Number(snap.data()?.wholesalePrice) || 0 : 0);
  }
  return cache.get(bookId);
}

/** Why an order can't be priced for this person, or null. */
function claimProblem({ order, stockist, identity }) {
  if (!identity || identity.email_verified !== true) return "sign_in";
  if (!order) return "not_found";
  if (!stockist) return "not_a_stockist";
  if (String(order.paymentStatus || "").toLowerCase() === "paid" || ["cancelled", "completed"].includes(String(order.status || "").toLowerCase())) return "closed";
  return null;
}

function stockistActions({ db, LIMITS, hitLimit, canViewOrder, orderRequestIdentity, orderRequestKey }) {
  // The shopper signs in as the stockist's email and asks for wholesale prices on the order they are checking out.
  // Same proof of ownership as the rest of checkout (the order's key or their sign-in); the answer says whether it applies.
  async function handleStockistPricing(req, res) {
    const { orderId } = req.body || {};
    if (typeof orderId !== "string" || !orderId || orderId.length > 64 || orderId.includes("/")) return res.status(400).json({ error: "not_found" });
    if (!(await hitLimit(db, "track", req, LIMITS.track))) return res.status(429).json({ error: "too_many" });
    try {
      const identity = await orderRequestIdentity(req);
      const orderRef = db.collection("orders").doc(orderId);
      const snap = await orderRef.get();
      const order = snap.exists ? snap.data() : null;
      if (order && !canViewOrder(order, { key: orderRequestKey(req), identity })) return res.status(403).json({ error: "access_required" });
      const stockist = identity && identity.email_verified === true ? await loadStockist(db, idOf(identity.email)) : null;
      const problem = claimProblem({ order, stockist, identity });
      if (problem) return res.status(problem === "not_found" ? 404 : problem === "sign_in" ? 401 : problem === "closed" ? 409 : 200).json(problem === "not_a_stockist" ? { wholesale: false } : { error: problem });
      if (order.stockistId !== stockist.id) await orderRef.update({ stockistId: stockist.id, updatedAt: new Date().toISOString() });
      return res.status(200).json({ wholesale: true, name: stockist.name });
    } catch (err) {
      console.error("Stockist pricing failed:", err);
      return res.status(500).json({ error: "failed" });
    }
  }
  return { handleStockistPricing };
}

module.exports = { idOf, validId, loadStockist, wholesaleUnitPrice, privateWholesale, claimProblem, stockistActions };
