// The release check's eight checks (docs/test-shop.md), in order. Each is `{ number, name, run(ctx) }` and throws, in
// plain words, when it fails; runner.js stops at the first failure.
//
// ctx = { shop, profile, urls: { site, stockroom }, inbox, session, browser, shopData, stockroomData, shopAdmin, wait,
//         now, state }
//   browser        release-check/browser.js (pagesLoad, buy, openStockroom, adminShowsOrder, walkAdmin)
//   shopData       order(id) -> order | null; book(id) -> book | null; orderEmails(id) -> [emailLog entry];
//                  testOrdersBefore(iso) -> [id]; removeOrder(id)
//   stockroomData  feed(bookId) -> { onHand } | null (websiteStockFeed); websiteOrder(id) -> doc | null (websiteOrders)
//   shopAdmin      refund(orderId) (the shop's own refundOrder, as the test owner)
//   wait(what, test, { timeoutMs }) resolves with test()'s first truthy answer, or throws "<what> didn't happen in …"
//   state          what earlier checks found (orderId, stock before), for later ones
import { TEST_PRINTED_IDS, stockedIds } from "../setup/test-catalogue.js";
import { testShopKind } from "../setup/testShopPlace.js";

/** The book test shop's item the check buys. */
export const BOOK = TEST_PRINTED_IDS[0];
/** What the check buys on a test shop: its first stocked, linked item (a book, or a tote bag on the general shop). */
export const itemFor = (shop) => stockedIds(testShopKind(shop))[0];
export const COLLECTION = "publications";
export const PAID_WITHIN_MS = 60_000;
export const STOCKROOM_WITHIN_MS = 5 * 60_000;
export const REFUND_WITHIN_MS = 2 * 60_000;
export const KEEP_TEST_ORDERS_DAYS = 7;

const stockOf = (book) => (book && Number.isFinite(Number(book.stockLevel)) ? Number(book.stockLevel) : null);

// The stockroom brings website orders in only while it is open and signed in, so it is opened once and kept open
// until the run ends (runner.js closes it).
async function stockroomOpen(ctx) {
  if (!ctx.state.stockroom) ctx.state.stockroom = await ctx.browser.openStockroom({ url: ctx.urls.stockroom, session: ctx.session });
}

/**
 * Why the test shop can't take a card yet, in plain words, or null when it can. The checkout's card form needs the
 * platform's Stripe publishable key for test mode in the shop's profile (apps/shop platformStripe); without it there is
 * nothing to buy with, so the checks that need a purchase wait instead of failing (runner.js) and the rest still run.
 */
export function cardPaymentsWaiting(profile) {
  const payments = profile?.payments;
  if (!payments) return "the test shop has no payments connected yet (setup step 7)";
  if (payments.provider !== "stripe" || payments.mode !== "platform") return null;
  if (!payments.stripe?.accountId) return "the test shop's Stripe account isn't connected yet (setup step 7)";
  if (!/^pk_test_\w{10,}$/.test(payments.stripe.testPublishableKey ?? "")) {
    return "the test shop's profile has no Stripe test publishable key, so its checkout can't show the card form (repository variable STRIPE_TEST_PUBLISHABLE_KEY, then run \"Make the test shop\")";
  }
  return null;
}

