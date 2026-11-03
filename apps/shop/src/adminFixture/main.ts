// Development-only entry for admin-fixture.html: the real admin (signed in through the dev-only ?debug=true door) with
// sample orders and books. Every other admin call answers with nothing, as an offline shop would, so the check sees
// each screen's real empty and error states too. Nothing here reaches Firestore.
import { adminApi } from "../app/admin/api";
import { A11Y_BOOKS } from "../a11yFixture/books";

const order = (n: number, status: string, name: string) => ({
  id: `o${n}`, orderId: `FIXTURE-${n}`, status, paymentStatus: "paid", createdAt: new Date(Date.now() - n * 3_600_000).toISOString(),
  customer: { name, email: `buyer${n}@example.com` },
  items: [{ id: "b1", title: "Salt Hours", quantity: n, price: 20 }], total: 20 * n, subtotal: 20 * n, currency: "CAD",
  shippingAddress: { street: "1 Example St", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "Canada" },
  trackingKey: `key${n}`, fulfillmentStatus: status === "shipped" ? "shipped" : "unfulfilled",
});
const ORDERS = [order(1, "paid", "Ada Example"), order(2, "paid", "Ben Example"), order(3, "shipped", "Cleo Example")];

const known: Record<string, (...a: any[]) => any> = {
  getOrders: async () => ORDERS,
  getAllOrders: async () => ORDERS,
  getFulfillmentOrders: async () => ORDERS,
  getRecentFulfillmentOrders: async () => ORDERS,
  getBooks: async () => A11Y_BOOKS,
  getAllBooks: async () => A11Y_BOOKS,
  getSettings: async () => ({}),
  getAdminBadgeCounts: async () => ({ pendingReviews: 0, unreadMessages: 0, openPrivacyRequests: 0 }),
  listNewsletterIssues: async () => [
    { id: "n2", subject: "Spring list and where to find us", status: "paused", audience: 42, sent: 18, lastError: "Sending stopped after 5 failed tries in a row. Check Settings › Email sender, then press Resume.", createdAt: new Date(Date.now() - 600_000).toISOString() },
    { id: "n1", subject: "Winter sale", status: "sent", audience: 40, sent: 40, createdAt: "2026-10-01T15:00:00Z", finishedAt: "2026-10-01T15:30:00Z" },
  ],
  newsletterAdmin: async (op: string) => (op === "audience" ? { audience: 42 } : { ok: true, to: "owner@example.com", audience: 42 }),
};
// Lists answer with an empty list and everything else with nothing, as an offline shop would.
const quiet = (key: string) => async () => (/^(get|list)\w*(s|Orders|List)$/.test(key) || /^(getShippingProfiles|getDiscounts|getGiftCards)$/.test(key) ? [] : null);
for (const key of Object.keys(adminApi as any)) {
  const original = (adminApi as any)[key];
  if (typeof original !== "function" || key === "onAuthStateChange") continue;
  (adminApi as any)[key] = known[key] || quiet(key);
}
(window as any).__adminFixture = { orders: ORDERS };

const params = new URLSearchParams(location.search);
const page = params.get("page") || "";
history.replaceState(null, "", `/admin?debug=true${page ? `#${page}` : ""}`);
await import("../main");
