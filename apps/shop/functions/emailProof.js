// Proof that the shop may email an address a visitor typed into a public form (abandoned-cart
// reminders, back-in-stock alerts). Anyone can write a cart or a signup naming a stranger, so
// the address only counts when the shop already has evidence its owner is a real customer:
//   1. a checkout attempt: an order for that address carrying a field only the server writes
//      once it opens a payment (firestore.rules stop a browser creating orders with them), or
//   2. a signed-in account whose email Firebase Auth has verified.
const SERVER_PAYMENT_FIELDS = ["stripePaymentIntentId", "stripeCheckoutSessionId", "expectedAmountMinor", "paypalOrderId", "stripeIntentKey"];

const cleanEmail = email => String(email || "").trim().toLowerCase();

// Pure: does this order document show the server opened a payment for the buyer?
const isCheckoutAttempt = order => !!order && typeof order === "object"
  && SERVER_PAYMENT_FIELDS.some(field => order[field] !== undefined && order[field] !== null && order[field] !== "");

// db: Firestore, authApi: admin.auth(). Never throws; unknown means "no proof".
async function hasOwnershipProof(db, authApi, email) {
  const address = cleanEmail(email);
  if (!address) return false;
  try {
    const orders = await db.collection("orders").where("customer.email", "==", address).limit(10).get();
    if (orders.docs.some(doc => isCheckoutAttempt(doc.data()))) return true;
  } catch (err) {
    console.warn("Could not look up checkout attempts for email proof:", err.message);
  }
  try {
    const user = await authApi.getUserByEmail(address);
    if (user && user.emailVerified === true && cleanEmail(user.email) === address) return true;
  } catch { /* no account with this address */ }
  return false;
}

module.exports = { SERVER_PAYMENT_FIELDS, isCheckoutAttempt, hasOwnershipProof };
