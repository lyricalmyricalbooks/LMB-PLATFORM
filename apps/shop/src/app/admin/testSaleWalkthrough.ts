// Settings › Payments › Test sale walkthrough (pure, tested). Each step ticks itself from data the
// admin already has: saved payment settings, recent orders, the Stripe webhook status and the email log.
// It only reads; nothing here changes an order or a payment.

export type WalkStep = { id: string; label: string; howTo: string; done: boolean; link: "payments" | "orders" | "notifications" | "storefront" };

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function testSaleSteps({ payments, orders = [], webhook = null, emailLog = [], now = Date.now() }: {
  payments: any; orders?: any[]; webhook?: any; emailLog?: any[]; now?: number;
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
  return [
    { id: "testMode", label: "Switch on test mode", howTo: "Test mode on, then save.", done: testMode || !!order, link: "payments" },
    { id: "testKey", label: "Store a Stripe test secret key", howTo: "Paste sk_test_… under Stripe › Test keys.", done: keyStored, link: "payments" },
    { id: "order", label: "Place a test order on the shop", howTo: "Card 4242 4242 4242 4242, any future date, any CVC.", done: !!order, link: "storefront" },
    { id: "webhook", label: "Stripe confirms the payment", howTo: "It turns paid. Stuck? Check webhook below.", done: !!order && !!testWebhookAt && Date.parse(testWebhookAt) >= Date.parse(order.createdAt || ""), link: "payments" },
    { id: "email", label: "The customer gets “Order confirmed”", howTo: "See Email sender › Deliveries.", done: confirmed, link: "notifications" },
    { id: "refund", label: "Refund the test order", howTo: "Refund it from Orders.", done: !!refunded, link: "orders" },
    { id: "liveMode", label: "Switch test mode off again", howTo: "Test mode off, so real cards work.", done: !testMode && !!refunded, link: "payments" },
  ];
}
