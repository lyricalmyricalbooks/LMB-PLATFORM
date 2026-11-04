// Development-only entry for admin-fixture.html: the real admin (signed in through the dev-only ?debug=true door) with
// sample orders and books. Every other admin call answers with nothing, as an offline shop would, so the check sees
// each screen's real empty and error states too. Nothing here reaches Firestore.
import { adminApi } from "../app/admin/api";
import { A11Y_BOOKS } from "../a11yFixture/books";
import { inventoryLinkApi } from "../app/admin/inventoryLinkApi";
import { addressKey } from "../app/admin/fulfillment";

const order = (n: number, status: string, name: string) => ({
  id: `o${n}`, orderId: `FIXTURE-${n}`, status, paymentStatus: "paid", createdAt: new Date(Date.now() - n * 3_600_000).toISOString(),
  customer: { name, email: `buyer${n}@example.com` },
  items: [{ id: "b1", title: "Salt Hours", quantity: n, price: 20 }], total: 20 * n, subtotal: 20 * n, currency: "CAD",
  shippingAddress: { street: "1 Example St", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "Canada" },
  trackingKey: `key${n}`, fulfillmentStatus: status === "shipped" ? "shipped" : "unfulfilled",
});
const ORDERS = [order(1, "paid", "Ada Example"), order(2, "paid", "Ben Example"), order(3, "shipped", "Cleo Example")];

// One open order with its address reviewed, two lines and a parcel already sent ahead (Send part now, plan 24.5).
function orderDetail(id: string) {
  const base: any = ORDERS.find((o) => o.id === id);
  if (!base) return null;
  const o: any = {
    ...base, customer: { ...base.customer, address: base.shippingAddress },
    items: [...base.items, { id: "b2", title: "Night Songs", quantity: 1, price: 18 }],
    ...(id === "o2" ? { partShipments: [{ id: "p1", lines: [{ line: 0, title: "Salt Hours", quantity: 1 }], trackingCarrier: "Canada Post", trackingNumber: "7023 1100 0045", trackingUrl: "", shippedAt: new Date(Date.now() - 86_400_000).toISOString() }] } : {}),
  };
  o.operations = { addressReviewed: addressKey(o) };
  return o;
}

const known: Record<string, (...a: any[]) => any> = {
  getOrderById: async (id: string) => orderDetail(id),
  // o2's customer added a book after paying (plan 24.6): an open payment-link order that ships with it.
  getOrdersShippingWith: async (id: string) => (id === "o2" ? [{ id: "o2-add", orderId: "ADD-2", shipsWith: "o2", paymentStatus: "unpaid", status: "pending_payment", items: [{ id: "b2", title: "Night Songs", quantity: 1 }], paymentLink: { expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() } }] : []),
  getOrders: async () => ORDERS,
  getAllOrders: async () => ORDERS,
  getFulfillmentOrders: async () => ORDERS,
  getRecentFulfillmentOrders: async () => ORDERS,
  getBooks: async () => A11Y_BOOKS,
  // A screenshot of the post composer sets __fixtureWebPhotos: the composer only offers web (https) photos, which the
  // check's own page.route answers; every other check keeps the offline pictures.
  getAllBooks: async () => ((window as any).__fixtureWebPhotos
    ? A11Y_BOOKS.map((b: any, i: number) => ({ ...b, photos: (b.photos || []).map((p: any) => ({ ...p, url: `https://photos.example/cover-${i + 1}.jpg` })) }))
    : A11Y_BOOKS),
  getSettings: async () => ({}),
  // A list, though its name doesn't end like one: the Overview's alerts read it on the way back from an order.
  getRecentEmailLog: async () => [],
  getAdminBadgeCounts: async () => ({ pendingReviews: 0, unreadMessages: 0, openPrivacyRequests: 0 }),
  listNewsletterIssues: async () => [
    { id: "n2", subject: "Spring list and where to find us", status: "paused", audience: 42, sent: 18, lastError: "Sending stopped after 5 failed tries in a row. Check Settings › Email sender, then press Resume.", createdAt: new Date(Date.now() - 600_000).toISOString() },
    { id: "n1", subject: "Winter sale", status: "sent", audience: 40, sent: 40, createdAt: "2026-10-01T15:00:00Z", finishedAt: "2026-10-01T15:30:00Z" },
  ],
  // Sales channels and Social posts (plan 27.5, 27.6): Facebook & Instagram and Pinterest connected, TikTok not, and a
  // post of each kind in the list.
  social: async (step: string) => {
    const img = (A11Y_BOOKS[0] as any).photos[0].url;
    if (step === "status") return { enabled: true, networks: [
      { network: "meta", name: "Facebook & Instagram", available: true, connected: true, problem: null, accountName: "Ada Example", canSendCatalog: true,
        places: [{ id: "fb:111", kind: "facebookPage", name: "Example Press" }, { id: "ig:222", kind: "instagram", name: "@examplepress" }],
        catalog: { sentAt: new Date(Date.now() - 86_400_000).toISOString(), feedUrl: "https://example.web.app/social-product-feed.csv" } },
      { network: "pinterest", name: "Pinterest", available: true, connected: true, problem: null, accountName: "examplepress", canSendCatalog: true,
        places: [{ id: "pin:900", kind: "pinterestBoard", name: "New books" }], catalog: null },
      { network: "tiktok", name: "TikTok", available: true, connected: false, problem: null, accountName: null, places: [], catalog: null, canSendCatalog: false },
    ] };
    if (step === "posts") return { posts: [
      { id: "p1", bookId: "b1", bookTitle: "Salt Hours", imageUrl: img, caption: "Salt Hours, new this week.\n\n$20.00. Link in the post.", status: "scheduled",
        sendAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), createdAt: new Date().toISOString(), results: {},
        places: [{ id: "fb:111", kind: "facebookPage", name: "Example Press" }, { id: "ig:222", kind: "instagram", name: "@examplepress" }] },
      { id: "p2", bookId: "b2", bookTitle: "Night Songs", imageUrl: img, caption: "Night Songs is back in stock.", status: "partly",
        sendAt: new Date(Date.now() - 3_600_000).toISOString(), createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        places: [{ id: "fb:111", kind: "facebookPage", name: "Example Press" }, { id: "pin:900", kind: "pinterestBoard", name: "New books" }],
        results: { "fb:111": { state: "posted" }, "pin:900": { state: "failed", message: "Pinterest turned that down. Check the photo and the words, then try again." } } },
    ] };
    return {};
  },
  newsletterAdmin: async (op: string) => (op === "audience" ? { audience: 42 } : { ok: true, to: "owner@example.com", audience: 42 }),
};
// Lists answer with an empty list and everything else with nothing, as an offline shop would.
const quiet = (key: string) => async () => (/^(get|list)\w*(s|Orders|List)$/.test(key) || /^(getShippingProfiles|getDiscounts|getGiftCards)$/.test(key) ? [] : null);
for (const key of Object.keys(adminApi as any)) {
  const original = (adminApi as any)[key];
  if (typeof original !== "function" || key === "onAuthStateChange") continue;
  (adminApi as any)[key] = known[key] || quiet(key);
}
// Matches with the stockroom (Inventory app link): none, unless a check sets `window.__fixtureLinks` before loading.
const links = () => ((window as any).__fixtureLinks ||= {});
inventoryLinkApi.links = async () => links();
inventoryLinkApi.state = async () => ({ links: links() });
inventoryLinkApi.linkNewBook = async (bookId: string, inventoryBookId: string) => {
  links()[bookId] = { _: inventoryBookId };
  return { links: links(), already: false };
};
(window as any).__adminFixture = { orders: ORDERS };

