// A Square shop never says "Stripe" to the press or the shopper (code plan 5.2). Two checks:
// 1. With a Square shop's profile, the admin's order list, alerts, Ready to sell, payment checks, test-sale steps and
//    dashboard links name Square.
// 2. Every word the admin screens, the server's order messages and its emails show is read for "Stripe": each one must
//    either come from `providerName()` or sit in code only a Stripe shop reaches, marked `Stripe shops only` on its
//    line. An exact "Stripe" compared or listed (a card order's stored paymentMethod) is a value, not a word shown.
// The Stripe shop's own words are unchanged: providerName() is "Stripe" there.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
// TypeScript 7 (the compiler) has no JS API; Microsoft's @typescript/typescript6 keeps the classic parser for tools like this.
import ts from "@typescript/typescript6";

vi.mock("../../lib/shopProfile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/shopProfile")>();
  const square = { ...actual.DEFAULT_SHOP_PROFILE, payments: { provider: "square" as const, mode: "platform" as const } };
  return {
    ...actual,
    shopProfile: square,
    providerName: (source: any = square) => actual.providerName(source),
    paysOnSquare: (profile: any = square) => actual.paysOnSquare(profile),
    platformCardsProvider: (profile: any = square) => actual.platformCardsProvider(profile),
    platformTakesCards: (profile: any = square) => actual.platformTakesCards(profile),
  };
});

const { rowStatus } = await import("./ordersDesk");
const { buildAdminAlerts, settingsAlerts } = await import("./adminAlerts");
const { launchReadiness } = await import("./launchReadiness");
const { paymentHealth } = await import("./paymentHealth");
const { testSaleSteps } = await import("./testSaleWalkthrough");
const { providerDashboardUrl, providerName } = await import("./providerWords");
const fulfillment = await import("./fulfillment");

const NOW = Date.parse("2026-10-28T12:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const say = (value: unknown) => JSON.stringify(value);

describe("a Square shop's admin names Square", () => {
  it("the shop's provider is Square, and its dashboard is Square's", () => {
    expect(providerName()).toBe("Square");
    expect(providerDashboardUrl({ stripeMode: "live" }, "payments/sqpay_P1")).toBe("https://squareup.com/dashboard/sales/transactions");
    expect(providerDashboardUrl({ stripeMode: "test" }, "payments/sqpay_P1")).toBe("https://squareupsandbox.com/dashboard/sales/transactions");
  });

  it("order history: every row status", () => {
    const rows = [
      { paymentStatus: "unpaid", reconciliationPending: { provider: "stripe", providerStatus: "paid" }, stripePaymentIntentId: "sqpay_P1", items: [] },
      { paymentStatus: "paid", duplicatePayments: [{ paymentIntentId: "sqpay_P2" }], items: [] },
      { paymentStatus: "paid", disputeStatus: "needs_response", items: [] },
      { paymentStatus: "paid", disputeStatus: "under_review", items: [] },
      { paymentStatus: "unpaid", paymentMismatch: { paidAfterHold: true }, items: [] },
      { paymentStatus: "paid", partiallyRefunded: true, items: [] },
    ].map((o) => rowStatus(o).text);
    expect(rows.join(" | ")).not.toMatch(/Stripe/);
    expect(rows.join(" | ")).toMatch(/Square/);
  });

  it("alerts on every admin page", () => {
    const orders = [
      { id: "a", paymentStatus: "unpaid", paymentMismatch: { provider: "square" }, createdAt: ago(60) },
      { id: "b", paymentStatus: "paid", duplicatePayments: [{ paymentIntentId: "sqpay_P2" }], createdAt: ago(60) },
      { id: "c", paymentStatus: "unpaid", stripeCheckoutSessionId: "sqlink_L1", createdAt: ago(60) },
      { id: "d", paymentStatus: "paid", disputeStatus: "needs_response", createdAt: ago(60) },
      { id: "e", paymentStatus: "paid", partiallyRefunded: true, createdAt: ago(60) },
    ];
    const alerts = buildAdminAlerts(orders, { lastFailureAt: ago(5) }, NOW);
    expect(alerts.map((a) => a.id)).toEqual(expect.arrayContaining(["mismatch", "paid-twice", "unpaid-stripe", "dispute", "webhook", "partial-refund"]));
    expect(say(alerts)).not.toMatch(/Stripe/);
    expect(say(settingsAlerts({ payments: { testMode: true } }))).not.toMatch(/Stripe/);
  });

  it("Ready to sell, the payment checks and the test sale, even with old Stripe keys left in the settings", () => {
    const payments = { testMode: true, stripe: { connected: true, publicKey: "", testPublicKey: "pk_bad", publicSecretLeak: false } };
    const settings = { payments, storeName: "Moth Press" };
    const items = launchReadiness({ settings, books: [], shippingProfiles: [], emailLog: [], orders: [], platformCards: "square", platformAccount: { provider: "square", connected: true, chargesEnabled: true } as any });
    expect(say(items)).not.toMatch(/Stripe/);
    expect(say(paymentHealth(payments, true))).not.toMatch(/Stripe/);
    expect(say(testSaleSteps({ platform: "square" } as any))).not.toMatch(/Stripe/);
  });

  it("refunds and dispatch: a disputed payment is settled in Square", () => {
    const disputed = { paymentStatus: "paid", disputeStatus: "needs_response", items: [{ id: "b", quantity: 1 }] };
    const said = Object.values(fulfillment).filter((f): f is (o: any) => unknown => typeof f === "function" && f.length <= 2)
      .map((f) => { try { return f(disputed); } catch { return null; } });
    expect(say(said)).not.toMatch(/Stripe/);
    expect(say(said)).toMatch(/settled in Square/);
  });
});

// ── Every word shown, read from the source ─────────────────────────────────────────────────────────────────────────

const SHOP = join(__dirname, "..", "..", "..");
const MARKER = "Stripe shops only";
// The admin screens a Square shop opens (Stripe's own-keys screens, like Webhook health, are reached only from the
// Stripe card in Settings › Payments, which a Square shop never shows), the server's order, refund and alert messages
// and its emails.
const SCREENS = [
  "src/app/admin/OrderDetail.tsx", "src/app/admin/OrdersDesk.tsx", "src/app/admin/ordersDesk.ts", "src/app/admin/fulfillment.ts",
  "src/app/admin/adminAlerts.ts", "src/app/admin/api.ts", "src/app/admin/Dashboard.tsx", "src/app/admin/ShopSettings.tsx",
  "src/app/admin/PlatformPaymentsCard.tsx", "src/app/admin/platformPayments.ts", "src/app/admin/launchReadiness.ts",
  "src/app/admin/paymentHealth.ts", "src/app/admin/testSaleWalkthrough.ts", "src/app/admin/BookkeeperDesk.tsx",
  "src/app/admin/providerWords.ts",
];
const SERVER = [
  "functions/index.js", "functions/orderRequests.js", "functions/fulfillmentGuard.js", "functions/paymentSweep.js",
  "functions/paymentPages.js", "functions/settlePayment.js", "functions/partialRefund.js", "functions/emailMoney.js",
];

// An exact "Stripe" that is compared or listed: the stored paymentMethod of a card order, never shown.
function isStoredValue(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind)) return true;
  return ts.isArrayLiteralExpression(parent) && ts.isPropertyAccessExpression(parent.parent) && parent.parent.name.text === "includes";
}

