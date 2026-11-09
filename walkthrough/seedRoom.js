// A day in the life of the platform, for the control room in the walkthrough (plan 9.11): presses paying, on a trial
// and paused, open repairs, support requests, an account recovery waiting to be checked, a breach written down and
// dealt with, and a few things in the activity log. Every step goes through the platform's own code (sign-up, the shop
// maker, billing on the pretend Stripe, the repair queue, the support inbox, recovery, the breach register), so what
// the control room shows is what those parts would really write. Made-up people and money only.
import { adminClaims, person } from "./world.js";
import { TERMS_VERSION } from "../terms/terms.js";

/** Presses owned by other people than owner@example.com (whose account page keeps its three). */
export const ROOM_PRESSES = Object.freeze([
  { pressName: "Kestrel Books", address: "kestrel", plan: "both", owner: person("uid-kit", "kit@example.com", "Kit Kestrel"), pays: true, publishes: "books" },
  { pressName: "Lantern Zines", address: "lantern-zines", plan: "shop", owner: person("uid-lou", "lou@example.com", "Lou Lantern"), pays: true, publishes: "zines" },
  { pressName: "Driftwood Prints", address: "driftwood", plan: "stockroom", owner: person("uid-dee", "dee@example.com", "Dee Driftwood"), card: true, publishes: "prints" },
]);

const subscriptionOf = (world, shopId) => [...world.stripe.world.subscriptions.values()].find((sub) => sub.metadata?.lmb_shop_id === shopId)?.id;

async function addCard(world, owner, shopId) {
  const asked = await world.ask(owner, "POST", "/api/billing/card", { shopId });
  if (asked.status !== 200) throw new Error(`the walkthrough couldn't add a card for ${shopId}: ${asked.body?.message}`);
  await world.stripeEvent("checkout.session.completed", world.stripe.completeSetup(asked.body.url.split("/").pop()));
}