// ?move=1 (scripts/move-check.mjs): a press that brought its shop with it and finished Get started, so the Overview shows
// Your move so far. Its firstWeek/start lives here in memory, with the calls each bring-over window makes recorded in
// `window.__adminFixture.calls`; the shop's server (oldShopApi's actions) is answered by the check's own page.route.
if (new URLSearchParams(location.search).get("move")) {
  const at = "2026-11-01T10:00:00.000Z";
  const week: any = { plan: "both", sellingToday: "online", publishes: "books", details: { at }, bring: { at, from: "online" },
    welcome: { at, themeId: "riso" }, google: { at, skipped: true }, payments: { at, skipped: true }, shipping: { at, skipped: true }, finalCheck: { at } };
  const calls: any[] = [];
  (window as any).__adminFixture.calls = calls;
  (window as any).__adminFixture.firstWeek = week;
  const record = (name: string, answer: (...a: any[]) => any) => async (...a: any[]) => { calls.push([name, ...a]); return answer(...a); };
  const api = adminApi as any;
  api.getFirstWeek = async () => JSON.parse(JSON.stringify(week));
  api.updateFirstWeek = record("updateFirstWeek", (change: any) => {
    const { done, ...rest } = change;
    Object.assign(week, rest);
    if (done) week.done = { ...week.done, ...done };
  });
  api.untickFirstWeek = record("untickFirstWeek", (id: string) => { if (week.done) delete week.done[id]; });
  api.saveCustomerNote = record("saveCustomerNote", () => undefined);
  api.getMarketingConsent = async () => ({ subscribed: new Set<string>(), optedOutHashes: new Set<string>() });
  api.addImportedSubscriber = record("addImportedSubscriber", () => true);
  api.giftCardAdmin = record("giftCardAdmin", (_op: string, body: any) => ({ added: body?.cards?.length || 0, emailed: 0, emailFailed: 0, skipped: [] }));
  api.getPages = async () => [];
  // What came over, counted from the calls above (past orders live on the check's pretend server, so none here).
  api.movedCounts = async () => ({
    customers: new Set(calls.filter((c) => c[0] === "saveCustomerNote").map((c) => c[1])).size,
    giftCards: calls.filter((c) => c[0] === "giftCardAdmin").reduce((n, c) => n + (c[2]?.cards?.length || 0), 0),
    orders: null,
  });
  // One order brought over from the old shop, sold in US dollars (plans 23.33, 23.34): its page says which file it came
  // from and shows its rate.
  ORDERS.push({
    ...order(4, "delivered", "Dee Example"), id: "past-1004", orderId: "PAST-1004", source: "import", oldOrderNumber: "#1004",
    paymentMethod: "Old shop", fulfillmentStatus: "delivered", importBatch: "run-fixture-1", importedFile: "old-shop-orders.csv",
    paidIn: { currency: "USD", total: 14.6, rate: 1.3712 }, total: 20.02, subtotal: 20.02, shippingAddress: undefined,
  } as any);
  api.getOrderById = async (id: string) => ORDERS.find((o) => o.id === id || o.orderId === id) ?? null;
  // oldShopApi asks the server with the signed-in person's token; the fixture's pretend owner has one (development only).
  (globalThis as any).__fixtureIdToken = "fixture-token";
}

const params = new URLSearchParams(location.search);
const page = params.get("page") || "";
history.replaceState(null, "", `/admin?debug=true${page ? `#${page}` : ""}`);
await import("../main");