function strayStripe(path: string): string[] {
  const file = join(SHOP, path);
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    // Developer logs never reach a press or a shopper.
    if (ts.isCallExpression(node) && /^console\./.test(node.expression.getText())) return;
    let words: string | null = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) words = node.text;
    else if (ts.isJsxText(node)) words = node.getText();
    if (words !== null && /\bStripe\b/.test(words) && !(words === "Stripe" && isStoredValue(node))) {
      const first = sf.getLineAndCharacterOfPosition(node.getStart()).line;
      const last = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
      if (!lines.slice(first, last + 1).some((line) => line.includes(MARKER))) found.push(`${relative(SHOP, file)}:${first + 1} “${words.trim().replace(/\s+/g, " ").slice(0, 120)}”`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("no word the press or shopper reads says Stripe on a Square shop", () => {
  it("admin screens: every Stripe comes from providerName() or is in code only a Stripe shop reaches", () => {
    expect(SCREENS.flatMap(strayStripe)).toEqual([]);
  });

  it("server: order history lines, refund and alert messages, and emails name the shop's provider", () => {
    expect(SERVER.flatMap(strayStripe)).toEqual([]);
  });

  it("the checkout's own error words name no provider", () => {
    const copy = readFileSync(join(SHOP, "src/app/features/site/storeCopy.ts"), "utf8");
    const defaults = [...copy.matchAll(/default: "([^"]*)"/g)].map((m) => m[1]).filter((d) => /\bStripe\b/.test(d));
    // Only the hosted-redirect note, which a Square shop replaces with its own "pay on Square's page" note.
    expect(defaults).toEqual(["After you click “Pay securely,” you’ll complete your card payment on Stripe’s secure checkout."]);
  });

  it("the checker sees a stray word", () => {
    const sf = ts.createSourceFile("x.ts", 'const a = "Refund it in Stripe."; if (m === "Stripe") {}', ts.ScriptTarget.Latest, true);
    const texts: string[] = [];
    const walk = (n: ts.Node) => { if (ts.isStringLiteral(n) && /\bStripe\b/.test(n.text) && !(n.text === "Stripe" && isStoredValue(n))) texts.push(n.text); ts.forEachChild(n, walk); };
    walk(sf);
    expect(texts).toEqual(["Refund it in Stripe."]);
  });
});