/** Fills the control room. Safe to run on a fresh world only (the walkthrough runs it once at start). */
export async function seedRoom(world) {
  const admin = () => adminClaims(world.clock);

  for (const press of ROOM_PRESSES) {
    await world.signup.start(press.owner, { pressName: press.pressName, plan: press.plan, country: "CA", address: press.address, termsAccepted: true, termsVersion: TERMS_VERSION, sellingToday: "online", publishes: press.publishes });
  }
  await world.shopMaker.sweep();
  for (const press of ROOM_PRESSES) {
    if (!press.pays && !press.card) continue;
    await addCard(world, press.owner, press.address);
    const sub = subscriptionOf(world, press.address);
    if (press.pays && sub) await world.stripeEvent("customer.subscription.updated", world.stripe.payMonth(sub));
  }

  // The repair queue: two to fix, one fixed.
  await world.repairs.report({ shopId: "lantern-zines", check: "web-address", problem: "lanternzines.example stopped pointing at the shop", detail: "The address's records changed at the press's domain company on Monday. The shop still answers on its own .web.app address." });
  await world.repairs.report({ shopId: "driftwood", check: "stockroom-sync", problem: "The stockroom hasn't synced for two days", detail: "The last sync was from a phone that has been offline since the weekend fair." });
  const fixed = await world.repairs.report({ shopId: "kestrel", check: "release", problem: "The 1.4.0 release check failed at checkout" });
  await world.repairs.markFixed(fixed.id, { by: admin().email, note: "Ran the release again after the payment service came back. It passed." });

  // Support: two waiting, one answered.
  const lou = ROOM_PRESSES[1].owner;
  const kit = ROOM_PRESSES[0].owner;
  await world.support.open(lou, { shopId: "lantern-zines", subject: "My web address stopped working", body: "Since Monday lanternzines.example shows an error page. The shop's other address still works. Did I break something?" });
  await world.support.open(ROOM_PRESSES[2].owner, { shopId: "driftwood", subject: "Can I sell prints in two sizes?", body: "Most of my prints come in A4 and A3. Can one print have both sizes with their own stock?" });
  const { ticket } = await world.support.open(kit, { shopId: "kestrel", subject: "Changing the receipt wording", body: "Where do I change the thank-you line on the order email?" });
  await world.support.answer(admin(), { id: ticket.id, body: "In your admin: Settings › Email sender › Words. The preview on the right shows the change before you save." });

  // The app store (26.1): one app waiting for review and one already on the store, from made-up app makers.
  const maker = person("uid-ana", "ana@apps.example", "Ana Maker");
  const appDetails = (name, tagline, scopes) => ({ name, tagline, description: `${name} for small shops.`, category: "other", supportEmail: "help@apps.example", website: "https://apps.example", returnAddresses: ["https://apps.example/done"], scopes });
  const { app: labels } = await world.appMakers.create(maker, appDetails("Parcel Labels", "Print shipping labels for your orders", ["write_orders"]));
  await world.appMakers.submit(maker, { appId: labels.appId });
  const { app: counts } = await world.appMakers.create(maker, appDetails("Stock Counter", "Count your stock with a phone camera", ["write_inventory"]));
  await world.appMakers.submit(maker, { appId: counts.appId });
  await world.appMakers.approve(admin(), { appId: counts.appId });
  // Stock Counter is on two shops, and its alerts address has been failing (26.4): what the App store page shows.
  const at = world.clock.date().toISOString();
  for (const shopId of ["kestrel", "driftwood"]) {
    const installId = `${shopId}~${counts.appId}`;
    await world.appInstallStores.installs.put(installId, { installId, appId: counts.appId, appName: "Stock Counter", shopId, scopes: ["write_inventory"], status: "active", installedAt: at });
  }
  for (const [n, shopId] of [[1, "kestrel"], [2, "kestrel"], [3, "driftwood"]]) {
    await world.appAlertStores.outbox.put(`walk-alert-${n}`, {
      id: `walk-alert-${n}`, installId: `${shopId}~${counts.appId}`, appId: counts.appId, shopId, topic: "inventory/changed", data: {}, createdAt: at,
      status: "failed", tries: 8, nextAt: null, lastError: "answered 502", failedAt: at,
    });
  }

  // Web addresses (#381): Lantern Zines has its free address and its own domain, which stopped opening the shop.
  await world.registry.updateShop("lantern-zines", {
    freeAddress: "lantern-zines.shops.example",
    domains: [
      { name: "lantern-zines.shops.example", state: "live", free: true, addedAt: at },
      { name: "lanternzines.example", state: "waiting_dns", addedAt: at, brokeAt: at },
      { name: "www.lanternzines.example", state: "live", addedAt: at, redirectTo: "lanternzines.example" },
    ],
  });

  // Social channels (27.8): Kestrel posts to Facebook and Instagram; Lantern Zines' Pinterest stopped working.
  const sealed = { iv: "walkthrough", data: "pretend" };
  await world.socialConnections.set("kestrel", "meta", { sealed, accountName: "Kestrel Books", places: [{ id: "fb:1" }, { id: "ig:2" }], connectedAt: at, catalog: { feedId: "walk-feed", sentAt: at, feedUrl: "https://kestrel.example/feed.csv" } });
  await world.socialConnections.set("lantern-zines", "pinterest", { sealed, accountName: "lanternzines", places: [{ id: "board:1" }], connectedAt: at, problem: "lost", lostAt: at, lostDetail: "Pinterest said the sign-in was taken back" });
  await world.registry.recordEvent("kestrel", { id: "walk-social-failed", kind: "social.failed", network: "meta", detail: "Instagram turned down the photo: it's smaller than 320 pixels wide.", at });

  // Account recovery: one to check.
  await world.recovery.ask(person("uid-kit-new", "kit.kestrel@example.com", "Kit Kestrel"), {
    oldEmail: "kit@example.com",
    details: "I lost the password to my old email when I left my day job. My press is Kestrel Books; my last order was a box of 20 copies of Birdsong to the Toronto fair.",
  });

  // The breach register: one entry, reported and told.
  const { breach } = await world.room.recordBreach(admin(), {
    foundOn: world.clock.date().toISOString().slice(0, 10),
    what: "A shipping confirmation for one order went to the wrong customer because of a typo in the address book.",
    shops: ["kestrel"], people: "One customer; their name and the books they ordered.", reportedToCommissioner: false, peopleTold: true,
  });
  await world.room.updateBreach(admin(), { id: breach.id, note: "Low risk: no payment details or address were in the email. Not reportable." });

  // The activity log: an invite from the waitlist, a change to what new shops start with and a per-order fee to come.
  await world.controls.invite(admin(), { email: "chapbooks@example.com" });
  await world.room.setNewShopSwitch(admin(), { name: "gmailReceiptFinder", on: true, reason: "New presses ask for it in their first week." });
  await world.room.setFee(admin(), { shopId: "lantern-zines", basisPoints: 50, refunded: true, reason: "Lantern Zines sells mostly at fairs; half a percent online." });

  // Sign-in safety: Kestrel's owner has two-step with two backup codes left; Lantern's owner hasn't turned it on.
  world.shopAccess.twoStep.set("kestrel kit@example.com", 1);
  world.shopAccess.codes.set("kestrel kit@example.com", 2);
  world.shopAccess.codes.set("lantern-zines lou@example.com", 0);

  // Brought over: Kestrel moved its past orders, customers and gift cards in, as the shop's import steps record them,
  // and a few photos are still waiting to be copied off the old shop.
  const lines = [
    { type: "orders", message: "Brought 212 past orders over from the old shop (CA$6480.25 in sales, history only)", orders: 212 },
    { type: "customers", message: "Brought 340 customers over from the old shop; 190 joined the newsletter" },
    { type: "giftCards", message: "Brought 6 gift cards over from the old shop (CA$145.00 in balances)", cards: 6, balanceMinor: 14500 },
    { type: "catalog", message: "Old shop links: 48 now lead to the imported books" },
    { type: "orders", message: "Changed the rate on past order KB-1042 from the old shop to 0.74", orders: 1 },
  ];
  for (const [i, line] of lines.entries()) await world.shopData.set("kestrel", `audit-log/brought-${i}`, { ...line, createdAt: at });
  // Two of the past orders with the file they came from, and two discount codes brought over (one switched off since).
  for (const [i, file] of ["orders-2025.csv", "orders-2024.csv"].entries()) await world.shopData.set("kestrel", `orders/past-${i}`, { source: "import", importedFile: file, paymentStatus: "paid", total: 25, createdAt: new Date(world.clock.ms() - (400 + i * 300) * 86_400_000).toISOString() });
  for (const [code, isActive] of [["FAIRFRIEND", true], ["SPRING24", false]]) await world.shopData.set("kestrel", `discounts/${code}`, { code, type: "percentage", value: 10, isActive, description: "Brought over from your old shop" });
  // Its move stopped part-way ten days ago (pages and old links still to do), so Today flags it.
  const tenDaysAgo = new Date(world.clock.ms() - 10 * 86_400_000).toISOString();
  await world.shopData.set("kestrel", "firstWeek/start", { bring: { from: "online" }, done: { "move-customers": tenDaysAgo, "move-giftcards": tenDaysAgo, "move-orders": tenDaysAgo } });
  // The shop's own stalled-move email went to Kit three days later (apps/shop moveReminder).
  await world.shopData.set("kestrel", "systemStatus/moveReminder", { forLastMoved: tenDaysAgo, sentAt: new Date(world.clock.ms() - 3 * 86_400_000).toISOString() });
  await world.shopData.set("kestrel", "systemStatus/photoImport", { copiedTotal: 57, pending: 3, failed: {}, lastRunAt: at });

  // Drifting away: Lantern sold five zines five weeks ago and none since, and Lou last signed in 40 days ago; Kestrel
  // sells every week and Kit signed in yesterday. The daily watch scores both from that and emails Lantern.
  const daysAgo = (days) => new Date(world.clock.ms() - days * 86_400_000).toISOString();
  await world.registry.updateShop("lantern-zines", { liveAt: daysAgo(120) });
  await world.registry.updateShop("kestrel", { liveAt: daysAgo(120) });
  for (const [i, days] of [33, 34, 35, 36, 37].entries()) await world.shopData.set("lantern-zines", `orders/seed-${i}`, { paymentStatus: "paid", createdAt: daysAgo(days), total: 12 });
  for (const [i, days] of [2, 9, 16, 30, 40, 50].entries()) await world.shopData.set("kestrel", `orders/seed-${i}`, { paymentStatus: "paid", createdAt: daysAgo(days), total: 30 });
  world.shopAccess.lastSignIn.set("lantern-zines lou@example.com", daysAgo(40));
  world.shopAccess.lastSignIn.set("kestrel kit@example.com", daysAgo(1));
  // Newsletters, morning emails and changed orders: Kestrel sent one newsletter to 212 people and a second stopped
  // part-way; both morning emails are on with two books low; one order went out in two parts.
  await world.shopData.set("kestrel", "newsletterIssues/n1", { subject: "Autumn books are here", status: "sent", createdAt: daysAgo(20), finishedAt: daysAgo(20), sent: 212, skipped: 4, failed: 0 });
  await world.shopData.set("kestrel", "newsletterIssues/n2", { subject: "Fair weekend", status: "paused", createdAt: daysAgo(2), sent: 80, skipped: 1, failed: 26, lastError: "Too many emails bounced, so sending stopped." });
  // Its website wears Marquee, picked in Choose your look, with Atlas being tried in Studio's draft.
  await world.shopData.set("kestrel", "settings/website", { design: { themeStyle: "marquee", themeBase: { id: "marquee", name: "Marquee", look: {}, sig: "seed" } }, designPublishedAt: daysAgo(30) });
  await world.shopData.set("kestrel", "themes/workspace", { draft: { themeBase: { id: "atlas", name: "Atlas", look: {}, sig: "seed" } }, rev: 4 });
  await world.shopData.set("kestrel", "settings/notifications", { shopAlerts: { dailyOrderDigest: true, lowStock: true } });
  await world.shopData.set("kestrel", "systemStatus/lowStockAlerts", { items: { birdsong: "low", "wren-songs": "low", "old-zine": "out" } });
  await world.shopData.set("kestrel", "orders/seed-parts", { paymentStatus: "paid", createdAt: daysAgo(8), total: 52, partShipments: [{ at: daysAgo(7) }, { at: daysAgo(3) }] });
  await world.shopData.set("kestrel", "orders/seed-added", { paymentStatus: "paid", status: "paid", source: "payment_link", createdAt: daysAgo(6), total: 18, shipsWith: "seed-parts", addedByCustomer: true });
  await world.driftWatch.sweep();

  // Selling away from the website: Kestrel sent three payment links (two paid, one still unpaid after five days) and rang up two checkouts on
  // the fair till, one by a fair helper.
  for (const [i, [days, total, paid]] of [[20, 45, true], [6, 28.5, true], [5, 60, false]].entries()) {
    await world.shopData.set("kestrel", `orders/link-${i}`, { source: "payment_link", total, createdAt: daysAgo(days), ...(paid ? { status: "paid", paymentStatus: "paid", paidAt: daysAgo(days) } : { status: "pending_payment", paymentStatus: "unpaid" }) });
  }
  const fairDay = daysAgo(12).slice(0, 10);
  await world.stockroomData.set("kestrel", "settings/catalog", { data: JSON.stringify({ birdsong: { title: "Birdsong" } }), ts: 1 });
  await world.stockroomData.set("kestrel", "books/birdsong/data/hist", { data: JSON.stringify([
    { num: "POS-101", chan: "Book Fair", qty: 2, price: 22, date: fairDay },
    { num: "FH-7", chan: "Book Fair", qty: 1, price: 22, date: fairDay },
  ]), ts: 1 });
  await world.stockroomData.set("kestrel", "fairSales/FH-7", { by: "sam@example.com", at: daysAgo(12), lines: [{ bookId: "birdsong", qty: 1 }] });

  // Two presses still in setup mode, through the front door's own calls, for the Setting up page.
  for (const [owner, answers] of SETUP_PRESSES) {
    const made = await world.ask(owner, "POST", "/api/press", {});
    if (made.status !== 200) throw new Error(`the walkthrough couldn't start a press in setup: ${made.body?.message}`);
    const saved = await world.ask(owner, "POST", "/api/press/setup", { pressId: made.body.press.pressId, ...answers });
    if (saved.status !== 200) throw new Error(`the walkthrough couldn't save a press's setup: ${saved.body?.message}`);
  }
  return world;
}

/** Presses that signed up and are still getting ready (front door, plan 18.4-18.6). */
export const SETUP_PRESSES = Object.freeze([
  [person("uid-wren", "wren@example.com", "Wren Ash"), { pressName: "Wren & Ash", country: "CA", plan: "both", sells: "books", look: "market-stall", adminLook: "desk", moving: "yes" }],
  [person("uid-ivy", "ivy@example.com", "Ivy Moss"), { plan: "shop", look: "index" }],
]);
