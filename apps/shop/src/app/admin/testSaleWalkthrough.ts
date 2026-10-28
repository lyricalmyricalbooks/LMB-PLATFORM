// Settings › Payments › Test sale walkthrough (pure, tested). Each step ticks itself from data the
// admin already has: saved payment settings, recent orders, the Stripe webhook status and the email log.
// It only reads; nothing here changes an order or a payment.
// A platform shop (plan 7.4) holds no Stripe key, so its four steps run on a practice order instead (plan 7.6).

export type WalkStep = { id: string; label: string; howTo: string; done: boolean; link: "payments" | "orders" | "notifications" | "storefront" | "practice" };
export type PracticeStatus = { active: boolean; refusal?: string } | null;

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function testSaleSteps({ payments, orders = [], webhook = null, emailLog = [], now = Date.now(), platform = null, practice = null }: {
  payments: any; orders?: any[]; webhook?: any; emailLog?: any[]; now?: number;
  /** The platform's card provider (lib/shopProfile platformCardsProvider), or null for a shop with its own keys. */
  platform?: "stripe" | "square" | null; practice?: PracticeStatus;
}): WalkStep[] {
  const testMode = payments?.testMode === true;
  const keyStored = !!(payments?.stripe?.testSecretKeyStored || payments?.stripe?.testSecretKey);
  const recentTest = (orders || [])
    .filter((o) => o?.isTest === true && ["paid", "refunded"].includes(o.paymentStatus))
    .filter((o) => now - Date.parse(o.paidAt || o.createdAt || "") <= WEEK)
    .sort((a, b) => Date.parse(b.paidAt || b.createdAt || "") - Date.parse(a.paidAt || a.createdAt || ""));
  const order = recentTest[0] || null;
  const testWebhookAt = webhook?.test?.lastReceivedAt || (webhook?.lastMode === "test" ? webhook?.lastReceivedAt : null);
  const orderNumber = String(order?.orderId || order?.id || "");
  const email = String(order?.customer?.email || "").toLowerCase();
  const confirmed = !!order && (emailLog || []).some((row) => row?.status === "sent"
    && String(Array.isArray(row.to) ? row.to.join(",") : row.to || "").toLowerCase().includes(email)
    && orderNumber && String(row.subject || "").includes(orderNumber));
  const refunded = !!order && (order.paymentStatus === "refunded" || order.status === "refunded" || order.refundedAt);
  if (platform) {
    const card = platform === "square" ? "4111 1111 1111 1111 on Square’s page" : "4242 4242 4242 4242";
    return [
      { id: "practice", label: "Start a practice order", howTo: practice?.refusal === "shop_open"
        ? "Only while your shop is private: set Store status to Maintenance or the wall first."
        : "Press Try a practice order. It lasts an hour, and only you can use it.", done: practice?.active === true || !!order, link: "practice" },
      { id: "order", label: "Pay with the practice card", howTo: `Card ${card}, any future date, any security code.`, done: !!order, link: "storefront" },
      { id: "email", label: "See the confirmation email", howTo: "See Email sender › Deliveries.", done: confirmed, link: "notifications" },
      { id: "refund", label: "Refund it", howTo: "Refund it from Orders, and put the books back in stock.", done: !!refunded, link: "orders" },
    ];
  }
  return [
    { id: "testMode", label: "Switch on test mode", howTo: "Test mode on, then save.", done: testMode || !!order, link: "payments" },
    { id: "testKey", label: "Store a Stripe test secret key", howTo: "Paste sk_test_… under Stripe › Test keys.", done: keyStored, link: "payments" }, // Stripe shops only (own keys)
    { id: "order", label: "Place a test order on the shop", howTo: "Card 4242 4242 4242 4242, any future date, any CVC.", done: !!order, link: "storefront" },
    { id: "webhook", label: "Stripe confirms the payment", howTo: "It turns paid. Stuck? Check webhook below.", done: !!order && !!testWebhookAt && Date.parse(testWebhookAt) >= Date.parse(order.createdAt || ""), link: "payments" }, // Stripe shops only (own keys)
    { id: "email", label: "The customer gets “Order confirmed”", howTo: "See Email sender › Deliveries.", done: confirmed, link: "notifications" },
    { id: "refund", label: "Refund the test order", howTo: "Refund it from Orders.", done: !!refunded, link: "orders" },
    { id: "liveMode", label: "Switch test mode off again", howTo: "Test mode off, so real cards work.", done: !testMode && !!refunded, link: "payments" },
  ];
}