// Each check that needs a purchase says so (`needsPayment`); while card payments wait, `whenWaiting` runs instead
// when the check still has something to prove without one, and the others are marked waiting.
export const CHECKS = [
  {
    number: 1,
    name: "Home, book and collection pages load with prices",
    async run(ctx) {
      const { problems } = await ctx.browser.pagesLoad({ siteUrl: ctx.urls.site, bookSlug: itemFor(ctx.shop), collection: COLLECTION });
      if (problems.length) throw new Error(problems.join("; "));
    },
  },
  {
    number: 2,
    name: "Buy a book with Stripe's test card",
    needsPayment: true,
    // No purchase to follow: the stockroom still has to open as the test owner.
    async whenWaiting(ctx) {
      await stockroomOpen(ctx);
      return { stockroom: "opened as the test owner" };
    },
    async run(ctx) {
      // The counts before the purchase. The stockroom publishes its count only while open, so it is opened first if
      // it hasn't published one yet.
      const shopStock = stockOf(await ctx.shopData.book(itemFor(ctx.shop)));
      if (shopStock === null) throw new Error(`the test item ${itemFor(ctx.shop)} is missing or doesn't track stock; setup step 12 adds it`);
      if (shopStock < 1) throw new Error(`the test item ${itemFor(ctx.shop)} is sold out; reset the test shop's sample data in the control room`);
      let feed = await ctx.stockroomData.feed(itemFor(ctx.shop));
      if (!feed) {
        await stockroomOpen(ctx);
        feed = await ctx.wait("the stockroom publishing its count", () => ctx.stockroomData.feed(itemFor(ctx.shop)), { timeoutMs: STOCKROOM_WITHIN_MS });
      }
      ctx.state.before = { shop: shopStock, stockroom: Number(feed.onHand) };
      const { orderId } = await ctx.browser.buy({ siteUrl: ctx.urls.site, bookSlug: itemFor(ctx.shop), email: ctx.inbox });
      ctx.state.orderId = orderId;
      return { orderId };
    },
  },
  {
    number: 3,
    name: "The payment arrives and the order shows as paid",
    needsPayment: true,
    async run(ctx) {
      const order = await ctx.wait("the order showing as paid", async () => {
        const found = await ctx.shopData.order(ctx.state.orderId);
        return found?.paymentStatus === "paid" ? found : null;
      }, { timeoutMs: PAID_WITHIN_MS });
      // Only the test shop's sandbox orders may be bought here; anything else means the wrong shop or a live key.
      if (order.sandboxPayment !== true) throw new Error("the order was not paid in test mode; stop and check the test shop's payment settings");
    },
  },
  {
    number: 4,
    name: "Stock drops in the shop and in the stockroom",
    needsPayment: true,
    async run(ctx) {
      const { before, orderId } = ctx.state;
      const shopStock = stockOf(await ctx.shopData.book(itemFor(ctx.shop)));
      if (shopStock !== before.shop - 1) throw new Error(`the shop's stock went from ${before.shop} to ${shopStock}, not ${before.shop - 1}`);
      await stockroomOpen(ctx);
      await ctx.wait("the stockroom bringing the order in", async () => {
        const doc = await ctx.stockroomData.websiteOrder(orderId);
        return doc?.imported && doc.pending === false;
      }, { timeoutMs: STOCKROOM_WITHIN_MS });
      const counted = await ctx.wait("the stockroom count going down by one", async () => {
        const onHand = Number((await ctx.stockroomData.feed(itemFor(ctx.shop)))?.onHand);
        return onHand === before.stockroom - 1 ? { onHand } : null;
      }, { timeoutMs: STOCKROOM_WITHIN_MS });
      return { shop: shopStock, stockroom: counted.onHand };
    },
  },
  {
    number: 5,
    name: "The order email is sent to the test inbox",
    needsPayment: true,
    async run(ctx) {
      const inbox = ctx.inbox.toLowerCase();
      await ctx.wait("the order email being sent", async () => {
        const sent = await ctx.shopData.orderEmails(ctx.state.orderId);
        return sent.some((e) => e.status === "sent" && e.kind === "orderConfirmed" && String(e.to).toLowerCase().includes(inbox));
      }, { timeoutMs: PAID_WITHIN_MS });
    },
  },
  {
    number: 6,
    name: "The test owner signs in to the admin and sees the order",
    needsPayment: true,
    // No order to look for: the walk through every admin page still runs.
    async whenWaiting(ctx) {
      const { problems } = await ctx.browser.walkAdmin({ siteUrl: ctx.urls.site, session: ctx.session });
      return { adminPagesToFix: problems };
    },
    async run(ctx) {
      if (!(await ctx.browser.adminShowsOrder({ siteUrl: ctx.urls.site, session: ctx.session, orderId: ctx.state.orderId }))) {
        throw new Error("the admin didn't list the new order for the test owner");
      }
      // The walk through every admin page is reported, never a reason to stop a release: it is the list of what to fix.
      const { problems } = await ctx.browser.walkAdmin({ siteUrl: ctx.urls.site, session: ctx.session });
      return problems.length ? { adminPagesToFix: problems } : { adminPagesToFix: [] };
    },
  },
  {
    number: 7,
    name: "Refund the order: Stripe refunds it and stock goes back up",
    needsPayment: true,
    async run(ctx) {
      const { before, orderId } = ctx.state;
      await ctx.shopAdmin.refund(orderId);
      // "refunded" is written when Stripe's own refund event reaches the shop, so it is Stripe that says so.
      await ctx.wait("the order showing as refunded", async () => (await ctx.shopData.order(orderId))?.paymentStatus === "refunded", { timeoutMs: REFUND_WITHIN_MS });
      await ctx.wait("the shop's stock going back up", async () => stockOf(await ctx.shopData.book(itemFor(ctx.shop))) === before.shop, { timeoutMs: REFUND_WITHIN_MS });
      await ctx.wait("the stockroom count going back up", async () => Number((await ctx.stockroomData.feed(itemFor(ctx.shop)))?.onHand) === before.stockroom, { timeoutMs: STOCKROOM_WITHIN_MS });
    },
  },
  {
    number: 8,
    name: `Clean up test orders older than ${KEEP_TEST_ORDERS_DAYS} days`,
    async run(ctx) {
      const cutoff = new Date(ctx.now().getTime() - KEEP_TEST_ORDERS_DAYS * 86_400_000).toISOString();
      const old = await ctx.shopData.testOrdersBefore(cutoff);
      for (const id of old) await ctx.shopData.removeOrder(id);
      return { removed: old.length };
    },
  },
];
