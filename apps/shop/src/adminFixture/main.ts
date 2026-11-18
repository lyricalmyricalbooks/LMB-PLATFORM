// Development-only entry for admin-fixture.html: the real admin (signed in through the dev-only ?debug=true door) with
// sample orders and books. Every other admin call answers with nothing, as an offline shop would, so the check sees
// each screen's real empty and error states too. Nothing here reaches Firestore.
import { adminApi } from "../app/admin/api";
import { teamApi } from "../app/admin/teamApi";
import { rememberShopOwner } from "../app/lib/ownerDevice";
import { A11Y_BOOKS } from "../a11yFixture/books";
import { inventoryLinkApi } from "../app/admin/inventoryLinkApi";
import { addressKey } from "../app/admin/fulfillment";
import { googleConnectApi, readGoogleStatus } from "../app/admin/googleConnect";
import { appsApi } from "../app/admin/appActivity";
import { loadStockroom, stockroomApi, type StockroomRecords } from "../app/admin/stockroom/stockroomData";
import { MemoryStockroom } from "../app/admin/stockroom/stockroomMemory";
import { createStockroomWriter, stockroomWriteApi } from "../app/admin/stockroom/stockroomWrite";
import { recomputeAfters } from "@stockroom/recompute-afters.js";
import { stockistReceiptApi } from "../app/admin/stockroom/stockistReceipt"; // stockist-pay
import { qrCodesStore } from "../app/admin/stockroom/qrCodesStore";
import { sheetsStore } from "../app/admin/stockroom/sheetsStore";
import { customerGroupsStore } from "../app/admin/customerGroupsStore";
import { nightlyBackupApi } from "../app/admin/BackupsExportCard";
import { copiesIO, readManifest, snapshotOf } from "../app/admin/stockroom/stockroomCopies";
import { receiptInboxApi, type InboxView, type WaitingReceipt } from "../app/admin/stockroom/receiptInboxApi";
import { bankFeedApi, type BankLine, type BankView } from "../app/admin/stockroom/bankFeedApi";
import { bookingsData, type Booking, type PackRow } from "../app/admin/bookingsApi";
import { DEFAULT_BOOKING_SETTINGS, addDays, cleanBlocks, dayOf, zonedTime, type BookingService, type BookingSettings } from "../shared/bookingTimes";
import { shopTimeZone } from "../shared/shopTimeZone";
import { waysData } from "../app/admin/waysApi";
import { clientVisitsData } from "../app/admin/clientVisitsApi";
import { emailHash } from "../app/admin/emailHash";
import { clientPhotoFolder, photoFileName, type ClientVisit } from "../app/admin/clientVisits";
import { eventsData, type AdminEvent, type TicketOrder } from "../app/admin/eventsApi";
import { rentalsData, type AdminRental } from "../app/admin/rentalsApi";
import { cleanRentalItem, type RentalItem } from "../shared/rentalRules";
import { membersData, type AdminMember, type AdminPlan } from "../app/admin/membersApi";
import { cleanPlan, GIFT_MONTHS, giftPriceMinor } from "../shared/membershipRules";
import { givingData, type AdminFundraiser, type AdminGift, type FundraiserUpdate } from "../app/admin/givingApi";
import { cleanGivingSettings } from "../shared/givingRules";
import { cleanCharity, cleanReceiptAddress } from "../shared/charityReceipts";
import { cleanFundraiser, dayAfter } from "../shared/fundraiserRules";
import { refundMinorFor } from "../shared/eventTickets";
import { waysIn } from "../shared/waysToSell";
import { emailSenderData } from "../app/admin/emailSenderApi";

// Stockroom › To-do: two titles, one nearly sold out and one with nothing waiting (`?stock=empty`: nothing at all).
// Read at load: the fixture puts the address back to the page it opens, so later reads would miss it.
const SAMPLE_ALERTS = new URLSearchParams(window.location.search).get("alerts") === "1";
const EMPTY_STOCKROOM = new URLSearchParams(window.location.search).get("stock") === "empty";
stockroomApi.load = async (): Promise<StockroomRecords> => (EMPTY_STOCKROOM ? { books: [], states: {}, taxCenter: null } : {
  books: [{ id: "salt-hours", title: "Salt Hours", author: "Ada Example", maxPrint: 200, threshold: 10, listPrice: 20 }, { id: "night-songs", title: "Night Songs", author: "Ben Example", maxPrint: 150, threshold: 10, listPrice: 18 }],
  states: { "salt-hours": { hist: [{ id: 1, qty: 196, channel: "web", amount: 0 }] }, "night-songs": { hist: [{ id: 2, qty: 12, channel: "web", amount: 0 }, ...[["W-1041", 9, "Cleo Example"], ["W-1042", 4, "Dev Example"]].map(([num, days, name], i) => ({ id: 10 + i, num, qty: 1, price: 18, chan: "Website", date: new Date(Date.now() - Number(days) * 864e5).toISOString().slice(0, 10), shipName: name, shipAddr1: "1 Example St" }))], openCall: [{}, {}] } },
  taxCenter: null,
  // Author entries waiting on a title (the old stockroom's author inbox).
  submissions: { "night-songs": { sales: { s1: true }, expenses: { e1: true, e2: true } } },
});

// ── Settings › Email sender (`?page=settings/notifications`): a morning of deliveries with problems, a spam mark and one
// email waiting for another try. `&emails=empty`: nothing sent yet; `&emails=error`: the list doesn't load; `&emails=gmail`:
// the shop sends from its own Gmail. In memory; Retry and Stop answer at once. ──
{
  const mode = new URLSearchParams(window.location.search).get("emails") || "sample";
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  type Row = { id: string; at: string; to: string; subject: string; status: string; error?: string; outboxId?: string; keySource?: string; attempt?: number };
  let log: Row[] = mode === "empty" || mode === "error" ? [] : [
    { id: "l1", at: at(4), to: "ada@mail.example", subject: "Order confirmed: LM-98241", status: "failed", error: "552 Mailbox full", outboxId: "q1" },
    { id: "l2", at: at(33), to: "ben@mail.example", subject: "Your order is on the way!", status: "bounced", error: "550 No such user here" },
    { id: "l3", at: at(50), to: "cleo@mail.example", subject: "Did you forget something?", status: "complained" },
    { id: "l4", at: at(75), to: "dan@mail.example", subject: "Your order is on the way!", status: "sent", keySource: mode === "gmail" ? "gmail" : "platform" },
    { id: "l5", at: at(103), to: "eve@mail.example", subject: "Order confirmed: LM-98236", status: "sent" },
    { id: "l6", at: at(117), to: "finn@mail.example", subject: "Order confirmed: LM-98235", status: "failed", error: "Message rejected by the receiving provider's policy" },
    { id: "l7", at: at(155), to: "gia@mail.example", subject: "Order confirmed: LM-98233", status: "sent", attempt: 2 },
    { id: "l8", at: at(60 * 26), to: "hal@mail.example", subject: "How are you finding your book?", status: "sent" },
    { id: "l9", at: at(60 * 27), to: "ivy@mail.example", subject: "Order refunded: LM-98201", status: "sent" },
  ];
  let queue = mode === "empty" || mode === "error" ? [] : [
    { id: "q1", to: "ada@mail.example", subject: "Order confirmed: LM-98241", kind: "order_confirmation", status: "pending", attempts: 2, nextAttemptAt: at(-20), lastError: "552 Mailbox full", createdAt: at(30) },
  ];
  emailSenderData.readLog = async (count: number) => {
    if (mode === "error") throw new Error("offline");
    return log.slice(0, count);
  };
  emailSenderData.call = async (body: Record<string, unknown>) => {
    if (body.action === "emailQueue") return { entries: queue };
    if (body.action === "senderStatus") return { gmailAddress: mode === "gmail" ? "yourpress@gmail.example" : "", backup: "platform" };
    if (body.action === "retryEmail" || body.action === "cancelEmail") {
      const entry = queue.find((q) => q.id === body.id);
      queue = queue.filter((q) => q.id !== body.id);
      if (entry && body.action === "retryEmail") log = [{ id: `l${log.length + 1}`, at: at(0), to: entry.to, subject: entry.subject, status: "sent", outboxId: entry.id, attempt: entry.attempts + 1 }, ...log];
      return { status: body.action === "retryEmail" ? "sent" : "cancelled" };
    }
    if (body.email) { log = [{ id: `l${log.length + 1}`, at: at(0), to: String(body.email), subject: "Test: Order confirmed", status: "sent" }, ...log]; return { ok: true }; }
    return {};
  };
}

// ── Settings › General › Ways to sell (beta): `?ways=events,classes` are the ways the platform turned on for the shop
// (none without it, so the section stays hidden). In memory. ──
{
  const allowed = waysIn(Object.fromEntries((new URLSearchParams(window.location.search).get("ways") || "").split(",").map((id) => [id, true])));
  waysData.watchAllowed = (onChange) => { onChange(allowed); return () => {}; };
  // The fixture's owner has switched on every way the platform offers, so each page shows.
  waysData.watchChosen = (onChange) => { onChange(allowed); return () => {}; };
}

// ── Donations (beta, `?ways=giving&page=giving`): four gifts, one refunded, and a few blocked tries (`&giving=new`: none
// yet). In memory; changes answer at once. ──
{
  const DAY = 86_400_000;
  const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  const gift = (id: string, name: string, email: string, amountMinor: number, days: number, extra: Partial<AdminGift> = {}): AdminGift => ({
    id, status: "paid", name, email, anonymous: false, honour: null, note: "", amountMinor, feeMinor: 0, chargedMinor: amountMinor, currency: "CAD",
    createdAt: ago(days), paidAt: ago(days), refundedAt: "", test: false, ...extra,
  });
  let gifts: AdminGift[] = new URLSearchParams(window.location.search).get("giving") === "new" ? [] : [
    gift("g1", "Ada Example", "ada@example.com", 5000, 1, { feeMinor: 176, chargedMinor: 5176, note: "Your books got me through a long winter. Keep printing!", fundraiserId: "f1",
      reward: { id: "rw2", title: "Signed print", ships: true, when: "January", sentAt: "" },
      shipTo: { name: "Ada Example", street: "12 Example St", street2: "", city: "Toronto", state: "ON", zip: "M6G 3H1", country: "CA" } }),
    gift("g2", "Ben Example", "ben@example.com", 2500, 4, { anonymous: true, honour: { kind: "memory", name: "Grace Example" }, receiptAsked: true,
      receipt: { number: "2026-00002", year: 2026, issuedOn: ago(4).slice(0, 10), receivedOn: ago(4).slice(0, 10), eligibleMinor: 2500, currency: "CAD", name: "Ben Example",
        address: { street: "12 Sample St", street2: "", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "CA" }, status: "issued", cancelledOn: "", replaces: "", test: false } }),
    gift("g3", "Cleo Example", "cleo@example.com", 1000, 12, { fundraiserId: "f1", reward: { id: "rw1", title: "Thank-you postcard", ships: false, when: "", sentAt: ago(10) } }),
    gift("g4", "Dev Example", "dev@example.com", 2500, 40, { status: "refunded", refundedAt: ago(39), receiptAsked: true,
      receipt: { number: "2026-00001", year: 2026, issuedOn: ago(40).slice(0, 10), receivedOn: ago(40).slice(0, 10), eligibleMinor: 2500, currency: "CAD", name: "Dev Example",
        address: { street: "3 Example Ave", street2: "", city: "Toronto", state: "ON", zip: "M6G 1A1", country: "CA" }, status: "cancelled", cancelledOn: ago(39).slice(0, 10), replaces: "", test: false } }),
  ];
  let settings = cleanGivingSettings({ amounts: [1000, 2500, 5000, 10000],
    charity: { number: "123456789 RR 0001", name: "Sample Press Arts Society", address: "1 Sample St, Toronto ON M6G 1A1", signer: "Ada Example, Treasurer" } });
  const today = new Date().toISOString().slice(0, 10);
  const fund = (id: string, f: Partial<AdminFundraiser>): AdminFundraiser => ({
    id, title: "", story: "", goalMinor: 100000, raisedMinor: 0, supporters: 0, endsOn: dayAfter(today, 20), state: "live", status: "live",
    wall: [], showWall: true, rewards: [], createdAt: ago(10), startedAt: ago(10), endedAt: "", ...f,
  });
  let funds: AdminFundraiser[] = !gifts.length ? [] : [
    fund("f1", { title: "Reprint our first book", story: "Our first book sold out in a month. Help us print 500 more on the same paper.", goalMinor: 300000, raisedMinor: 187500, supporters: 42,
      wall: [{ name: "Ada Example", at: ago(1) }, { name: "Cleo Example", at: ago(3) }],
      rewards: [
        { id: "rw1", title: "Thank-you postcard", description: "A risograph postcard with a note from us.", minMinor: 1000, limit: 0, ships: false, when: "", taken: 18 },
        { id: "rw2", title: "Signed print", description: "An A4 print from the book, signed and numbered.", minMinor: 5000, limit: 25, ships: true, when: "January", taken: 21 },
        { id: "rw3", title: "Your name in the book", description: "", minMinor: 15000, limit: 10, ships: false, when: "Spring 2027", taken: 10 },
      ] }),
    fund("f0", { title: "A new risograph drum", goalMinor: 150000, raisedMinor: 162000, supporters: 51, state: "ended", status: "ended", endsOn: dayAfter(today, -60), endedAt: ago(60) }),
  ];
  // Updates to supporters (G2c): one sent on the running fundraiser and one on the past one.
  let updates: FundraiserUpdate[] = !gifts.length ? [] : [
    { id: "u1", fundraiserId: "f1", subject: "Halfway there, thank you!", status: "sent", audience: 30, sent: 30, failed: 0, createdAt: ago(6), finishedAt: ago(6), lastError: "" },
    { id: "u0", fundraiserId: "f0", subject: "The new drum is here", status: "sent", audience: 51, sent: 50, failed: 1, createdAt: ago(40), finishedAt: ago(40), lastError: "" },
  ];
  const updatesBy = () => updates.reduce<Record<string, FundraiserUpdate[]>>((all, u) => ({ ...all, [u.fundraiserId]: [...(all[u.fundraiserId] || []), u] }), {});
  givingData.admin = async (op, body) => {
    if (op === "updateCount") return { ok: true, audience: (funds.find((f) => f.id === body.fundraiserId)?.supporters || 0) };
    if (op === "updateTest" || op === "updateSend") {
      if (!String(body.subject || "").trim()) throw Object.assign(new Error("Give the update a subject line."), { code: "subject" });
      if (!String(body.body || "").trim()) throw Object.assign(new Error("Write something in the update before sending it."), { code: "body" });
      if (op === "updateTest") return { ok: true, to: "owner@example.com" };
      const audience = funds.find((f) => f.id === body.fundraiserId)?.supporters || 0;
      const update: FundraiserUpdate = { id: `u${Date.now()}`, fundraiserId: String(body.fundraiserId), subject: String(body.subject).trim(), status: "queued", audience, sent: 0, failed: 0, createdAt: new Date().toISOString(), finishedAt: "", lastError: "" };
      updates = [update, ...updates];
      return { ok: true, update };
    }
    if (op === "updateCancel" || op === "updateResume") {
      updates = updates.map((u) => (u.id === body.id ? { ...u, status: op === "updateCancel" ? "cancelled" as const : "queued" as const, lastError: "" } : u));
      return { ok: true, update: updates.find((u) => u.id === body.id) };
    }
    if (op === "saveFundraiser") {
      const before = funds.find((f) => f.id === body.id);
      const clean = cleanFundraiser(body.fundraiser, today, before?.rewards || []);
      if ("problem" in clean) throw Object.assign(new Error(clean.problem), { code: clean.field });
      const id = String(body.id || `f${Date.now()}`);
      const was = funds.find((f) => f.id === id);
      const status = body.start === true || was?.status === "live" ? "live" : "draft";
      const next = fund(id, { ...was, ...clean, showWall: clean.wall, wall: was?.wall || [], status, state: status, startedAt: status === "live" ? was?.startedAt || new Date().toISOString() : "" });
      funds = [next, ...funds.filter((f) => f.id !== id)];
      return { ok: true, fundraiser: next };
    }
    if (op === "endFundraiser") {
      const was = funds.find((f) => f.id === body.id);
      if (was?.state === "draft") { funds = funds.filter((f) => f.id !== body.id); return { ok: true, removed: true }; }
      const next = was && { ...was, state: "ended" as const, status: "ended" as const, endedAt: new Date().toISOString() };
      funds = funds.map((f) => (f.id === body.id && next ? next : f));
      return { ok: true, fundraiser: next };
    }
    if (op === "list") {
      const paid = gifts.filter((g) => g.status === "paid" && !g.test);
      const month = new Date().toISOString().slice(0, 7);
      return {
        currency: "CAD", settings, gifts, minMinor: 500, maxMinor: 1_000_000,
        totals: { givenMinor: paid.reduce((a, g) => a + g.amountMinor, 0), monthMinor: paid.filter((g) => g.paidAt.startsWith(month)).reduce((a, g) => a + g.amountMinor, 0), gifts: paid.length, givers: new Set(paid.map((g) => g.email)).size },
        blocked: gifts.length ? { tooSmall: 3, tooMany: 1, bot: 11, total: 15 } : { tooSmall: 0, tooMany: 0, bot: 0, total: 0 },
        fundraisers: funds, today, updates: updatesBy(),
      };
    }
    if (op === "rewardSent") {
      gifts = gifts.map((g) => (g.id === body.giftId && g.reward ? { ...g, reward: { ...g.reward, sentAt: body.sent === false ? "" : new Date().toISOString() } } : g));
      return { ok: true, gift: gifts.find((g) => g.id === body.giftId) };
    }
    if (op === "saveSettings") {
      const c = cleanCharity(body.settings && (body.settings as { charity?: unknown }).charity);
      if ("problem" in c) throw Object.assign(new Error(c.problem), { code: c.field });
      settings = cleanGivingSettings(body.settings); return { ok: true, settings };
    }
    if (op === "reissueReceipt") {
      const g = gifts.find((x) => x.id === body.giftId);
      if (!g?.receipt) throw new Error("Only a paid gift with a receipt can have it corrected.");
      const address = cleanReceiptAddress(body.address);
      if (!address) throw Object.assign(new Error("Fill in the giver's full address for the receipt."), { code: "address" });
      const next = { ...g.receipt, number: "2026-00003", replaces: g.receipt.number, name: String(body.name), address, issuedOn: new Date().toISOString().slice(0, 10) };
      gifts = gifts.map((x) => (x.id === g.id ? { ...x, receipt: next, receiptHistory: [{ ...g.receipt!, status: "cancelled" as const }] } : x));
      return { ok: true, gift: gifts.find((x) => x.id === g.id) };
    }
    if (op === "refund") {
      gifts = gifts.map((g) => (g.id === body.giftId ? { ...g, status: "refunded" as const, refundedAt: new Date().toISOString() } : g));
      return { ok: true, gift: gifts.find((g) => g.id === body.giftId) };
    }
    return { ok: true };
  };
}

// ── Members (beta, `?ways=memberships&page=memberships`): two plans and five members, one whose payment failed
// (`&members=new`: none yet; `&members=square`: card payments that can't take memberships). In memory. ──
{
  const DAY = 86_400_000;
  const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();
  const query = new URLSearchParams(window.location.search).get("members") || "";
  let plans: AdminPlan[] = query === "new" ? [] : [
    { id: "plan-friends", name: "Friends of the press", description: "Keep the press running.", perks: ["A new print each season", "Early tickets to launches", "First look at new books"], interval: "month", priceMinor: 1500, trialDays: 14, currency: "CAD", hidden: false, members: 3, memberPercent: 10 },
    { id: "plan-patrons", name: "Patrons", description: "", perks: ["Every book we publish, posted to you", "Your name in the back of each book"], interval: "year", priceMinor: 25000, trialDays: 0, currency: "CAD", hidden: false, members: 1, memberPercent: 0, box: { items: [{ bookId: "b1", quantity: 1 }, { bookId: "b2", variantId: "v2", quantity: 1 }], cutoffDay: 15 } },
  ];
  const friends = { name: "Friends of the press", interval: "month" as const, priceMinor: 1500, trialDays: 14, currency: "CAD" };
  const member = (id: string, name: string, email: string, state: AdminMember["state"], extra: Partial<AdminMember> = {}): AdminMember => ({
    id, state, plan: friends, planId: "plan-friends", name, email, periodEnd: at(12), trialEnd: "", card: { brand: "visa", last4: "4242" },
    startedAt: at(-80), endedAt: "", createdAt: at(-80), checkedAt: at(0), test: false, cardPending: false, ...extra,
  });
  let members: AdminMember[] = query === "new" ? [] : [
    member("m1", "Ada Example", "ada@example.com", "active"),
    member("m2", "Ben Example", "ben@example.com", "pastDue", { card: { brand: "visa", last4: "0341" } }),
    member("m3", "Cleo Example", "cleo@example.com", "trial", { trialEnd: at(9), startedAt: at(-5), periodEnd: at(9) }),
    member("m4", "Dev Example", "dev@example.com", "ending", { plan: { name: "Patrons", interval: "year", priceMinor: 25000, trialDays: 0, currency: "CAD" }, planId: "plan-patrons", periodEnd: at(40), card: { brand: "mastercard", last4: "4444" }, box: true, address: { name: "Dev Example", line1: "12 Sample Street", line2: "", city: "Toronto", state: "ON", postalCode: "M5V 2T6", country: "CA" }, lastBoxMonth: "2026-10", lastBoxOrder: "BOX-m4-2026-10", boxProblem: { month: "2026-11", text: "One of the box's products is sold out.", at: at(-1) } }),
    member("m6", "Fay Example", "fay@example.com", "paused"),
    member("m7", "Gus Example", "gus@example.com", "active", { card: null, periodEnd: at(85), startedAt: at(-5), gift: { months: 3, from: "Ada Example" } }),
    member("m5", "Eli Example", "eli@example.com", "ended", { endedAt: at(-20), startedAt: at(-200) }),
  ];
  const live = (m: AdminMember) => ["trial", "active", "ending", "pastDue"].includes(m.state) && !m.test;
  let memberPosts = [
    { id: "post-2", title: "Winter print run", body: "We're printing the winter books this week.\n\nMembers get first pick: watch your inbox on Friday.", planIds: [] as string[], publishedAt: at(-2), updatedAt: at(-2), emailedTo: 4, emailedAt: at(-2) },
    { id: "post-1", title: "A studio visit for patrons", body: "Come and see the press running, on the first Saturday of December.", planIds: ["plan-patrons"], publishedAt: at(-12), updatedAt: at(-12), emailedTo: 0, emailedAt: "" },
  ];
  membersData.admin = async (op, body) => {
    if (op === "list") {
      const counted = members.filter(live);
      return {
        currency: "CAD", ready: query !== "square", members,
        plans: plans.map((p) => ({ ...p, members: counted.filter((m) => m.planId === p.id).length })),
        boxWarnings: query === "new" ? [] : [{ planId: "plan-patrons", planName: "Patrons", cutoffDay: 15, members: 1, month: "2026-11", short: [{ bookId: "b2", variantId: "v2", title: "Second book (Signed)", need: 1, have: 0 }] }],
        totals: { members: counted.length, monthlyMinor: counted.reduce((a, m) => a + (m.plan ? (m.plan.interval === "year" ? Math.round(m.plan.priceMinor / 12) : m.plan.priceMinor) : 0), 0), pastDue: counted.filter((m) => m.state === "pastDue").length },
      };
    }
    if (op === "savePlan") {
      const clean = cleanPlan(body.plan);
      if ("problem" in clean) throw Object.assign(new Error(clean.problem), { code: clean.field });
      const id = String(body.id || `plan-${Date.now()}`);
      const was = plans.find((p) => p.id === id);
      if (was && (was.priceMinor !== clean.plan.priceMinor || was.interval !== clean.plan.interval)) throw Object.assign(new Error("A plan's price and how often it is paid can't change after it is made."), { code: "price" });
      const { gifts, ...rest } = clean.plan;
      const next: AdminPlan = { ...rest, id, currency: "CAD", members: was?.members || 0, ...(gifts ? { gifts: GIFT_MONTHS.map((months) => ({ months, priceMinor: giftPriceMinor(rest, months) })) } : {}) };
      plans = was ? plans.map((p) => (p.id === id ? next : p)) : [...plans, next];
      return { ok: true, id };
    }
    if (op === "payments") {
      const paid = (id: string, plan: string, amountMinor: number, days: number) => ({ id, membershipId: "m1", plan, amountMinor, currency: "CAD", paidAt: at(days), test: false });
      return { currency: "CAD", payments: query === "new" ? [] : [paid("in_f1", "Friends of the press", 1500, -50), paid("in_f2", "Friends of the press", 1500, -20), paid("in_p1", "Patrons", 25000, -40)] };
    }
    if (op === "posts") return { posts: query === "new" ? [] : memberPosts };
    if (op === "savePost") {
      const p = body.post as { title: string; body: string; planIds: string[]; email: boolean };
      const was = memberPosts.find((x) => x.id === body.id);
      const next = { id: String(body.id || `post-${Date.now()}`), title: p.title, body: p.body, planIds: p.planIds, publishedAt: was?.publishedAt || new Date().toISOString(), updatedAt: new Date().toISOString(), emailedTo: was?.emailedTo || (p.email ? 4 : 0), emailedAt: was?.emailedAt || (p.email ? new Date().toISOString() : "") };
      memberPosts = was ? memberPosts.map((x) => (x.id === next.id ? next : x)) : [next, ...memberPosts];
      return { ok: true, post: next };
    }
    if (op === "deletePost") { memberPosts = memberPosts.filter((x) => x.id !== body.id); return { ok: true }; }
    if (op === "endNow" || op === "refresh") {
      members = members.map((m) => (m.id === body.id && op === "endNow" ? { ...m, state: "ended" as const, endedAt: new Date().toISOString() } : m));
      return { ok: true, member: members.find((m) => m.id === body.id) };
    }
    return { ok: true, membershipsLive: true };
  };
}

// ── Rentals (beta, `?ways=rentals&page=rentals`): a camera kit by the hour and two kayaks by the day, with rentals
// coming up, one out now and one late (`&rentals=new`: none yet). In memory. ──
{
  const H = 3_600_000;
  const day0 = new Date(new Date().toDateString()).getTime();
  const fresh = new URLSearchParams(window.location.search).get("rentals") === "new";
  let items: RentalItem[] = fresh ? [] : [
    cleanRentalItem({ name: "Camera kit", description: "Body, two lenses, batteries and a bag.", units: 2, basis: "hour", hourMinor: 2000, dayMinor: 9000, minLength: 2, maxLength: 8, cleanMinutes: 30, opens: "09:00", closes: "18:00", chargeTax: true, depositMinor: 30000, lateFeeMinor: 1500 }, "kit00001") as RentalItem,
    cleanRentalItem({ name: "Kayak", units: 4, basis: "day", dayMinor: 4500, weekMinor: 22000, minLength: 1, maxLength: 14, opens: "08:00", closes: "19:00", repair: [3], gone: [4] }, "kayak001") as RentalItem,
  ];
  const r = (id: string, itemId: string, unit: number, startMs: number, endMs: number, status: AdminRental["status"], name: string, chargedMinor: number): AdminRental => ({
    id, status, itemId, itemName: itemId === "kit00001" ? "Camera kit" : "Kayak", unit, startMs, endMs, length: itemId === "kit00001" ? Math.round((endMs - startMs) / H) : Math.round((endMs - startMs) / (24 * H)) + 1,
    basis: itemId === "kit00001" ? "hour" : "day", name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, totalMinor: chargedMinor, taxMinor: itemId === "kit00001" ? Math.round(chargedMinor * 0.115) : 0, chargedMinor, currency: "CAD",
    refundedMinor: 0, test: false, createdAt: new Date(day0 - 3 * 24 * H).toISOString(), paidAt: new Date(day0 - 2 * 24 * H).toISOString(), pickedUpAt: "", returnedAt: "", holdUntil: "",
  });
  let rentals: AdminRental[] = fresh ? [] : [
    r("r1", "kit00001", 1, day0 + 10 * H, day0 + 14 * H, "out", "Ada Example", 8000),
    r("r2", "kit00001", 2, day0 + 24 * H + 9 * H, day0 + 24 * H + 17 * H, "paid", "Ben Example", 9000),
    r("r3", "kayak001", 1, day0 - 2 * 24 * H + 8 * H, day0 - 24 * H + 9 * H, "out", "Cleo Example", 9000),
    r("r4", "kayak001", 2, day0 + 2 * 24 * H + 8 * H, day0 + 5 * 24 * H + 19 * H, "paid", "Dev Example", 18000),
    r("r5", "kit00001", 1, day0 + 3 * 24 * H + 12 * H, day0 + 3 * 24 * H + 14 * H, "paid", "Eli Example", 4000),
    // R2: a kit brought back three hours late yesterday, its card kept for the deposit, one fee already charged.
    { ...r("r6", "kit00001", 2, day0 - 24 * H + 10 * H, day0 - 24 * H + 13 * H, "returned", "Fay Example", 6000), returnedAt: new Date(day0 - 24 * H + 16 * H).toISOString(),
      depositMinor: 30000, lateFeeMinor: 1500, card: "Visa ending 4242", feeRoomMinor: 25000, lateBy: 3, suggestedLateMinor: 4500,
      fees: [{ amountMinor: 5000, reason: "damage", note: "Cracked lens hood", at: new Date(day0 - 20 * H).toISOString(), by: "owner@example.com" }], extrasPaid: [], payLinks: [] },
  ];
  rentalsData.admin = async (op, body) => {
    if (op === "list") return { zone: "America/Toronto", currency: "CAD", items, rentals };
    if (op === "saveItem") {
      const id = String((body.item as { id?: string })?.id || `item${Date.now()}`);
      const clean = cleanRentalItem(body.item, id);
      if ("problem" in clean) throw new Error(clean.problem);
      items = items.some((i) => i.id === id) ? items.map((i) => (i.id === id ? clean : i)) : [...items, clean];
      return { ok: true, item: clean };
    }
    if (op === "deleteItem") { items = items.filter((i) => i.id !== body.id); return { ok: true }; }
    if (op === "pickedUp" || op === "returned" || op === "cancel") {
      const status = op === "pickedUp" ? "out" : op === "returned" ? "returned" : "cancelled";
      rentals = rentals.map((x) => (x.id === body.id ? { ...x, status, ...(op === "cancel" ? { refundedMinor: x.chargedMinor } : {}) } : x));
      return { ok: true, rental: rentals.find((x) => x.id === body.id) };
    }
    if (op === "chargeFee" || op === "payLink") return { ok: true, url: "https://pay.example/sample" };
    if (op === "unitState") {
      // Like the server: a unit's coming rentals need another unit; a gone unit with one waits for the owner's say.
      const unit = Number(body.unit);
      const coming = rentals.filter((x) => x.itemId === body.itemId && x.unit === unit && x.status === "paid" && x.startMs > Date.now());
      if (body.state !== "ok" && coming.length && body.state === "gone" && !body.cancelStuck) throw Object.assign(new Error("A rental can't move."), { code: "stuck", stuck: coming });
      items = items.map((i) => {
        if (i.id !== body.itemId) return i;
        const repair = (i.repair || []).filter((n) => n !== unit);
        const gone = (i.gone || []).filter((n) => n !== unit);
        if (body.state === "repair") repair.push(unit);
        if (body.state === "gone") gone.push(unit);
        return { ...i, repair, gone, goneWhy: { ...((i as { goneWhy?: object }).goneWhy || {}), ...(body.state === "gone" ? { [unit]: { why: body.why } } : {}) } } as RentalItem;
      });
      const cancelled = body.cancelStuck ? coming.length : 0;
      if (cancelled) rentals = rentals.map((x) => (coming.includes(x) ? { ...x, status: "cancelled", refundedMinor: x.chargedMinor } : x));
      return { ok: true, moved: body.state === "repair" ? coming.length : 0, cancelled, failed: [] };
    }
    return { ok: true, rentalsLive: true };
  };
}

// ── Events (beta, `?ways=events&page=events`): three coming events and one past, with a guest list (`&events=new`:
// none yet). In memory; changes answer at once. ──
{
  const DAY = 86_400_000;
  const at = (days: number, hour: number) => { const d = new Date(Date.now() + days * DAY); d.setUTCHours(hour, 0, 0, 0); return d.toISOString(); };
  const kind = (id: string, name: string, priceMinor: number, places: number) => ({ id, name, priceMinor, places, maxPerOrder: 10 });
  const made = (id: string, title: string, start: string, venue: string, status: AdminEvent["status"], tickets: AdminEvent["tickets"], sold: Record<string, number>): AdminEvent => {
    const soldTotal = Object.values(sold).reduce((a, b) => a + b, 0);
    return {
      id, title, description: "Doors half an hour before. Drinks and a short reading.", start, end: "", venue, address: "12 Sample Street", onlineUrl: "", photo: "", status, chargeTax: false, tickets,
      sold, soldTotal, placesTotal: tickets.reduce((a, t) => a + t.places, 0), left: Object.fromEntries(tickets.map((t) => [t.id, t.places - (sold[t.id] || 0)])),
      paidMinor: tickets.reduce((a, t) => a + t.priceMinor * (sold[t.id] || 0), 0), orders: Math.ceil(soldTotal / 2),
    };
  };
  let events: AdminEvent[] = new URLSearchParams(window.location.search).get("events") === "new" ? [] : [
    { ...made("evt-launch", "Autumn launch party", at(9, 23), "The shop", "live", [kind("g", "General", 1500, 60), kind("s", "Supporter", 3000, 20)], { g: 34, s: 9 }),
      extras: [{ id: "prog", name: "Printed programme", priceMinor: 500, maxPerOrder: 10 }, { id: "drink", name: "Welcome drink", priceMinor: 800, maxPerOrder: 4 }], feeMinor: 100 },
    made("evt-workshop", "Zine-making workshop", at(16, 18), "Back room", "live", [kind("g", "Place at the table", 4500, 12)], { g: 12 }),
    made("evt-reading", "Winter reading night", at(30, 0), "Online", "draft", [kind("g", "Free place", 0, 100)], {}),
    made("evt-market", "Summer market day", at(-40, 15), "Market hall", "live", [kind("g", "Entry", 500, 200)], { g: 143 }),
  ];
  const guests: TicketOrder[] = [
    ["Ada Example", "ada@example.com", 2, "g"], ["Ben Example", "ben@example.com", 1, "s"], ["Cleo Example", "cleo@example.com", 3, "g"],
  ].map(([name, email, count, ticketId], i) => ({
    id: `ord-${i}`, status: "paid" as const, eventId: "evt-launch", name: String(name), email: String(email),
    lines: [{ ticketId: String(ticketId), name: ticketId === "s" ? "Supporter" : "General", qty: Number(count), priceMinor: ticketId === "s" ? 3000 : 1500 }],
    ticketCount: Number(count), totalMinor: Number(count) * (ticketId === "s" ? 3000 : 1500), taxMinor: 0, chargedMinor: Number(count) * (ticketId === "s" ? 3000 : 1500), currency: "CAD",
    tickets: Array.from({ length: Number(count) }, (_, n) => ({ code: `${"KRTW MPQZ HNDB".split(" ")[i]}-${"2345 6789 ABCD".split(" ")[n]}`, ticketId: String(ticketId), name: ticketId === "s" ? "Supporter" : "General" })),
    createdAt: at(-2, 14), paidAt: at(-2, 14), test: false,
    ...(i === 0 ? { extras: [{ extraId: "prog", name: "Printed programme", qty: 1, priceMinor: 500 }, { extraId: "drink", name: "Welcome drink", qty: 2, priceMinor: 800 }], extrasMinor: 2100, feeMinor: 200, totalMinor: 5300, chargedMinor: 5300 } : {}),
    ...(i === 2 ? { discount: { code: "EARLY", amountMinor: 900 }, totalMinor: 3600, chargedMinor: 3600 } : {}),
  }));
  eventsData.admin = async (op, body) => {
    if (op === "list") return { zone: "America/Toronto", currency: "CAD", events };
    if (op === "saveEvent") {
      const e = body.event as AdminEvent;
      const old = events.find((x) => x.id === e.id);
      const next = { ...made(e.id || `evt-${Date.now()}`, e.title, e.start, e.venue, e.status, e.tickets, old?.sold || {}), extras: e.extras ?? [], feeMinor: e.feeMinor };
      events = old ? events.map((x) => (x.id === next.id ? next : x)) : [...events, next];
      return { ok: true, event: next };
    }
    if (op === "deleteEvent") { events = events.filter((x) => x.id !== body.id); return { ok: true }; }
    if (op === "orders") return { orders: guests.filter((g) => g.eventId === body.eventId) };
    if (op === "moveOrder") {
      const order = guests.find((g) => g.id === body.orderId);
      const target = events.find((e) => e.id === body.toEventId);
      if (!order || !target) throw Object.assign(new Error("Choose another event to move them to."), { code: "event" });
      const kinds = body.kinds as Record<string, string>;
      const nameOf = (id: string) => target.tickets.find((k) => k.id === id)?.name || "";
      const shift = (e: AdminEvent, counts: Record<string, number>, sign: number) => {
        const sold = { ...e.sold }; const left = { ...e.left };
        for (const [id, n] of Object.entries(counts)) { sold[id] = (sold[id] || 0) + sign * n; left[id] = (left[id] || 0) - sign * n; }
        const n = Object.values(counts).reduce((a, b) => a + b, 0);
        return { ...e, sold, left, soldTotal: e.soldTotal + sign * n, orders: e.orders + sign, paidMinor: e.paidMinor + sign * order.chargedMinor };
      };
      const leaving: Record<string, number> = {}; const arriving: Record<string, number> = {};
      for (const t of order.tickets) { leaving[t.ticketId] = (leaving[t.ticketId] || 0) + 1; arriving[kinds[t.ticketId]] = (arriving[kinds[t.ticketId]] || 0) + 1; }
      const from = order.eventId;
      events = events.map((e) => (e.id === from ? shift(e, leaving, -1) : e.id === target.id ? shift(e, arriving, 1) : e));
      Object.assign(order, { eventId: target.id, tickets: order.tickets.map((t) => ({ code: t.code, ticketId: kinds[t.ticketId], name: nameOf(kinds[t.ticketId]) })) });
      await new Promise((r) => setTimeout(r, 400));
      return { ok: true, told: true, order: { ...order } };
    }
    if (op === "checkIn") {
      const code = String(body.code || "");
      const order = guests.find((g) => g.tickets.some((t) => t.code === code));
      if (!order) throw Object.assign(new Error("No ticket has that code. Check the letters and try again."), { code: "unknown_code" });
      const index = order.tickets.findIndex((t) => t.code === code);
      const ticket = order.tickets[index];
      const undo = body.value === false;
      const already = !undo && !!ticket.usedAt;
      if (undo) ticket.usedAt = ""; else if (!already) ticket.usedAt = new Date().toISOString();
      const arrived = guests.reduce((sum, g) => sum + g.tickets.filter((t) => t.usedAt).length, 0);
      events = events.map((e) => (e.id === "evt-launch" ? { ...e, arrived } : e));
      return { ok: true, already, arrived, ticket: { code, kind: ticket.name, usedAt: ticket.usedAt || "", orderId: order.id, eventId: order.eventId, eventTitle: "Autumn launch party", name: order.name, number: index + 1, of: order.tickets.length, arrivedOfOrder: order.tickets.filter((t) => t.usedAt).length } };
    }
    if (op === "cancelEvent") {
      events = events.map((e) => (e.id === body.id ? { ...e, status: "cancelled" as const } : e));
      const open = guests.filter((g) => g.eventId === body.id && g.status === "paid").slice(0, 2);
      let amountMinor = 0;
      for (const g of open) {
        const back = body.money === false ? 0 : Math.max(0, g.chargedMinor - (g.refundedMinor || 0));
        amountMinor += back;
        Object.assign(g, { refundedTickets: (g.refundedTickets || 0) + g.tickets.length, tickets: [], refundedMinor: (g.refundedMinor || 0) + back, status: "refunded", refundedAt: new Date().toISOString() });
      }
      await new Promise((r) => setTimeout(r, 500));
      return { ok: true, done: open.length, amountMinor, failed: [], left: guests.filter((g) => g.eventId === body.id && g.status === "paid").length };
    }
    if (op === "refund") {
      const order = guests.find((g) => g.id === body.orderId);
      if (!order || order.status !== "paid") throw Object.assign(new Error("That order has no tickets to refund."), { code: "not_found" });
      const codes = (body.codes as string[] | undefined) || order.tickets.map((t) => t.code);
      const counts: Record<string, number> = {};
      for (const t of order.tickets) if (codes.includes(t.code)) counts[t.ticketId] = (counts[t.ticketId] || 0) + 1;
      const tickets = order.tickets.filter((t) => !codes.includes(t.code));
      const amountMinor = body.money === false ? 0 : refundMinorFor(order, counts, tickets.length);
      Object.assign(order, {
        tickets, refundedMinor: (order.refundedMinor || 0) + amountMinor, refundedTickets: (order.refundedTickets || 0) + codes.length,
        ...(tickets.length ? {} : { status: "refunded", refundedAt: new Date().toISOString() }),
      });
      return { ok: true, amountMinor, order: { ...order } };
    }
    return { ok: true };
  };
}

// ── Stockroom › QR codes (?page=stockroom/qrcodes): two items with a card payment link, one without, and one own code
// kept in memory (nothing reaches Firestore). ──
if (/page=stockroom(\/|%2F)qrcodes/.test(window.location.search) && !EMPTY_STOCKROOM) {
  stockroomApi.load = async (): Promise<StockroomRecords> => ({
    books: [
      { id: "salt-hours", title: "Salt Hours", author: "Ada Example", listPrice: 20, stripeLink: "https://buy.stripe.com/test_salt" },
      { id: "night-songs", title: "Night Songs", author: "Ben Example", listPrice: 18, paymentLink: "https://paypal.me/yourpress/18" },
      { id: "ink-maps", title: "Ink Maps", author: "Cleo Example", listPrice: 22 },
    ],
    states: { "salt-hours": { hist: [] }, "night-songs": { hist: [] }, "ink-maps": { hist: [] } }, taxCenter: null,
  });
  let own = [{ id: "c1", name: "Join the mailing list", url: "https://example.com/newsletter" }];
  qrCodesStore.load = async () => own;
  qrCodesStore.save = async (codes) => { own = codes; };
}

// ── Bookkeeping › Receipts › Receipts by email (beta): `?receipts=soon|off|code` (default: on, three waiting). In memory. ──
{
  const mode = new URLSearchParams(window.location.search).get("receipts") || "on";
  const address = "receipts+yourpress.kqmtrwzd@colophon.example";
  const waiting: WaitingReceipt[] = [
    { id: "msg-print-1", from: '"Example Print Co." <billing@print.example>', subject: "Invoice 2291 for your print run", receivedAt: "2026-11-11T15:02:00.000Z", facts: { vendor: "Example Print Co.", what: "Print run, 200 copies", date: "2026-11-10", total: "412.50", tax: "47.45", currency: "CAD", number: "2291" }, looksLike: true, hasFile: true, fileName: "invoice-2291.pdf", snippet: "Thank you for your order. Your invoice 2291 is attached" },
    { id: "msg-post-2", from: "Example Post <no-reply@post.example>", subject: "Your receipt", receivedAt: "2026-11-12T09:40:00.000Z", facts: { vendor: "Example Post", what: "Postage", date: "2026-11-12", total: "18.20", currency: "CAD" }, looksLike: true, hasFile: false, fileName: "", snippet: "Receipt for 2 parcels sent today. Total paid 18.20" },
    { id: "msg-news-3", from: "Paper Fair News <hello@fair.example>", subject: "Table bookings open next week", receivedAt: "2026-11-12T11:15:00.000Z", facts: {}, looksLike: false, hasFile: false, fileName: "", snippet: "Bookings for the spring fair open on Monday" },
  ];
  let view: InboxView = {
    available: mode !== "soon", on: mode === "on" || mode === "code", address: mode === "soon" || mode === "off" ? "" : address,
    checkedAt: new Date(Date.now() - 4 * 60000).toISOString(), gmailCode: mode === "code" ? { code: "482913076", from: "owner@example.com" } : null,
    waiting: mode === "on" ? waiting : [],
  };
  const set = (patch: Partial<InboxView>) => (view = { ...view, ...patch });
  receiptInboxApi.status = async () => view;
  receiptInboxApi.check = async () => set({ checkedAt: new Date().toISOString() });
  receiptInboxApi.start = async () => set({ on: true, address });
  receiptInboxApi.stop = async () => set({ on: false });
  receiptInboxApi.newAddress = async () => set({ address: "receipts+yourpress.hvbnxcpl@colophon.example", gmailCode: null });
  receiptInboxApi.codeSeen = async () => set({ gmailCode: null });
  receiptInboxApi.done = async (id) => { set({ waiting: view.waiting.filter((w) => w.id !== id) }); };
  receiptInboxApi.file = async () => new File(["%PDF-1.4"], "receipt.pdf", { type: "application/pdf" });
}

// ── Orders › Bookings (beta): on, with three services and a week of sample bookings (`?bookings=off`: the platform hasn't
// turned it on; `?bookings=new`: on, nothing set up yet). In memory; changes answer at once. ──
{
  const mode = new URLSearchParams(window.location.search).get("bookings") || "on";
  const service = (id: string, name: string, minutes: number, priceMinor: number, order: number, extra: Partial<BookingService> = {}): BookingService => ({
    id, name, description: "", minutes, gapAfter: 15, priceMinor, payment: priceMinor ? "full" : "free", depositMinor: 0, depositPercent: 0, location: "456 Example Ave", active: true, order, questions: [], places: 1, classTimes: [], holdCard: false, lateFeeMinor: 0, meet: false, packVisits: 0, packPriceMinor: 0, packDays: 0, chargeTax: false, roomId: "", ...extra,
  });
  const CLASSES = (new URLSearchParams(window.location.search).get("ways") || "").split(",").includes("classes");
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  const COURSE_DAYS = [0, 7, 14, 21].map((n) => addDays(monday, 2 + n));
  let services: BookingService[] = mode === "new" ? [] : [
    service("review", "Portfolio review", 30, 0, 0, { description: "Bring your zine or dummy for honest notes.", holdCard: true, lateFeeMinor: 2000, meet: true }),
    service("riso", "Risograph printing session", 60, 4500, 1, { location: "Print room", chargeTax: true, packVisits: 5, packPriceMinor: 18000, packDays: 365, questions: [{ id: "q1", label: "What are you printing?", long: true, required: true }, { id: "q2", label: "How many copies?", long: false, required: false }] }),
    // With Classes on (`?ways=classes&page=classes`) the class is live and a second one runs two evenings a week.
    service("binding", "Bookbinding class", 90, 3000, 2, { active: CLASSES, places: 6, classTimes: [{ weekday: 6, time: "14:00" }] }),
    service("workshop", "Half-day workshop", 180, 12000, 3, { payment: "deposit", depositPercent: 25 }),
    ...(CLASSES ? [service("letterpress", "Letterpress evening", 120, 5500, 4, { places: 8, location: "Print room", classTimes: [{ weekday: 2, time: "18:30" }, { weekday: 4, time: "18:30" }] })] : []),
    // A four-week course on Wednesday mornings, starting this week: one sign-up holds a place on every date.
    ...(CLASSES ? [service("wheel", "Four-week wheel course", 120, 18000, 5, { places: 6, location: "Studio", courseDates: COURSE_DAYS.map((d) => `${d}T10:00`) })] : []),
  ];
  // `?team=1`: a shop with two people and a print room (Team & rooms, the "With" pickers, names on the week's cards).
  const TEAM = new URLSearchParams(window.location.search).get("team") === "1";
  let settings = { ...DEFAULT_BOOKING_SETTINGS, live: mode !== "new", tips: mode === "on",
    ...(TEAM ? {
      rooms: [{ id: "printroom", name: "Print room" }, { id: "chair1", name: "Chair by the window" }],
      staff: [
        { id: "ana", name: "Ana Example", active: true, serviceIds: [], ownHours: false, hours: DEFAULT_BOOKING_SETTINGS.hours, daysOff: [], email: "ana@example.com", commissionPercent: 40 },
        { id: "ben", name: "Ben Example", active: true, serviceIds: ["riso", "workshop"], ownHours: true, hours: [[], [{ start: "12:00", end: "18:00" }], [{ start: "12:00", end: "18:00" }], [], [{ start: "10:00", end: "14:00" }], [], []], daysOff: [], email: "" },
        { id: "cy", name: "Cy Example", active: false, serviceIds: ["review"], ownHours: false, hours: DEFAULT_BOOKING_SETTINGS.hours, daysOff: [], email: "" },
      ],
      // Blocked time (plan 4, 1.3): a weekly team lunch, and one afternoon Ana is out.
      blocks: [
        { id: "lunch", title: "Team lunch", staffId: "", day: addDays(dayOf(Date.now(), shopTimeZone()), -7), start: "12:30", end: "13:15", weekly: true, until: "" },
        { id: "ana-out", title: "Dentist", staffId: "ana", day: addDays(dayOf(Date.now(), shopTimeZone()), 1), start: "14:00", end: "16:00", weekly: false, until: "" },
      ],
    } : {}) } as BookingSettings;
  if (TEAM) services = services.map((s) => (s.id === "riso" ? { ...s, roomId: "printroom" } : s));
  const at = (days: number, hour: number, minute = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, minute, 0, 0); return d.toISOString(); };
  // A weekday (0 Sunday … 6 Saturday) of the week that holds today, Monday first.
  const thisWeek = (weekday: number, hour: number, minute = 0) => at(((weekday + 6) % 7) - ((new Date().getDay() + 6) % 7), hour, minute);
  const plus = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();
  const booking = (id: string, s: BookingService, start: string, customer: string, extra: Partial<Booking> = {}): Booking => ({
    id, serviceId: s.id, serviceName: s.name, minutes: s.minutes, location: s.location, start, end: plus(start, s.minutes),
    customer: { name: customer, email: `${customer.split(" ")[0].toLowerCase()}@example.com` }, status: "confirmed",
    payment: s.priceMinor ? "card" : "free", priceMinor: s.priceMinor, currency: "CAD", paid: s.priceMinor > 0, source: "website",
    ...(TEAM ? (s.id === "riso" || s.id === "workshop" ? { staffId: "ben", staffName: "Ben Example" } : { staffId: "ana", staffName: "Ana Example" }) : {}),
    ...(TEAM && s.roomId ? { roomId: s.roomId, roomName: "Print room" } : {}), ...extra,
  });
  let rows: Booking[] = mode === "on" ? [
    booking("bk-1", services[0], at(0, 11), "Ada Example", { meetUrl: "https://meet.google.com/abc-defg-hij", checkInCode: "K7QM-2XPA" }),
    booking("bk-2", services[1], at(0, 14, 30), "Ben Example", { priceMinor: 5085, taxMinor: 585, taxLines: [{ name: "HST ON", cents: 585 }], tip: { amountMinor: 800, at: at(0, 15, 40) }, note: "First time on a riso.", answers: [{ label: "What are you printing?", answer: "A two-colour zine, 16 pages, A5." }, { label: "How many copies?", answer: "60" }] }),
    booking("bk-3", services[0], at(1, 10), "Cy Example", { source: "admin", series: { id: "run_bk-3", visit: 2, visits: 6, everyWeeks: 5 } }),
    // Made before the team was listed: names nobody, so the Team day shows its Not assigned column.
    ...(TEAM ? [booking("bk-14", services[0], at(0, 12), "Nia Example", { staffId: undefined, staffName: undefined })] : []),
    booking("bk-4", services[1], at(2, 13), "Dee Example", { status: "cancelled", refund: { amountMinor: 4500, at: at(0, 9) } }),
    booking("bk-5", services[2], at(3, 15), "Eve Example", { payment: "atShop", paid: false }),
    booking("bk-6", services[3], at(0, 9), "Flo Example", { payment: "deposit", depositMinor: 3000, depositPaid: true, paid: false, checkInCode: "FLQW-HERE", checkedInAt: at(0, 8, 52) }),
    booking("bk-13", services[3], at(0, 16), "Rue Example", { payment: "deposit", depositMinor: 3000, depositPaid: true, paid: false, checkInCode: "RUE5-TQDA", note: "Bringing my own paper." }),
    booking("bk-8", services[2], at(1, 13), "Hal Example"),
    booking("bk-12", services[1], at(2, 10), "Kai Example", { payment: "pack", priceMinor: 0, listPriceMinor: 4500, paid: true, pack: { id: "p".repeat(40), last4: "K7QD", visit: 2, visits: 5 } }),
    booking("bk-9", services[2], at(1, 13), "Ivy Example", { status: "held", paid: false }),
    booking("bk-10", services[2], at(1, 13), "Jo Example"),
    // Started two hours ago, so Charge fee shows whatever the time of day.
    booking("bk-11", services[0], new Date(Date.now() - 2 * 3_600_000).toISOString(), "Fay Example", { noShow: true, cardHold: true, lateFeeMinor: 2000, card: { customer: "cus_example", paymentMethod: "pm_example", brand: "visa", last4: "4242" } }),
    booking("bk-7", services[1], at(1, 15), "Gus Example", { status: "held", paid: false, clearing: true }),
    // Classes on: people in this week's two classes (Saturday's bookbinding is full, with one still paying).
    ...(CLASSES ? [
      ...["Ada", "Ben", "Cy", "Dee", "Eve"].map((n, i) => booking(`cl-b${i}`, services[2], thisWeek(6, 14), `${n} Example`, i === 0 ? { checkedInAt: thisWeek(6, 13, 52) } : {})),
      booking("cl-b5", services[2], thisWeek(6, 14), "Flo Example", { status: "held", paid: false }),
      ...["Gus", "Hal", "Ivy"].map((n, i) => booking(`cl-t${i}`, services[4], thisWeek(2, 18, 30), `${n} Example`, i === 1 ? {} : { checkedInAt: thisWeek(2, 18, 24) })),
      ...["Jo", "Kai", "Lea", "Mo", "Ned"].map((n, i) => booking(`cl-h${i}`, services[4], thisWeek(4, 18, 30), `${n} Example`, i === 4 ? { payment: "atShop", paid: false } : {})),
      ...["Oz", "Pia", "Quin", "Rae"].map((n, i) => { const starts = COURSE_DAYS.map((d) => new Date(zonedTime(d, "10:00", shopTimeZone())).toISOString()); return booking(`cl-c${i}`, services[5], starts[0], `${n} Example`, { course: { starts, days: COURSE_DAYS } }); }),
    ] : []),
    // A services shop (`?sells=…`): Ben is a regular, for the client card (Customers › Ben): visits, a missed one with a
    // saved card and its fee, answers and a pack.
    ...(new URLSearchParams(window.location.search).get("sells") ? [
      booking("bk-ben-1", services[1], at(-60, 14), "Ben Example", { customer: { name: "Ben Example", email: "ben@example.com", phone: "416 555 0100" } }),
      booking("bk-ben-2", services[1], at(-32, 14), "Ben Example", { noShow: true, cardHold: true, lateFeeMinor: 2000, fee: { amountMinor: 2000, at: at(-32, 16) }, card: { customer: "cus_example", paymentMethod: "pm_example", brand: "visa", last4: "4242" } }),
      booking("bk-ben-3", services[1], at(-12, 14), "Ben Example"),
    ] : []),
  ] : [];
  // With Classes on, the class keeps to its timetable: the Bookings samples at other times are left out.
  if (CLASSES) rows = rows.filter((b) => b.serviceId !== "binding" || b.id.startsWith("cl-"));
  // Two people waiting for tomorrow's full class (the first holding a freed place) and one for a booked-up day (held its first free time).
  const dayAhead = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toLocaleDateString("en-CA"); };
  let waiting = mode === "on" ? [
    { id: "a".repeat(32), serviceId: "binding", serviceName: "Bookbinding class", day: dayAhead(1), start: at(1, 13), name: "Kit Example", email: "kit@example.com", createdAt: at(-1, 9), heldUntil: new Date(Date.now() + 42 * 60_000).toISOString(), heldStart: at(1, 13) },
    { id: "b".repeat(32), serviceId: "binding", serviceName: "Bookbinding class", day: dayAhead(1), start: at(1, 13), name: "Lou Example", email: "lou@example.com", createdAt: at(-1, 12) },
    { id: "c".repeat(32), serviceId: "review", serviceName: "Portfolio review", day: dayAhead(1), start: null, name: "Max Example-Longername", email: "max.longername@example.com", createdAt: at(0, 8), heldUntil: new Date(Date.now() + 100 * 60_000).toISOString(), heldStart: at(1, 16) },
  ] : [];
  // Six months of older bookings for the Figures tab: busier each month, Saturdays busiest, a few no-shows and one kept deposit.
  const history: Booking[] = mode === "on" ? Array.from({ length: 64 }, (_, i) => {
    const s = services[i % 3];
    const days = -(8 + Math.round((63 - i) * 2.6) + (i % 5 === 0 ? 0 : (6 - new Date(Date.now() - (8 + Math.round((63 - i) * 2.6)) * 86_400_000).getDay()) % 3));
    return booking(`old-${i}`, s, at(days, 10 + (i % 6)), `Guest ${i + 1}`, {
      // The riso session charges 13% HST on top of its $45 price.
      ...(s.chargeTax ? { priceMinor: 5085, taxMinor: 585, taxLines: [{ name: "HST ON", cents: 585 }] } : {}),
      ...(i % 11 === 0 ? { noShow: true } : {}),
      ...(i % 13 === 5 ? { status: "cancelled" as const, refund: s.priceMinor ? { amountMinor: s.priceMinor - 1000, at: at(days - 1, 9) } : null } : {}),
    });
  }) : [];
  // Packs of visits for the Packs tab: one running out, one fresh, one ending soon, one used up and one closed.
  const pk = (id: string, name: string, left: number, extra: Partial<PackRow> = {}): PackRow => ({
    id: id.repeat(40).slice(0, 40), last4: name.slice(0, 2).toUpperCase() + "7Q", serviceId: "riso", serviceName: "Risograph printing session", name, email: `${name.split(" ")[0].toLowerCase()}@example.com`,
    visits: 5, left, status: "active", priceMinor: 18000, currency: "CAD", expiresOn: dayAhead(300), paidAt: at(-20, 10), refundMinor: 0, uses: [], ...extra,
  });
  let packRows: PackRow[] = mode === "on" ? [
    pk("p", "Kai Example", 3), pk("q", "Lea Example", 1), pk("r", "Mo Example", 5, { paidAt: at(-1, 9) }), pk("s", "Ned Example", 2, { expiresOn: dayAhead(9) }),
    pk("t", "Oda Example", 0, { paidAt: at(-90, 9) }), pk("u", "Pat Example", 2, { status: "closed", refundMinor: 7200, paidAt: at(-60, 9) }),
    ...(new URLSearchParams(window.location.search).get("sells") ? [pk("v", "Ben Example", 2)] : []),
  ] : [];
  const watchers = new Set<() => void>();
  const changed = () => watchers.forEach((w) => w());
  const readerMode = new URLSearchParams(window.location.search).get("readers") || "";
  const textsSoon = new URLSearchParams(window.location.search).get("texts") === "soon";
  const DECLINE = new URLSearchParams(window.location.search).get("reader") === "decline";
  let readerList: { id: string; label: string; online: boolean | null; device: string }[] = readerMode === "empty" ? [] : readerMode === "square" ? [
    { id: "sqdev_fixture1", label: "Test reader", online: true, device: "Square Terminal" },
  ] : [
    { id: "tmr_fixture1", label: "Front desk", online: true, device: "WisePOS E" },
    { id: "tmr_fixture2", label: "Back room", online: false, device: "Reader S700" },
  ];
  bookingsData.watchOn = (onChange) => { onChange(mode !== "off"); return () => {}; };
  bookingsData.readSetup = async () => ({ services: [...services], settings, saved: mode !== "new" });
  bookingsData.follow = (from, to, onRows) => {
    const send = () => onRows([...rows, ...history].filter((b) => b.start >= from && b.start < to).sort((a, b) => a.start.localeCompare(b.start)));
    watchers.add(send); send();
    return () => void watchers.delete(send);
  };
  bookingsData.followCourse = (days, onRows) => {
    const send = () => onRows(rows.filter((b) => b.course?.days.some((d) => days.includes(d))));
    watchers.add(send); send();
    return () => void watchers.delete(send);
  };
  bookingsData.range = async (from, to) => [...rows, ...history].filter((b) => b.start >= from && b.start < to);
  bookingsData.admin = async (op, body) => {
    const id = String(body.id ?? "");
    if (op === "saveService") { const s = body.service as BookingService; services = [...services.filter((x) => x.id !== s.id), { ...s, id: s.id || `svc-${services.length + 1}` }]; }
    if (op === "deleteService") services = services.filter((x) => x.id !== id);
    if (op === "saveSettings") settings = { ...settings, ...(body.settings as object) };
    if (op === "setLive") settings = { ...settings, live: body.live === true };
    if (op === "addBlock") {
      const [made] = cleanBlocks([{ ...(body.block as object), id: `blk-${Date.now().toString(36)}` }]);
      if (!made) throw new Error("Pick a day and a start before the end.");
      settings = { ...settings, blocks: [...(settings.blocks || []), made] };
      return { ok: true, id: made.id, blocks: settings.blocks };
    }
    if (op === "removeBlock") { settings = { ...settings, blocks: (settings.blocks || []).filter((b) => b.id !== id) }; return { ok: true, blocks: settings.blocks }; }
    if (op === "cancel") rows = rows.map((b) => (b.id === id ? { ...b, status: "cancelled", ...(b.pack && body.packBack !== false ? { pack: { ...b.pack, returned: true } } : {}) } : b));
    if (op === "waitlist") return { waiting: waiting.filter((w) => w.day >= String(body.from) && w.day <= String(body.to)) };
    if (op === "packs") return { packs: packRows };
    // The form before the first visit: the fixture's first client signed it.
    if (op === "clientForm") {
      const form = (settings as { intakeForm?: { on: boolean; title: string; text: string } }).intakeForm;
      const first = rows[0]?.customer?.email;
      return { asks: !!form?.on, form: form?.on && body.email === first ? { signedName: rows[0].customer.name, signedAt: "2026-11-10T15:00:00.000Z", title: form.title, text: form.text, answers: [{ label: "Allergies", answer: "None" }], current: true } : null };
    }
    if (op === "packClose") { packRows = packRows.map((p) => (p.id === id ? { ...p, status: "closed", refundMinor: Number(body.refundMinor || 0) } : p)); return { ok: true }; }
    if (op === "removeWaiting") { waiting = waiting.filter((w) => w.id !== id); return { ok: true }; }
    if (op === "calendarFeed") return { path: `/calendar/${"c".repeat(48)}.ics` };
    // A person's own Google Calendar: Ana's is linked; `?teamcal=soon` is a platform without the later Google round.
    if (op === "teamCalendar") {
      if (new URLSearchParams(window.location.search).get("teamcal") === "soon") return { available: false };
      if (body.step === "status") return { available: true, people: { ana: { linked: true, accountEmail: "ana@example.com" } } };
      if (body.step === "link") return { available: true, url: "https://accounts.google.com/o/oauth2/v2/auth?state=example", sent: body.send === true };
      return { ok: true };
    }
    // Text reminders: open with a price, or ?texts=soon for a platform without the text company's keys.
    if (op === "textStatus") return textsSoon ? { available: false, price: "" } : { available: true, price: "1.6¢" };
    if (op === "walkIn") {
      const s = services.find((x) => x.id === body.serviceId) || services[0];
      const walk = booking(`walk-${rows.length + 1}`, s, new Date().toISOString(), String(body.name), { payment: "atShop", paid: false, priceMinor: Number(body.priceMinor ?? s.priceMinor), source: "admin", customer: { name: String(body.name), email: String(body.email || "") } });
      rows = [...rows, walk];
      changed();
      return { ok: true, id: walk.id, url: `https://press.example/book?booking=${walk.id}&key=${"e".repeat(48)}`, dueMinor: walk.priceMinor };
    }
    // Card readers (?readers=none for no card payments, ?readers=empty for none added yet, ?readers=square for Square
    // Terminals paired by code, ?reader=decline to decline the test card). Add and Remove answer as the server does.
    if (op === "readers" || op === "readerAdd" || op === "readerRemove") {
      if (readerMode === "none") return { available: false, readers: [] };
      const square = readerMode === "square";
      if (op === "readerAdd") {
        readerList = [...readerList, square
          ? { id: `sqdev_fixture${readerList.length + 1}`, label: String(body.label || "Front desk"), online: null, device: "Square Terminal" }
          : { id: `tmr_fixture${readerList.length + 1}`, label: String(body.label || "Front desk"), online: true, device: "WisePOS E" }];
        return square ? { ok: true, pairing: { code: "EBCARJ", pairBy: new Date(Date.now() + 5 * 60_000).toISOString() } } : { ok: true, reader: readerList.at(-1) };
      }
      if (op === "readerRemove") { readerList = readerList.filter((r) => r.id !== body.readerId); return { ok: true }; }
      return { available: true, testMode: true, pairsWithCode: square, readers: readerList };
    }
    if (op === "readerCharge" || op === "readerCheck" || op === "readerCancel" || op === "readerTest") {
      const b = rows.find((x) => x.id === id);
      if (b && op === "readerCharge") rows = rows.map((x) => (x.id === id ? { ...x, readerOpen: true, readerError: "", readerCharge: { readerId: String(body.readerId), amountMinor: x.priceMinor, at: new Date().toISOString() } } : x));
      if (b && op === "readerCancel") rows = rows.map((x) => (x.id === id ? { ...x, readerOpen: false, readerCharge: null } : x));
      if (b && op === "readerTest") rows = rows.map((x) => (x.id !== id ? x : DECLINE
        ? { ...x, readerOpen: false, readerCharge: null, readerError: "The card was declined. Ask for another card, or try again." }
        : { ...x, readerOpen: false, readerCharge: null, rest: { amountMinor: x.priceMinor, at: new Date().toISOString(), reader: true } }));
      changed();
      const now = rows.find((x) => x.id === id);
      return { ok: true, state: now?.readerOpen ? "waiting" : now?.rest?.reader ? "paid" : "idle", error: now?.readerOpen ? "" : now?.readerError || "", dueMinor: now?.priceMinor || 0 };
    }
    if (op === "payLink") return { ok: true, url: `https://press.example/book?booking=${id}&key=${"d".repeat(48)}`, sent: body.send === true };
    if (op === "noShow") rows = rows.map((b) => (b.id === id ? { ...b, noShow: true } : b));
    if (op === "checkIn") {
      // As the server: by code or id, today only, once; the answer says who it was.
      const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const b = rows.find((r) => (code ? (r.checkInCode || "").replace("-", "") === code : r.id === id));
      if (!b) throw Object.assign(new Error("No booking has that check-in code. Check the letters, or find them in Bookings."), { code: "unknown_code" });
      const card = (x: Booking) => ({ id: x.id, name: x.customer.name, serviceName: x.serviceName, start: x.start, end: x.end, minutes: x.minutes, status: x.status,
        dueMinor: x.payment === "deposit" && !x.paid ? x.priceMinor - (x.depositMinor || 0) : x.payment === "atShop" && !x.paid ? x.priceMinor : 0, currency: x.currency, note: x.note || "", checkedInAt: x.checkedInAt || null, checkInCode: x.checkInCode || "" });
      if (body.value === false) { rows = rows.map((r) => (r.id === b.id ? { ...r, checkedInAt: null } : r)); changed(); return { ok: true, booking: card({ ...b, checkedInAt: null }) }; }
      if (new Date(b.start).toDateString() !== new Date().toDateString()) throw Object.assign(new Error("This booking is for another day, not today."), { code: "not_today", answer: { booking: card(b) } });
      if (b.checkedInAt) return { ok: true, already: true, booking: card(b) };
      const next = { ...b, checkedInAt: new Date().toISOString() };
      rows = rows.map((r) => (r.id === b.id ? next : r));
      changed();
      return { ok: true, booking: card(next) };
    }
    if (op === "chargeFee") rows = rows.map((b) => (b.id === id ? { ...b, fee: { amountMinor: Number(body.amountMinor ?? b.lateFeeMinor), at: new Date().toISOString(), reason: "missed booking" } } : b));
    if (op === "paidAtShop") rows = rows.map((b) => (b.id === id ? { ...b, paid: true } : b));
    if (op === "move") {
      // A taken time is refused until the owner says to book over it (plan 4, 1.4).
      const self = rows.find((b) => b.id === id);
      const startMs = Date.parse(String(body.start));
      const endMs = startMs + Number(body.minutes ?? self?.minutes ?? 60) * 60_000;
      const clash = rows.some((b) => b.id !== id && b.status === "confirmed" && Date.parse(b.start) < endMs && Date.parse(b.end) > startMs
        && (!b.staffId || !self?.staffId || b.staffId === (typeof body.staffId === "string" ? body.staffId : self.staffId)));
      if (clash && body.over !== true) throw Object.assign(new Error("That time clashes with another booking."), { code: "taken" });
      const to = typeof body.staffId === "string" ? settings.staff.find((p) => p.id === body.staffId) : undefined;
      rows = rows.map((b) => (b.id === id ? { ...b, start: String(body.start), end: plus(String(body.start), b.minutes), ...(to ? { staffId: to.id, staffName: to.name } : {}) } : b));
    }
    if (op === "runCheck") {
      // Every date of the run at the picked time; the third is taken, so the warning can be seen.
      const run = body.run as { everyWeeks: number; visits: number };
      const first = Date.parse(String(body.start));
      return { visits: Array.from({ length: run.visits }, (_, n) => ({ start: new Date(first + n * run.everyWeeks * 7 * 86_400_000).toISOString(), free: n !== 2 })) };
    }
    if (op === "times") {
      const day = String(body.day || new Date().toLocaleDateString("en-CA"));
      return { times: [10, 10.5, 11, 13, 14.5, 15].map((h) => new Date(`${day}T${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}:00`).toISOString()) };
    }
    changed();
    return { ok: true };
  };
}

// ── Customers › a client › Visit notes and photos (services shops, `?sells=hair`): Ben has two visits, one with
// before and after photos. Kept in memory; photos are drawn pictures, uploads become the picked file itself.
{
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
  const dayOf = (d: Date) => d.toLocaleDateString("en-CA");
  const picture = (label: string, hue: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="hsl(${hue},45%,72%)"/><circle cx="300" cy="250" r="120" fill="hsl(${hue},40%,52%)"/><rect x="150" y="380" width="300" height="160" rx="70" fill="hsl(${hue},40%,52%)"/><text x="300" y="80" font-family="sans-serif" font-size="44" text-anchor="middle" fill="#1d1b17">${label}</text></svg>`)}`;
  const files = new Map<string, string>();
  let visits: ClientVisit[] = [];
  let made = false;
  const seed = async (client: string) => {
    if (made || client !== await emailHash("ben@example.com")) return;
    made = true;
    const p = (name: string) => `${clientPhotoFolder(client)}/${name}`;
    files.set(p("before-1-a.jpg"), picture("Before", 28));
    files.set(p("after-1-b.jpg"), picture("After", 280));
    files.set(p("after-1-c.jpg"), picture("After", 300));
    visits = [
      { id: "v-1", client, email: "ben@example.com", day: dayOf(ago(12)), note: "Root touch-up. 6N + 20 vol, 35 min. Toner 9V on the ends, 10 min.\nNext time: try 7N, he found it a little dark.", photos: [{ path: p("before-1-a.jpg"), kind: "before" }, { path: p("after-1-b.jpg"), kind: "after" }, { path: p("after-1-c.jpg"), kind: "after" }], createdAt: ago(12).toISOString(), updatedAt: ago(12).toISOString() },
      { id: "v-2", client, email: "ben@example.com", day: dayOf(ago(60)), note: "First visit. Allergy patch test clear. Full colour 6N.", photos: [], createdAt: ago(60).toISOString(), updatedAt: ago(60).toISOString() },
    ];
  };
  clientVisitsData.list = async (client) => { await seed(client); return visits.filter((v) => v.client === client).sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt)); };
  clientVisitsData.write = async (id, record) => { const vid = id || `v-${Date.now()}`; visits = [{ ...record, id: vid }, ...visits.filter((v) => v.id !== vid)]; return vid; };
  clientVisitsData.erase = async (id) => { visits = visits.filter((v) => v.id !== id); };
  clientVisitsData.upload = async (client, kind, file) => { const path = `${clientPhotoFolder(client)}/${photoFileName(kind, Date.now(), Math.random().toString(36).slice(2, 8))}`; files.set(path, URL.createObjectURL(file)); return path; };
  clientVisitsData.photoUrl = async (path) => { const url = files.get(path); if (!url) throw new Error("missing"); return url; };
  clientVisitsData.removeFiles = async (paths) => { for (const p of paths) files.delete(p); };
}

// ── Bookkeeping › Transactions › Bank feed (beta, a paid add-on): `?bank=soon|off|connect|signin|empty` (default: one
// bank, seven lines to review). In memory; Connect your bank answers at once, with no bank window. ──
{
  const mode = new URLSearchParams(window.location.search).get("bank") || "on";
  const bank = { id: "bank-1", name: "Example Bank", accounts: ["Chequing ••4417", "Savings ••9020"], connectedAt: "2026-11-10T14:00:00.000Z", needsSignIn: mode === "signin" };
  const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toLocaleDateString("en-CA");
  const line = (id: string, ago: number, cents: number, name: string, extra: Partial<BankLine> = {}): BankLine => ({ id, bankId: "bank-1", date: day(ago), cents, currency: "CAD", name, account: "Chequing ••4417", ...extra });
  // The sample payouts' own amounts, a day after each was sent, so they match; then costs: one already logged with its
  // receipt, one a sorting rule knows, one new, and one the bank hasn't settled.
  const sample = async (): Promise<BankLine[]> => {
    const { reconcileModel } = await import("../app/admin/stockroom/reconcileModel");
    const { getOrdersCached } = await import("../app/admin/ordersCache");
    const payouts = reconcileModel(await getOrdersCached().catch(() => [])).payouts.filter((p) => p.date).slice(0, 2);
    return [
      line("t7", 0, -1820, "EXAMPLE POST #4471 TORONTO", { pending: true }),
      line("t6", 1, -1695, "CANVA* 02913-88112"),
      line("t5", 2, 11250, "E-TRANSFER FROM A. EXAMPLE"),
      line("t4", 2, -41250, "EXAMPLE PRINT CO"),
      line("t3", 3, -6400, "PAPER SUPPLY EXAMPLE"),
      ...payouts.map((p, i) => ({ ...line(`p${i}`, 0, p.netCents, "STRIPE PAYOUT"), date: new Date(Date.parse(`${p.date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10) })),
    ];
  };
  let waiting: BankLine[] = [];
  let view: BankView = {
    available: mode !== "soon", addOn: { on: mode !== "soon" && mode !== "off", price: "CA$4", extraPrice: "CA$1.50", included: 2 },
    banks: mode === "on" || mode === "signin" || mode === "empty" ? [bank] : [], checkedAt: new Date(Date.now() - 6 * 60000).toISOString(),
    waiting: [], matches: [],
  };
  let filled = false;
  const set = (patch: Partial<BankView>) => (view = { ...view, ...patch });
  bankFeedApi.status = async () => {
    if (!filled) { filled = true; waiting = await sample(); if (mode === "on" || mode === "signin") set({ waiting }); }
    return view;
  };
  bankFeedApi.check = async () => set({ checkedAt: new Date().toISOString() });
  bankFeedApi.connect = async (bankId) => (bankId ? set({ banks: view.banks.map((b) => ({ ...b, needsSignIn: false })) }) : set({ banks: [...view.banks, view.banks.length ? { ...bank, id: `bank-${view.banks.length + 1}`, name: "Example Credit Union", accounts: ["Business ••1203"], needsSignIn: false } : bank], waiting: view.banks.length ? view.waiting : waiting }));
  bankFeedApi.disconnect = async (bankId) => set({ banks: view.banks.filter((b) => b.id !== bankId), waiting: view.waiting.filter((l) => l.bankId !== bankId) });
  bankFeedApi.decide = async (matches) => set({ waiting: view.waiting.filter((l) => !matches.some((m) => m.lineId === l.id)), matches: [...view.matches, ...matches] });
}

// --- Stockroom money pages (Tax centre, Expenses, Ask about your sales): sample records, only for those pages ---
if (/page=stockroom(\/|%2F)(tax[a-z]+|expenses|intel|books|reconcile|receipts|artists)/.test(window.location.search) && !EMPTY_STOCKROOM) {
  stockroomApi.load = async (): Promise<StockroomRecords> => ({
    books: [
      { id: "salt-hours", title: "Salt Hours", author: "Ada Example", currency: "CA$", maxPrint: 200, threshold: 10, listPrice: 20, productionCost: 0, profitTiers: [{ revenueUpTo: null, artistPct: 50 }] },
      { id: "night-songs", title: "Night Songs", author: "Ben Example", currency: "€", maxPrint: 150, threshold: 10, listPrice: 18 },
    ],
    states: {
      "salt-hours": {
        hist: [
          { id: 1, date: "2026-03-04", num: "A1", qty: 2, price: 20, chan: "Direct", shippingPaid: 6 },
          { id: 2, date: "2025-11-02", num: "A0", qty: 1, price: 20, chan: "Website" },
          { id: 3, date: "2026-05-01", num: "V1", qty: 1, price: 20, chan: "Direct", voided: true },
          { id: 4, date: "2026-06-12", num: "A2", qty: 4, price: 20, chan: "Book fair" },
          { id: 6, date: "2026-10-18", num: "P1", qty: 5, price: 20, chan: "Book Fair" },
          { id: 7, date: "2026-11-02", num: "C1", qty: 3, price: 12, chan: "Consignment" },
          { id: 8, date: "2026-11-05", num: "F2", qty: 4, price: 20, chan: "Book fair", artistPending: true },
        ],
        expenses: [
          { id: 11, date: "2026-02-10", desc: "Print run", cat: "Printing", amount: 300, currency: "CAD", baseAmount: 300, receipt: "cloud://receipts/print-run.pdf" },
          { id: 12, date: "2026-04-01", desc: "Freight to warehouse", cat: "Shipping & Postage", amount: 64.5, currency: "CAD", baseAmount: 64.5 },
        ],
        artistPayouts: [{ id: 21, date: "2026-07-01", amount: 50, method: "e-transfer" }],
      },
      "night-songs": {
        hist: [{ id: 5, date: "2026-03-09", num: "B1", qty: 3, price: 10, chan: "Direct" }],
        expenses: [{ id: 13, date: "2026-03-15", desc: "Cover design", cat: "Design", amount: 120, currency: "EUR", received: false }],
      },
    },
    taxCenter: {
      settings: { baseCurrency: "CAD", rates: { EUR_CAD: 1.5, USD_CAD: 1.35 } },
      trips: [{ name: "Toronto Book Fair", destination: "Toronto", startDate: "2026-06-11", endDate: "2026-06-13" }],
      businessExpenses: [
        { id: 31, date: "2026-06-11", desc: "Booth fee", cat: "Booths & Fairs", amount: 250, currency: "CAD", baseAmount: 250, trip: "Toronto Book Fair", receipt: "cloud://receipts/booth.pdf" },
        { id: 32, date: "2026-06-12", desc: "Team lunch", cat: "Meals & Entertainment", amount: 80, currency: "CAD", baseAmount: 80, trip: "Toronto Book Fair" },
        { id: 33, date: "2026-08-02", desc: "Mailing supplies", cat: "Supplies", amount: 40, currency: "USD", baseAmount: 54 },
        { id: 34, date: "2025-09-09", desc: "Website hosting", cat: "Software", amount: 20, currency: "CAD", baseAmount: 20 },
        // Bank feed (beta): the print run the sample bank line matches, logged with its receipt two days ago.
        { id: 35, date: new Date(Date.now() - 3 * 86_400_000).toLocaleDateString("en-CA"), desc: "Print run, 200 copies", vendor: "Example Print Co.", cat: "Printing & Production", amount: 412.5, currency: "CAD", origCurrency: "CAD", origAmount: 412.5, baseAmount: 412.5, receipt: "cloud://receipts/print-run-2.pdf" },
      ],
      expenseRules: [{ id: "rule-canva", match: "Canva", cat: "Software & Subscriptions", createdAt: "2026-10-01T12:00:00.000Z" }],
      recurring: [{ id: "r1", desc: "Website hosting", vendor: "Host Example", cat: "Software", amount: 20, currency: "CAD", frequency: "monthly", startDate: "2026-01-01", day: 1 }],
    },
  });
}
// --- end of the stockroom money pages block ---
// ── Stockroom › Stock and sales fixture (only for ?page=stockroom/dashboard): four items, one with a stale saved count,
// a voided sale, a store holding copies, a write-off and a held artist payment; one sold out.
if (new URLSearchParams(window.location.search).get("page") === "stockroom/dashboard" && !EMPTY_STOCKROOM) {
  stockroomApi.load = async (): Promise<StockroomRecords> => ({
    books: [
      { id: "salt-hours", title: "Salt Hours", author: "Ada Example", maxPrint: 200, threshold: 10, listPrice: 20, currency: "$" },
      { id: "night-songs", title: "Night Songs", author: "Ben Example", maxPrint: 150, threshold: 10, listPrice: 18, currency: "$" },
      { id: "tide-tables", title: "Tide Tables", author: "Cleo Example", maxPrint: 60, threshold: 8, listPrice: 12, currency: "€" },
      { id: "last-light", title: "Last Light", author: "Dev Example", maxPrint: 40, threshold: 5, listPrice: 25, currency: "$" },
    ],
    states: {
      "salt-hours": { stock: 999, hist: [{ id: 1, qty: 120, price: 20, chan: "Website", date: "2026-10-01" }, { id: 2, qty: 5, price: 20, chan: "Fair", date: "2026-10-04" }, { id: 3, qty: 9, price: 20, chan: "Website", voided: true }], ledger: [], stores: [] },
      "night-songs": {
        hist: [{ id: 1, qty: 40, price: 18, chan: "Website", date: "2026-10-02" }, { id: 2, qty: 6, price: 18, chan: "Consignment", consignmentLink: true, notes: "Corner Books", date: "2026-10-09" }],
        ledger: [{ id: "s1", type: "Shipment", storeId: "st1", storeName: "Corner Books", qty: 30, date: "2026-10-05" }, { id: "s2", type: "Sale", storeId: "st1", storeName: "Corner Books", qty: 6, amountDue: 108, date: "2026-10-09" }, { id: "w1", type: "Inventory Disposal", qty: 4, date: "2026-10-11", status: "written off" }],
        stores: [{ id: "st1", name: "Corner Books", sent: 0, sold: 0, returned: 0, outstanding: 0 }],
      },
      "tide-tables": { authorStock: 10, hist: [{ id: 1, qty: 38, price: 12, chan: "Website" }, { id: 2, qty: 2, price: 0, chan: "Gift", gratuity: true }], artistTransfers: [{ chan: "Fair", qty: 4, price: 12, total: 48 }], ledger: [], stores: [] },
      "last-light": { hist: [{ id: 1, qty: 40, price: 25, chan: "Website" }], ledger: [], stores: [] },
    },
    taxCenter: null,
  });
}

// ── Stockroom › Sales records + Customers sample (sales worker): a third title with real-shaped sales (order number,
// channel, price, date, email), a voided one, a gift, one recorded in US dollars, a consignment shipment, repeat buyers,
// and enough rows to page. Added on top of whatever the block above loaded.
{
  const base = stockroomApi.load;
  stockroomApi.load = async (): Promise<StockroomRecords> => {
    const records = await base();
    if (EMPTY_STOCKROOM) return records;
    const people = [["Ada Example", "ada@example.com"], ["Ben Example", "ben@example.com"], ["Cleo Example", "cleo@example.com"], ["Dee Example", "dee@example.com"]];
    const hist: Array<Record<string, unknown>> = Array.from({ length: 64 }, (_, i) => {
      const [name, email] = people[i % people.length];
      const day = String(1 + (i % 28)).padStart(2, "0");
      return { num: `${1100 + i}`, chan: ["Website", "POS", "Direct", "Book Fair"][i % 4], qty: 1 + (i % 3), price: 22, date: `2026-10-${day}`, shipName: name, shipEmail: email, notes: i % 9 === 0 ? "Signed copy" : "", enteredBy: "Publisher" };
    });
    hist.push(
      { num: "1200", chan: "Website", qty: 2, price: 22, date: "2026-10-30", shipName: "Eve Example", shipEmail: "eve@example.com", voided: true, voidedAt: Date.parse("2026-10-31T12:00:00Z") },
      { num: "1201", chan: "Gratuity", qty: 1, price: 0, date: "2026-10-29", notes: "Gift to a reviewer", gratuity: true },
      { num: "1202", chan: "Website", qty: 1, price: 25, date: "2026-10-28", cur: "USD", shipName: "Fay Example", shipEmail: "fay@example.com", payment: { currency: "USD", amount: 25, convertedTotal: 25 } },
    );
    return {
      ...records,
      books: [...records.books, { id: "paper-moons", title: "Paper Moons", author: "Cleo Example", maxPrint: 400, threshold: 20, listPrice: 22, currency: "CAD" }],
      states: { ...records.states, "paper-moons": { hist, ledger: [{ type: "Shipment", storeName: "Corner Books", qty: 20, date: "2026-10-05", notes: "First delivery" }] } },
    };
  };
}

// ── Stockists / Shipping / Open call samples (block of the stockists page; adds to the records above) ──
{
  const base = stockroomApi.load;
  const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
  stockroomApi.load = async () => {
    const r = await base();
    if (!r.books.length) return r;
    r.books = r.books.map((b) => ({ currency: "CAD", ...b }));
    const [salt, night] = ["salt-hours", "night-songs"];
    const sale = (id: number, storeId: number, storeName: string, ago: number, qty: number, status: string) => ({ id, type: "Sale", storeId, storeName, date: day(ago), qty, rate: 40, amountDue: qty * 12, status, sheetsId: `s${id}` });
    const ship = (id: number, storeId: number, storeName: string, ago: number, qty: number) => ({ id, type: "Shipment", storeId, storeName, date: day(ago), qty, amountDue: 0, status: "OK", sheetsId: `s${id}` });
    const web = (num: string, ago: number, extra: object = {}) => ({ id: Number(num.slice(4)), chan: "Website", num, date: day(ago), qty: 1, shipName: `Customer ${num}`, shipAddr1: "1 Example St", shipCity: "Toronto", shipCountry: "Canada", shippingPaid: 8, ...extra });
    r.states[salt] = {
      ...r.states[salt],
      stores: [
        { id: 1, name: "Corner Books", city: "Toronto", region: "ON", country: "Canada", rate: 40, sent: 10, sold: 4, returned: 0, outstanding: 6, amountOwed: 48 },
        { id: 2, name: "Harbour Gifts", city: "Halifax", region: "NS", country: "Canada", rate: 40, sent: 6, sold: 6, returned: 0, outstanding: 0, amountOwed: 0 },
        { id: 3, name: "Lakeside Co-op", city: "Kingston", region: "ON", country: "Canada", rate: 35, sent: 8, sold: 2, returned: 0, outstanding: 5, amountOwed: 24 },
      ],
      ledger: [ship(1, 1, "Corner Books", 90, 10), sale(2, 1, "Corner Books", 40, 4, "pending"), ship(3, 2, "Harbour Gifts", 80, 6), sale(4, 2, "Harbour Gifts", 30, 6, "paid"), ship(5, 3, "Lakeside Co-op", 60, 8), sale(6, 3, "Lakeside Co-op", 20, 2, "pending")],
      invoices: [
        { id: "i1", num: "INV-2026-001", status: "sent", date: day(60), dueDate: day(20), total: 48, currency: "CAD", storeName: "Corner Books", storeId: 1, storeEmail: "shop@example.com", items: [{ _ledgerId: 2 }], reminders: [{ status: "sent", at: Date.now() - 5 * 86_400_000, kind: "auto" }] },
        { id: "i2", num: "INV-2026-002", status: "paid", date: day(70), dueDate: day(40), total: 72, currency: "CAD", storeName: "Harbour Gifts", storeId: 2 },
        { id: "i3", num: "INV-2026-003", status: "sent", date: day(10), dueDate: day(-20), total: 24, currency: "CAD", storeName: "Lakeside Co-op", storeId: 3 },
      ],
      // Quotes and repeating invoices (?page=stockroom/quotes, stockroom/recurring).
      quotes: [
        { id: "q1", num: "Q-2026-001", kind: "quote", status: "sent", date: day(6), validUntil: day(-24), total: 180, subtotal: 180, currency: "CAD", currencyCode: "CAD", storeName: "Corner Books", storeId: 1, storeEmail: "shop@example.com", billTo: "store", items: [{ description: "Salt Hours", qty: 15, unitPrice: 12 }] },
        { id: "q2", num: "Q-2026-002", kind: "quote", status: "accepted", date: day(20), validUntil: day(-10), total: 96, subtotal: 96, currency: "CAD", currencyCode: "CAD", storeName: "Harbour Gifts", storeId: 2, billTo: "store", acceptedAt: Date.now() - 12 * 86_400_000, invoiceId: "i2", invoiceNum: "INV-2026-002", items: [{ description: "Salt Hours", qty: 8, unitPrice: 12 }] },
        { id: "q3", num: "Q-2026-003", kind: "quote", status: "sent", date: day(45), validUntil: day(15), total: 60, subtotal: 60, currency: "CAD", currencyCode: "CAD", storeName: "Lakeside Co-op", storeId: 3, billTo: "store", items: [{ description: "Salt Hours", qty: 5, unitPrice: 12 }] },
        { id: "q4", num: "Q-2026-004", kind: "quote", status: "draft", date: day(1), validUntil: day(-29), total: 240, subtotal: 240, currency: "CAD", currencyCode: "CAD", storeName: "Fern Reading Room", billTo: "person", items: [{ description: "Salt Hours, signed", qty: 12, unitPrice: 20 }] },
      ],
      recurringInvoices: [
        { id: "rep-a", kind: "recurring", status: "active", every: "month", nextDate: day(-9), anchorDay: Number(day(-9).slice(8)), dueDays: 14, autoEmail: true, total: 120, subtotal: 120, currency: "CAD", currencyCode: "CAD", storeName: "Corner Books", storeId: 1, storeEmail: "shop@example.com", billTo: "store", items: [{ description: "Monthly restock", qty: 10, unitPrice: 12 }], made: [{ date: day(21), invoiceId: "i1", num: "INV-2026-001" }] },
        { id: "rep-b", kind: "recurring", status: "active", every: "quarter", nextDate: day(-40), anchorDay: 1, dueDays: 30, autoEmail: false, total: 45, subtotal: 45, currency: "CAD", currencyCode: "CAD", storeName: "Fern Reading Room", billTo: "person", items: [{ description: "Subscription", qty: 3, unitPrice: 15 }], made: [] },
        { id: "rep-c", kind: "recurring", status: "paused", every: "week", nextDate: day(-3), dueDays: 7, autoEmail: true, total: 24, subtotal: 24, currency: "CAD", currencyCode: "CAD", storeName: "Lakeside Co-op", storeId: 3, billTo: "store", items: [{ description: "Weekly zines", qty: 2, unitPrice: 12 }], made: [] },
      ],
      hist: [...((r.states[salt] as { hist?: unknown[] }).hist || []), web("WEB-1041", 9), web("WEB-1042", 4), web("WEB-1043", 1), web("WEB-1044", 12, { trackingNumber: "7023110000451" }), web("WEB-1045", 6, { shipName: "Ben Example" })],
    };
    r.states[night] = {
      ...r.states[night],
      stores: [{ id: 11, name: "Corner Books", city: "Toronto", region: "ON", country: "Canada", rate: 40, sent: 5, sold: 1, returned: 0, outstanding: 4, amountOwed: 12 }],
      ledger: [ship(21, 11, "Corner Books", 50, 5), sale(22, 11, "Corner Books", 15, 1, "pending")],
      openCall: [
        { id: "c1", name: "Mira Example", email: "mira@example.com", selectionSent: true, creditReceived: false, createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString() },
        { id: "c2", name: "Theo Example", email: "theo@example.com", selectionSent: false, createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
        { id: "c3", name: "Noor Example", email: "", selectionSent: true, creditReceived: true, cmykSent: false, createdAt: new Date(Date.now() - 12 * 86_400_000).toISOString() },
        { id: "c4", name: "Ana Example", email: "ana@example.com", selectionSent: true, creditReceived: true, cmykSent: true, filesReceived: true, preorderSent: true, createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString() },
      ],
    };
    const postage = (num: string, amount: number) => ({ id: `p${num}`, cat: "Shipping & Postage", desc: "Canada Post label", amount, baseAmount: amount, shippingMatchStatus: "matched", shippingOrderNumber: num });
    const kept = ((r.taxCenter as Record<string, any> | null)?.businessExpenses || []) as Record<string, unknown>[];
    // Bills to pay (?page=stockroom/bills): one late, one due soon, one later, one paid.
    const bill = (id: string, supplier: string, desc: string, amount: number, due: number, extra: object = {}) => ({ id, supplier, desc, cat: "Printing & Production", amount, currency: "CAD", billDate: day(due + 30), dueDate: day(due), ref: `B-${id}`, status: "open", createdAt: Date.now(), ...extra });
    const bills = [
      bill("201", "Riso Print Co", "Cover run, Salt Hours", 640, 4),
      bill("202", "Paper Mill Supply", "Cream text stock", 212.4, -2),
      bill("203", "Northern Bindery", "Saddle stitching", 180, -21),
      bill("204", "Ink & Drum", "Drums and ink", 96, 12, { status: "paid", paidDate: day(10), paidAt: Date.now() - 10 * 86_400_000, expenseId: 77 }),
    ];
    r.taxCenter = { ...(r.taxCenter || {}), businessExpenses: [...kept, postage("WEB-1044", 14.5), postage("WEB-1045", 8.2)], bills };
    return r;
  };
}

// ── Stockroom › Till: six titles, one sold out (?page=stockroom/pos) ──
if (/page=stockroom(\/|%2F)pos/.test(window.location.search) && !EMPTY_STOCKROOM) {
  const titles: Array<[string, string, number, number]> = [
    ["salt", "Salt Almanac", 18, 38], ["tide", "Tidewrack", 12, 22], ["ferry", "The Ferry Poems", 10, 40],
    ["lantern", "Lantern Season", 22, 0], ["weather", "Small Weather", 7, 60], ["atlas", "Harbour Atlas", 28, 14],
  ];
  stockroomApi.load = async (): Promise<StockroomRecords> => ({
    books: titles.map(([id, title, listPrice, stock]) => ({ id, title, listPrice, currency: "CA$", maxPrint: stock })),
    states: Object.fromEntries(titles.map(([id, , , stock]) => [id, { stock, hist: [] }])),
    taxCenter: null,
  });
}

// ── Stockroom writes (record a sale / void, sales worker): the records above go into an in-memory stockroom
// (stockroomMemory.ts) the first time a page reads them, and every page reads and saves through it from then on, so
// ?page=stockroom/history can record and void sales with nothing reaching Firestore. `?stocksave=offline` makes every
// save fail as an unreachable server does; `window.__stockroomMemory` is the stockroom, for checks. ──
{
  const base = stockroomApi.load;
  let memory: MemoryStockroom | null = null;
  const offline = new URLSearchParams(window.location.search).get("stocksave") === "offline";
  const ready = async () => {
    if (memory) return memory;
    const records = await base();
    const mem = new MemoryStockroom();
    mem.putCatalog(records.books);
    for (const [id, state] of Object.entries(records.states)) {
      const book = records.books.find((b) => b.id === id) ?? null;
      const copy = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
      // Ids the old app gives every sale (its first load adds any missing), and its totals, as a stored book has them.
      if (Array.isArray(copy.hist)) (copy.hist as Array<Record<string, unknown>>).forEach((h, i) => { h.sheetsId ??= `fixture-${id}-${i}`; });
      recomputeAfters(copy, book);
      mem.putBook(id, copy);
    }
    (window as unknown as { __stockroomMemory?: MemoryStockroom }).__stockroomMemory = mem;
    return (memory = mem);
  };
  stockroomApi.load = async () => {
    if (EMPTY_STOCKROOM) return base();
    const records = await base();
    const fresh = await loadStockroom((await ready()).device());
    return { ...records, states: { ...records.states, ...fresh.states }, invoiceSettings: fresh.invoiceSettings ?? records.invoiceSettings ?? null };
  };
  const writer = async () => createStockroomWriter((await ready()).device({ offline }));
  stockroomWriteApi.saveBookState = async (bookId, mutate) => (await writer()).saveBookState(bookId, mutate);
  stockroomWriteApi.commitBookState = async (pending) => createStockroomWriter((await ready()).device()).commitBookState(pending);
  stockroomWriteApi.updateSetting = async (key, mutate) => (await writer()).updateSetting(key, mutate);
  stockroomWriteApi.saveSetting = async (key, value, opts) => (await writer()).saveSetting(key, value, opts);

  // Exchange rates: no rate services are asked from the fixture. A logged expense in another currency takes 1.4, and
  // the Tax centre's background refresh finds nothing to do.
  const { taxRatesApi } = await import("../app/admin/stockroom/taxRates");
  taxRatesApi.expenseRatesFor = async (items) => Object.fromEntries(items.map((i) => [`${i.currency.toUpperCase()}@${i.date}`, 1.4]));
  taxRatesApi.refreshTaxRates = async () => null;

  // Website orders (Stock and sales › Website orders): the website's inbox in memory, with one paid order for the
  // first book, brought in through the same write layer. `window.__websiteLink` is the inbox, for checks.
  const { websiteLinkApi } = await import("../app/admin/stockroom/WebsiteOrders");
  const { MemoryWebsiteLink } = await import("../app/admin/stockroom/websiteLinkMemory");
  const { loadLinkBooks } = await import("../app/admin/stockroom/stockroomData");
  const { onStockroomSaved } = await import("../app/admin/stockroom/stockroomWrite");
  websiteLinkApi.deps = () => {
    let link: InstanceType<typeof MemoryWebsiteLink> | null = null;
    const linked = async () => {
      if (link) return link;
      const mem = await ready();
      link = new MemoryWebsiteLink(mem);
      (window as unknown as { __websiteLink?: unknown }).__websiteLink = link;
      const first = [...mem.parts.keys()][0];
      if (first) link.push({
        v: 1, orderId: "WEB-2001", number: "#2001", hash: "f1", test: false, paidAt: new Date().toISOString(), paidDay: new Date().toISOString().slice(0, 10),
        paymentMethod: "Stripe", paymentStatus: "paid", refundState: "none", refund: null,
        totals: { subtotal: 20, discount: 0, discountCode: "", shipping: 8, tax: 0, total: 28, giftCard: 0 }, charged: { currency: "CAD", amountMinor: 2800 },
        customer: { name: "Sam Reader", email: "sam@example.com", phone: "", address: { city: "Toronto", state: "ON", country: "CA" } },
        fulfillment: { method: "shipping", status: "paid", trackingNumber: "", trackingCarrier: "", trackingUrl: "", shippedDay: null, labelSource: null },
        books: { [first]: { net: 1, sold: 1, restocked: 0, unitCAD: 20, merchCAD: 20, preorder: false, titles: [] } }, firstBook: first, unlinked: [],
      });
      return link;
    };
    const lazyIO = {
      watchPending: (cb: any, onError: any) => { let stop = () => {}; void linked().then((l) => { stop = l.io().watchPending(cb, onError); }); return () => stop(); },
      watchStatus: (cb: any, onError: any) => { let stop = () => {}; void linked().then((l) => { stop = l.io().watchStatus(cb, onError); }); return () => stop(); },
      markSwitchedOn: async (at: string) => (await linked()).io().markSwitchedOn(at),
      publish: async (args: any) => (await linked()).io().publish(args),
    };
    return {
      link: lazyIO,
      loadBooks: async () => loadLinkBooks((await ready()).device()),
      // Straight into the in-memory stockroom (a later sample block swaps stockroomWriteApi for its own save).
      saveBook: async (id, mutate) => createStockroomWriter((await ready()).device()).saveBookState(id, mutate),
      rate: async () => null,
      rates: () => ({}),
      chargeIntents: () => ({}),
      onSaved: onStockroomSaved,
    };
  };
  // The runner is mounted for the shop's owner only; `?weblink=1` starts it for the fixture's own user.
  if (new URLSearchParams(location.search).get("weblink") === "1") {
    const { createWebsiteLinkRunner } = await import("../app/admin/stockroom/websiteLinkRun");
    createWebsiteLinkRunner(websiteLinkApi.deps()).start();
  }
}

// ── Stockists › Mark paid (block of the stockist-pay page): saves into memory, receipts are only recorded ──
{
  const saved: Record<string, any> = {};
  const load = stockroomApi.load;
  stockroomApi.load = async () => { const r = await load(); Object.assign(r.states, saved); return r; };
  stockroomWriteApi.saveBookState = async (bookId: string, mutate: (s: any) => any) => {
    const r = await stockroomApi.load();
    const before = r.states[bookId];
    if (!before) return { status: "refused", reason: "unknown-book", message: "That book isn't in the stockroom." } as any;
    try {
      const state = (await mutate(structuredClone(before))) ?? before;
      saved[bookId] = state;
      return { status: "saved", state, merged: false, conflicts: [], written: ["invoices", "ledger", "stores"] } as any;
    } catch (error) {
      return { status: "refused", reason: "no-permission", message: (error as Error).message } as any;
    }
  };
  stockistReceiptApi.send = async (receipt) => { ((window as any).__fixtureReceipts ||= []).push(receipt); return { to: receipt.to }; };
  stockistReceiptApi.sendNote = async (note) => { ((window as any).__fixtureReceipts ||= []).push(note); return { to: note.to }; };
}

const order = (n: number, status: string, name: string) => ({
  id: `o${n}`, orderId: `FIXTURE-${n}`, status, paymentStatus: "paid", createdAt: new Date(Date.now() - n * 3_600_000).toISOString(),
  customer: { name, email: `buyer${n}@example.com` },
  items: [{ id: "b1", title: "Salt Hours", quantity: n, price: 20 }], total: 20 * n, subtotal: 20 * n, currency: "CAD",
  // Sales tax and the card fee as the server records them (Stockroom › Tax centre reads these).
  tax: 2.6 * n, taxLines: [{ name: "HST ON", cents: 260 * n }], fee: 88 * n, payoutId: n < 3 ? "po_fixture" : "po_fixture_2", payoutDate: new Date(Date.now() - (n < 3 ? 2 : 9) * 86_400_000).toISOString(), ...(n === 3 ? { net: 6000 - 264 - 1500 } : {}),
  shippingAddress: { street: "1 Example St", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "Canada" },
  trackingKey: `key${n}`, fulfillmentStatus: status === "shipped" ? "shipped" : "unfulfilled",
});
const ORDERS = [order(1, "paid", "Ada Example"), { ...order(2, "paid", "Ben Example"), locale: "fr-CA" } as any, order(3, "shipped", "Cleo Example")];

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
  // Marketing › Discounts as in the mockup: two live codes, one automatic offer and one that ended.
  getDiscounts: async () => [
    { id: "d1", code: "WINTER10", method: "code", type: "percentage", value: 10, minOrderAmount: 30, isActive: true, usageCount: 4 },
    { id: "d2", code: "LAUNCH", method: "code", type: "freeship", isActive: true, expiryDate: "2026-11-01", usageCount: 31 },
    { id: "d3", method: "automatic", title: "Two zines for $12", type: "fixed", value: 4, minQuantity: 2, isActive: true },
    { id: "d4", code: "FRIENDS", method: "code", type: "fixed", value: 5, isActive: false },
  ],
  // Marketing › Gift cards as in the mockup: an unspent card, a part-spent one and one you turned off.
  getGiftCards: async () => [
    { id: "g1", last4: "4F2A", balanceMinor: 2500, initialMinor: 2500, source: "order", orderId: "o1", recipientName: "Cleo Example", createdAt: "2026-11-09T10:00:00.000Z" },
    { id: "g2", last4: "77B1", balanceMinor: 850, initialMinor: 3000, source: "manual", createdAt: "2026-11-02T10:00:00.000Z" },
    { id: "g3", last4: "0C9D", balanceMinor: 5000, initialMinor: 5000, source: "manual", enabled: false, createdAt: "2026-10-20T10:00:00.000Z" },
  ],
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
  // Analytics: the shop's own visit counter for every day asked, with a steady made-up pattern (no Google here).
  getDailyAnalyticsBetween: async (from: string, to: string) => {
    const rows: any[] = [];
    for (let k = from, i = 0; k <= to && i < 900; i++, k = new Date(Date.parse(`${k}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
      const visits = 18 + ((i * 7) % 23) + (new Date(`${k}T12:00:00Z`).getUTCDay() === 6 ? 14 : 0);
      rows.push({ id: k, date: k, visits,
        sources: { instagram: Math.round(visits * 0.4), direct: Math.round(visits * 0.3), "google com": Math.round(visits * 0.2), newsletter: Math.round(visits * 0.1) },
        devices: { phone: Math.round(visits * 0.7), computer: Math.round(visits * 0.25), tablet: Math.round(visits * 0.05) },
        bookViews: { b1: Math.round(visits * 0.3), b2: Math.round(visits * 0.2), b3: Math.round(visits * 0.1) },
        funnel: { view: Math.round(visits * 0.6), add_to_cart: Math.round(visits * 0.12), checkout_start: Math.round(visits * 0.06), purchase: i % 5 === 0 ? 1 : 0 },
        searches: { poetry: 2, riso: 1, ...(i % 3 === 0 ? { "night songs": 1 } : {}) }, noResults: i % 4 === 0 ? { "cook book": 1 } : {} });
    }
    return rows;
  },
  // A list, though its name doesn't end like one: the Overview's alerts read it on the way back from an order.
  // `&alerts=1`: two emails that didn't go through and one waiting to send again, so the Alerts page has tiles.
  getStripeWebhookStatus: async () => null,
  getBackupStatus: async () => undefined,
  getClientErrors: async () => [],
  getRecentEmailLog: async () => SAMPLE_ALERTS ? [
    { id: "e1", status: "failed", at: new Date(Date.now() - 3_600_000).toISOString(), to: "reader@example.com" },
    { id: "e2", status: "bounced", at: new Date(Date.now() - 7_200_000).toISOString(), to: "fan@example.com" },
    { id: "e3", status: "queued", outboxId: "q1", at: new Date(Date.now() - 600_000).toISOString() },
  ] : [],
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
  digitalUpdate: async (op: string) => (op === "send"
    ? { ok: true, latest: { id: "u1", status: "queued", audience: 12, sent: 0, failed: 0, createdAt: new Date().toISOString(), finishedAt: "", lastError: "" } }
    : { buyers: 12, latest: null }),
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
inventoryLinkApi.linkNewBook = async (bookId: string, inventoryBookId: string, variantId: string | null = null) => {
  links()[bookId] = variantId ? { ...links()[bookId], [variantId]: inventoryBookId } : { _: inventoryBookId };
  return { links: { ...links() }, already: false };
};
// The stockroom's books, for matching a product's editions on its Stock and sales tab.
inventoryLinkApi.catalog = async () => ({ books: [
  { id: "inv-tee-s", title: "Tee small", author: "", isbn: "", currency: "CAD", maxPrint: null, onHand: 12, feedAt: null },
  { id: "inv-tee", title: "Tee", author: "", isbn: "", currency: "CAD", maxPrint: null, onHand: 40, feedAt: null },
  { id: "inv-salt", title: "Salt Almanac", author: "", isbn: "9780000000001", currency: "CAD", maxPrint: null, onHand: 7, feedAt: null },
] });
(window as any).__adminFixture = { orders: ORDERS };

// Settings › General › Web address: ?domain=waiting (a domain brought over, with its steps), ?domain=securing,
// ?domain=live, else only the free address. Nothing leaves the page.
{
  const mode = new URLSearchParams(window.location.search).get("domain") || "";
  const FREE = "moth-press.shops.example";
  const OWN = "mothpress.example";
  let main = mode === "live" ? OWN : FREE;
  let own: { name: string; state: string; sendsTo?: string }[] = mode
    ? [{ name: OWN, state: mode === "live" ? "live" : mode === "securing" ? "securing" : "waiting_dns" }, { name: `www.${OWN}`, state: mode === "live" ? "live" : "waiting_dns", sendsTo: OWN }]
    : [];
  const list = () => ({ domains: [{ name: FREE, state: "live", free: true, main: main === FREE }, ...own.map((d) => ({ ...d, main: d.name === main }))], own: FREE, main, max: 3 });
  const guide = (name: string) => ({
    seller: "GoDaddy", zone: OWN,
    steps: [`Open GoDaddy and choose ${OWN}.`, "Delete each line marked Take out. GoDaddy may show its value as Parked.", "For each line marked Add, press Add New Record, choose the type, then paste the name and value.", "If a name is @ and the box won't take it, leave it empty."],
    lines: [{ action: "remove", kind: "Address", pick: "A", name: name === OWN ? "@" : "www", value: "192.0.2.10" }, { action: "add", kind: "Address", pick: "A", name: name === OWN ? "@" : "www", value: "199.36.158.100" }, { action: "add", kind: "Text", pick: "TXT", name: name === OWN ? "@" : "www", value: "hosting-site=shops" }],
    openUrl: "https://dcc.godaddy.com/manage/dns",
    message: { subject: `Please connect ${name} to our shop`, body: "Hello, could you add these lines?" },
  });
  const checkOf = (name: string) => {
    const state = own.find((d) => d.name === name)?.state ?? "live";
    return { name, state, records: [], paymentDomain: "registered", ...(state === "waiting_dns" ? { way: "guide", seller: "GoDaddy", guide: guide(name) } : {}) };
  };
  (adminApi as any).customDomains = async (step: string, domain?: string) => {
    if (step === "list") return list();
    if (step === "check") return checkOf(domain!);
    if (step === "connect" || step === "add") {
      const name = String(domain).trim().toLowerCase();
      if (!own.some((d) => d.name === name)) own = [...own, { name, state: "waiting_dns" }];
      return checkOf(name);
    }
    if (step === "makeMain") { main = domain || FREE; return list(); }
    if (step === "remove") { own = own.filter((d) => d.name !== domain && d.sendsTo !== domain); return { removed: domain, ...list() }; }
    throw Object.assign(new Error("Not in the fixture."), { code: "not_available" });
  };
}

// The shop's own product types (product types plan, change 4): one to start with, kept in memory.
{
  let ownTypes: any[] = [{ id: "own-pillar-candles", name: "Pillar candles", base: "candles" }];
  (adminApi as any).getOwnTypes = async () => ownTypes.map((t) => ({ ...t }));
  (adminApi as any).saveOwnTypes = async (own: any[]) => { ownTypes = own.map((t) => ({ ...t })); };
  // A new product saves into memory too (Saved · Add another), unless a mode below keeps its own shelf.
  let made = 0;
  (adminApi as any).createBook = async (book: any) => ({ ...book, id: `new-${++made}` });
}

// Settings › Team: the fixture signs in as the owner, with three people on the Team.
(adminApi as any).myRole = async () => "owner";
// The account holder, as refreshMyRole would tell a co-owner after sign-in (kept for this page only).
rememberShopOwner("owner@example.com", "");
// One has signed in, one is still invited and one is a fair helper for today. Changes are kept in memory.
let fixtureTeam: Awaited<ReturnType<typeof teamApi.list>> = [
  { email: "ada.example@example.com", role: "staff", name: "Ada Example", joinedAt: new Date(Date.now() - 6 * 864e5).toISOString(), lastSignInAt: new Date(Date.now() - 2 * 864e5).toISOString() },
  { email: "ben.example@example.com", role: "bookkeeper" },
  { email: "cleo@example.com", role: "fairHelper", until: new Date(Date.now() + 36e5).toISOString() },
];
teamApi.list = async () => fixtureTeam.map(m => ({ ...m }));
teamApi.add = async (email, role, { name } = {}) => { fixtureTeam = [...fixtureTeam, { email: email.trim().toLowerCase(), role, ...(name ? { name } : {}) }]; };
teamApi.setRole = async (email, role) => { fixtureTeam = fixtureTeam.map(m => (m.email === email ? { ...m, role } : m)); };
teamApi.resendInvite = async () => {};
teamApi.remove = async (email) => { fixtureTeam = fixtureTeam.filter(m => m.email !== email); };

// ── Stockroom › Shipping › Buy label (block of the labels-from-shipping page): two waiting rows are website orders here,
// WEB-1041 ready for a label and WEB-1042 not packed yet. Rates and the purchase are fakes recorded in
// `window.__adminFixture.labelCalls`; nothing reaches a carrier.
{
  const api = adminApi as any;
  const labelCalls: any[] = ((window as any).__adminFixture.labelCalls = []);
  const shipOrder = (id: string, name: string, packed: boolean) => {
    const o: any = {
      id, orderId: id, status: "paid", paymentStatus: "paid", fulfillmentStatus: "unfulfilled", shippingMethod: "Canada Post Expedited Parcel", shipping: 14,
      createdAt: new Date(Date.now() - 9 * 86_400_000).toISOString(), currency: "CAD", total: 34, subtotal: 20,
      customer: { name, email: "buyer@example.com", address: { street: "1 Example St", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "CA" } },
      items: [{ id: "salt-hours", title: "Salt Hours", quantity: 1, price: 20, weightGrams: 400 }],
    };
    o.operations = { addressReviewed: addressKey(o), packed: packed ? JSON.stringify(o.items.map((i: any) => [i.id, "", i.quantity])) : "" };
    return o;
  };
  const shipOrders: Record<string, any> = { "WEB-1041": shipOrder("WEB-1041", "Customer WEB-1041", true), "WEB-1042": shipOrder("WEB-1042", "Customer WEB-1042", false) };
  const before = api.getOrderById;
  api.getOrderById = async (id: string) => shipOrders[id] ?? before(id);
  api.getCanadaPostLabelRates = async (orderId: string, parcel: any) => {
    labelCalls.push(["rates", orderId, parcel]);
    return { shipmentId: "shp_fixture", rates: [
      { id: "rate_exp", name: "Expedited Parcel", carrier: "Canada Post", amount: "12.40", currency: "CAD", estimatedDays: 2 },
      { id: "rate_reg", name: "Regular Parcel", carrier: "Canada Post", amount: "10.15", currency: "CAD", estimatedDays: 5 },
    ] };
  };
  api.buyCanadaPostLabel = async (orderId: string, shipmentId: string, rateId: string) => {
    labelCalls.push(["buy", orderId, shipmentId, rateId]);
    shipOrders[orderId] = { ...shipOrders[orderId], labelUrl: "https://labels.example/fixture.pdf", trackingNumber: "7023110000999" };
    return {};
  };
}

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
  // Books import (Books › Import spreadsheet) saves into memory, so the check can import a file and take it back.
  const shelf: any[] = A11Y_BOOKS.map((b: any) => ({ ...b }));
  api.getBooks = async () => shelf.map((b) => ({ ...b }));
  api.getAllBooks = api.getBooks;
  api.clearExampleProducts = async () => 0;
  api.recordAuditLog = record("recordAuditLog", () => undefined);
  api.createBook = record("createBook", (book: any) => { const made = { ...book, id: `made-${shelf.length + 1}` }; shelf.push(made); return { ...made }; });
  api.updateBook = record("updateBook", (id: string, patch: any) => { Object.assign(shelf.find((b) => b.id === id) || {}, patch); });
  api.deleteBook = record("deleteBook", (id: string) => { const i = shelf.findIndex((b) => b.id === id); if (i >= 0) shelf.splice(i, 1); });
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

// ?guide=1 (Set up your shop screenshots): a private shop that finished Get started, with books and a logo, so Home
// shows the setup guide part way through.
if (new URLSearchParams(location.search).get("guide")) {
  const at = "2026-11-01T10:00:00.000Z";
  const week: any = { plan: "both", sellingToday: "starting", publishes: "books", details: { at }, bring: { at, skipped: true },
    welcome: { at, theme: "riso" }, google: { at, skipped: true }, payments: { at, skipped: true }, shipping: { at, skipped: true }, finalCheck: { at } };
  const api = adminApi as any;
  api.getFirstWeek = async () => JSON.parse(JSON.stringify(week));
  api.updateFirstWeek = async (change: any) => { const { done, ...rest } = change; Object.assign(week, rest); if (done) week.done = { ...week.done, ...done }; };
  api.getSettings = async () => ({ design: { showUnderConstruction: true, logoUrl: "https://photos.example/logo.png" } });
}

// ?start=details|bring|look|shipping|final (Get started screenshots): a new private shop part way through the run.
const startAt = new URLSearchParams(location.search).get("start");
if (startAt) {
  const at = "2026-11-01T10:00:00.000Z";
  const order = ["details", "bring", "look", "shipping", "final"];
  const upTo = Math.max(0, order.indexOf(startAt));
  const marks: Record<string, any> = { details: { at }, bring: { at, skipped: true }, look: { at, theme: "riso" }, shipping: { at, skipped: true } };
  const week: any = { plan: "both", sellingToday: "starting", publishes: "books" };
  order.slice(0, upTo).forEach((step) => { week[step === "look" ? "welcome" : step] = marks[step]; });
  const api = adminApi as any;
  api.getFirstWeek = async () => JSON.parse(JSON.stringify(week));
  api.updateFirstWeek = async (change: any) => { Object.assign(week, change); };
  api.getShippingProfiles = async () => [];
  api.getSettings = async () => ({ info: { name: "Moth Press", email: "hello@mothpress.example" }, design: { showUnderConstruction: true },
    location: { street: "12 Queen Street", city: "Toronto", state: "ON", zip: "M5H 2N2", country: "Canada" } });
}

// ?shipping=1 (Settings › Shipping screenshots): two profiles with zones and rates, saved only in this page.
if (new URLSearchParams(location.search).get("shipping")) {
  const api = adminApi as any;
  let profiles: any[] = [
    { id: "general-profile", name: "General", freeShippingOver: 75, handlingFee: 1, defaultItemWeightG: 350, zones: [
      { id: "z-ca", name: "Canada", countries: ["CA"], rates: [
        { id: "r-std", name: "Standard", type: "flat", base: 8, additional: 3, deliveryDays: "3-7" },
        { id: "r-exp", name: "Express", type: "flat", base: 18, additional: 4, deliveryDays: "1-3", minPrice: 20 },
        { id: "r-pick", name: "Pick up in Toronto", type: "pickup", base: 0, additional: 0 }] },
      { id: "z-us", name: "United States", countries: ["US"], rates: [{ id: "r-us", name: "Tracked", type: "flat", base: 14, additional: 4, deliveryDays: "5-10" }] },
      { id: "z-row", name: "Rest of world", countries: [], restOfWorld: true, rates: [] }] },
    { id: "heavy", name: "Heavy books", zones: [] },
  ];
  api.getShippingProfiles = async () => JSON.parse(JSON.stringify(profiles));
  api.updateShippingProfile = async (id: string, p: any) => { profiles = profiles.map((x) => (x.id === id ? p : x)); };
}

// ?gstate=coming|ready|connected|trouble (Settings › Google screenshots): a pretend Google link, nothing reaches Google.
// coming: not switched on yet · ready: switched on, not connected · connected: all working · trouble: needs a look.
const gstate = new URLSearchParams(location.search).get("gstate");
if (gstate) {
  const offered = ["businessProfile", "drive", "youtube", "calendar", "ads"];
  const done = (step: string, detail: string) => ({ step, state: "done", detail, at: "2026-11-03T15:00:00Z" });
  const steps = [
    done("firebase", "Your shop is ready for Google."),
    done("analytics", "Visits are counted for visitors who agree."),
    done("searchConsole", "Google knows about your shop and 24 books."),
    done("merchantCenter", "24 books sent to Google Shopping today."),
    done("email", "Emails go out from hello@yourpress.example."),
    gstate === "trouble" ? { step: "domain", state: "waiting", detail: "Waiting for yourpress.example to open your shop." } : done("domain", "yourpress.example is counted with your shop."),
    done("businessProfile", "Your hours and link are on Google Maps."),
    gstate === "trouble" ? { step: "drive", state: "failed", detail: "Google didn't allow the Drive folder. Try again, or switch it off." } : done("drive", "Last copy saved last night."),
  ];
  const answer: any = gstate === "coming" ? { enabled: false } : {
    enabled: true, extrasOffered: offered,
    ...(gstate === "ready" ? { connected: false } : { connected: true, accountEmail: "owner@example.com", connectedAt: "2026-11-03T15:00:00Z", extrasChosen: ["businessProfile", "drive"], steps }),
  };
  const calls: any[] = ((window as any).__adminFixture.googleCalls = []);
  const status = readGoogleStatus(answer);
  googleConnectApi.status = async () => status;
  googleConnectApi.connectLink = async (extras: any) => { calls.push(["connectLink", extras]); return "#settings/google"; };
  googleConnectApi.tryAgain = async (part: string) => { calls.push(["tryAgain", part]); return status; };
  googleConnectApi.disconnect = async () => { calls.push(["disconnect"]); return status; };
  googleConnectApi.turnOff = async (extras: any) => { calls.push(["turnOff", extras]); return status; };
  googleConnectApi.shoppingProblems = async () => ({ available: true, problems: gstate === "trouble" ? [{ offerId: "b3", title: "Night Songs", issues: [{ severity: "DISAPPROVED", description: "The photo has a border.", resolution: "Upload a photo without one." }] }] : [] });
  googleConnectApi.sendStockSheet = async () => ({ available: true, url: "https://docs.google.com/spreadsheets/d/example/edit", rows: 24 });
  // A pasted Google Sheet link (plan 23.42): two tabs of books; under ?gstate=trouble reading isn't allowed yet.
  googleConnectApi.readSheet = async (args: any) => {
    calls.push(["readSheet", args]);
    if (gstate === "trouble") return { available: false };
    return {
      available: true, title: "Spring list", sheet: args.sheet ?? "Books", sheets: ["Books", "Zines"],
      rows: args.sheet === "Zines"
        ? [["Title", "Price", "Stock"], ["Moth Zine", "6.00", "40"]]
        : [["Title", "Writer", "Cost to buyer", "Stock"], ["Spring Light", "R. Field", "22.00", "12"], ["Low Tide", "M. Shore", "18.50", "5"]],
    };
  };
}

// ── Stockroom › Sheets (?page=stockroom/sheets&gstate=connected): a sheet sent eight hours ago, so opening the page sends it
// again (in memory); the switch is kept in memory too. Without gstate the page shows its "Connect Google" state. ──
if (/page=stockroom(\/|%2F)sheets/.test(window.location.search)) {
  let copy = true;
  sheetsStore.load = async () => copy;
  sheetsStore.save = async (on) => { copy = on; };
  const sentAt = new Date(Date.now() - 8 * 36e5).toISOString();
  const status = googleConnectApi.status;
  googleConnectApi.status = async () => {
    const s = await status();
    return s === "not_available" || !s.connected ? s : { ...s, sheet: { url: "https://docs.google.com/spreadsheets/d/example/edit", writtenAt: sentAt, rows: 2, sales: 14, expenses: 3 } };
  };
  googleConnectApi.sendStockSheet = async (tabs = {}) => ({ available: true, url: "https://docs.google.com/spreadsheets/d/example/edit", writtenAt: new Date().toISOString(), rows: 2, sales: tabs.sales?.length ?? 0, expenses: tabs.expenses?.length ?? 0 });
}


// ── Stockroom › Backups (?page=stockroom/backups): last night's backup worked, five daily copies (Download gives an
// empty page), and Back up now finishes in a second. ──
if (/page=stockroom(\/|%2F)backups/.test(window.location.search)) {
  const night = (d: number) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(3, 17, 0, 0); return t; };
  let last = night(0).toISOString();
  nightlyBackupApi.status = async () => ({ ok: true, lastAttemptAt: last, lastSuccessAt: last, export: { ok: true }, copy: { ok: true, documents: 1840 } });
  nightlyBackupApi.list = async () => ({ backups: [0, 1, 2, 3, 4].map((d) => ({ day: night(d).toISOString().slice(0, 10), createdAt: night(d).toISOString(), documents: 1840 - d * 12, complete: true, downloadable: true, hasExport: true })) });
  nightlyBackupApi.backupNow = async () => { await new Promise((r) => setTimeout(r, 1000)); last = new Date().toISOString(); return { ok: true }; };
  nightlyBackupApi.downloadLink = async () => ({ url: "about:blank" });
  // The stockroom's own copies, in memory: three daily ones from two sample items.
  const whole = { catalog: { salt: { title: "Salt Almanac" }, moth: { title: "Moth Songs" } } as Record<string, unknown>, states: { salt: { stock: 4 }, moth: { stock: 2 } } as Record<string, any>, settings: {} };
  const copies: Record<string, string> = {};
  let list: any[] = [0, 1, 2].map((d) => { const t = night(d).getTime() + 6 * 36e5; copies[`sb-${t}`] = JSON.stringify(snapshotOf(whole, t)); return { id: `sb-${t}`, type: "auto", createdAt: t, bookCount: 2 }; });
  copiesIO.list = async () => readManifest(list);
  copiesIO.whole = async () => whole;
  copiesIO.writeCopy = async (id, text) => { copies[id] = text; };
  copiesIO.readCopy = async (id) => (copies[id] ? JSON.parse(copies[id]) : null);
  copiesIO.deleteCopy = async (id) => { delete copies[id]; };
  copiesIO.saveList = async (change) => { list = change(readManifest(list)); };
  copiesIO.saveSetting = async (key, change) => { if (key === "catalog") whole.catalog = change(whole.catalog) as Record<string, unknown>; return { status: "saved", value: null, merged: false, conflicts: [] }; };
  copiesIO.saveBook = async (id, state) => { whole.states[id] = state; return { status: "saved", state: state as any, merged: false, conflicts: [], written: ["stock"] }; };
}

// Settings › Apps: a pretend app store, two installed apps and their activity (?apps=none for the empty page).
{
  const perms = (list: Array<[string, string, boolean?]>) => list.map(([scope, words, personal]) => ({ scope, words, personal: !!personal }));
  const store = [
    { appId: "app_0000000000a1", name: "Parcel Pal", tagline: "Cheaper Canada Post labels, printed from your orders.", description: "Buy labels at business rates, print them in one go, and tracking goes on each order by itself.", category: "orders-shipping", categoryName: "Orders and shipping", supportEmail: "help@parcelpal.example", website: "https://parcelpal.example", installAddress: "https://parcelpal.example/start",
      permissions: perms([["read_shop", "See your shop's name, address and currency"], ["write_orders", "Add tracking and mark orders as sent", true]]) },
    { appId: "app_0000000000b2", name: "Mailchimp", tagline: "Your customers and orders in Mailchimp, for newsletters.", description: "", category: "marketing", brand: "mailchimp", categoryName: "Marketing and email", supportEmail: "apps@yourpress.example", website: "https://mailchimp.com", installAddress: "https://yourpress.example/account/mailchimp.html",
      permissions: perms([["read_products", "See your products, prices and photos"], ["read_customers", "See your customers' names, emails and addresses", true]]) },
    { appId: "app_0000000000c3", name: "Zap Shelf", tagline: "Connect your shop to 6,000 other apps.", description: "", category: "other", categoryName: "Something else", supportEmail: "help@zapshelf.example", website: "https://zapshelf.example", installAddress: "",
      permissions: perms([["read_orders", "See your orders, what was in them and where they ship to", true], ["write_inventory", "Change how many of each product you have"]]) },
    { appId: "app_0000000000d4", name: "Ledger Line", tagline: "Your sales in your accounting app each night.", description: "", category: "accounting", categoryName: "Accounting and taxes", supportEmail: "help@ledgerline.example", website: "https://ledgerline.example", installAddress: "https://ledgerline.example/go",
      permissions: perms([["read_orders", "See your orders, what was in them and where they ship to", true]]) },
  ];
  const none = new URLSearchParams(location.search).get("apps") === "none";
  let installed = none ? [] : [{ ...store[0], installedAt: "2026-11-02T10:00:00Z", installedBy: "owner@example.com" }, { ...store[1], installedAt: "2026-11-03T10:00:00Z", installedBy: "owner@example.com", testing: true }];
  const categories = [["orders-shipping", "Orders and shipping"], ["marketing", "Marketing and email"], ["accounting", "Accounting and taxes"], ["other", "Something else"]].map(([id, name]) => ({ id, name }));
  appsApi.installed = async () => installed as any;
  appsApi.store = async () => ({ apps: store, categories });
  appsApi.remove = async (appId: string) => { installed = installed.filter((a) => a.appId !== appId); };
  // QuickBooks, built into the store: ?qb=off (Coming soon), ?qb=connected, else ready to connect.
  const qb = new URLSearchParams(location.search).get("qb");
  (adminApi as any).bookkeeping = async (step: string) => {
    if (step !== "status") throw Object.assign(new Error("Not in the fixture."), { code: "not_available" });
    if (qb === "off") return { enabled: false };
    return qb === "connected"
      ? { enabled: true, mode: "test", connected: true, companyName: "Moth Press Books", ready: true, style: "daily", taxCodes: {}, lastSent: { date: "2026-11-11", at: "2026-11-12T04:00:00Z" } }
      : { enabled: true, mode: "test", connected: false };
  };
  appsApi.activity = async () => none ? [] : [
    { id: "r3", app: "Parcel Pal", what: "Marked order 1042 sent (Canada Post 7023 1100 4410)", when: "2026-11-04T16:10:00Z", state: "done", reason: "" },
    { id: "r2", app: "Parcel Pal", what: "Marked order 1039 sent (Canada Post 7023 1100 4388)", when: "2026-11-04T15:02:00Z", state: "refused", reason: "Order on hold: waiting on the author's signature." },
    { id: "r1", app: "Mailchimp", what: "Took away 2 of moth-songs", when: "2026-11-04T11:40:00Z", state: "done", reason: "" },
  ];
}

// ── Product variants (variants worker, 11 November 2026): ?variants=1 is a clothing shop with a tee sold in sizes and
// colours, each combination with its own price, SKU and stock (one sold out, one low). Open the editor with
// &page=catalog/book/tee, or Inventory with &page=inventory.
if (new URLSearchParams(location.search).get("variants")) {
  const sizes = ["S", "M", "L"];
  const colours = ["Black", "Natural"];
  const stockOf: Record<string, number> = { "S/Black": 6, "S/Natural": 0, "M/Black": 12, "M/Natural": 3, "L/Black": 8, "L/Natural": 5 };
  const tee: any = {
    id: "tee", slug: "studio-tee", title: "Studio Tee", kind: "clothing", authorName: "Ada Example", retailPrice: 32, status: "published",
    trackInventory: true, sku: "TEE", categories: ["Clothing"], photos: (A11Y_BOOKS[0] as any).photos, description: "<p>Heavy cotton.</p>",
    options: [{ name: "Size", values: sizes }, { name: "Colour", values: colours }],
    variants: sizes.flatMap((size) => colours.map((colour) => {
      const stock = stockOf[`${size}/${colour}`];
      return { id: `tee-${size}-${colour}`.toLowerCase(), name: `${size} / ${colour}`, options: { Size: size, Colour: colour },
        price: size === "L" ? 34 : 32, sku: `TEE-${size}-${colour.slice(0, 3).toUpperCase()}`, stock, stockLevel: stock, weight: "220 g" };
    })),
  };
  tee.stockLevel = tee.variants.reduce((n: number, v: any) => n + v.stockLevel, 0);
  const products = [tee, ...A11Y_BOOKS.map((b: any) => ({ ...b, kind: "other" }))];
  const api = adminApi as any;
  api.getFirstWeek = async () => ({ publishes: "clothing", welcome: { at: "2026-11-01T10:00:00.000Z", theme: "riso" } });
  api.getBooks = async () => products;
  api.getAllBooks = async () => products;
  api.getBook = async (id: string) => products.find((b) => b.id === id) ?? null;
  // Count stock and other stock changes save in memory, so Inventory › Count stock reaches its count report.
  const { inventoryApi } = await import("../app/admin/inventoryApi");
  (inventoryApi as any).adjustStock = async (_bookId: string, variantId: string | null, change: any) => {
    const v = tee.variants.find((x: any) => x.id === variantId);
    const from = v ? v.stockLevel : 0;
    const to = change.kind === "set" ? change.to : from + (change.delta || 0);
    if (v) { v.stockLevel = to; v.stock = to; }
    return { ok: true, from, to, patch: {} };
  };
  (inventoryApi as any).costs = async () => ({ tee: 9.5 });
  (inventoryApi as any).stockAlerts = async () => [];
}

// ── Stock › Reorder list sample (reorder worker): one title selling fast with copies left (`?page=reorder`).
{
  const base = stockroomApi.load;
  stockroomApi.load = async () => {
    const r = await base();
    if (!r.books.length) return r;
    const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    r.books = [...r.books, { id: "ink-maps", title: "Ink Maps", author: "Dee Example", maxPrint: 120, threshold: 8, listPrice: 24, currency: "CAD" }];
    r.states["ink-maps"] = { hist: [{ num: "R-1", chan: "Website", qty: 60, price: 24, date: ago(40) }, ...[2, 6, 11, 15, 22].map((n, i) => ({ num: `R-${i + 2}`, chan: "Book Fair", qty: 6, price: 24, date: ago(n) }))] };
    return r;
  };
}
// ── end Reorder list sample

// Design (redesign): a live look, a draft with two changes waiting, and two pages (`?page=design`).
// ── A services shop (`?sells=hair|wellness|lessons|fitness|studio|services`): the calendar-first menu and "clients".
// `&products=1` is the same shop with "Sell products too" on; `&start=1` is the shop at Get started's services step
// (with `&bookings=new`, before any service is added). In memory. ──
{
  const sells = new URLSearchParams(location.search).get("sells");
  if (sells) {
    // `&start=1`: the shop is at Get started's second step (its services), before it has a look.
    const starting = new URLSearchParams(location.search).get("start") === "1";
    const week: any = { publishes: sells, details: { at: "2026-11-01T09:00:00.000Z" }, ...(starting ? {} : { bring: { at: "2026-11-01T09:30:00.000Z", skipped: true }, welcome: { at: "2026-11-01T10:00:00.000Z", theme: "riso" } }), sellsProducts: new URLSearchParams(location.search).get("products") === "1" };
    const api = adminApi as any;
    api.getFirstWeek = async () => JSON.parse(JSON.stringify(week));
    // Ben's private note, kept by the team (the client card's notes), with his phone.
    const hash = async (email: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email)))).map((b) => b.toString(16).padStart(2, "0")).join("");
    api.saveCustomerNote = async () => undefined;
    api.listCustomerNotes = async () => [{ id: await hash("ben@example.com"), email: "ben@example.com", note: "Prints in teal and fluorescent pink. Likes the heavier paper.", tags: ["regular"], updatedAt: "2026-11-01T09:00:00.000Z", phone: "416 555 0100" }];
    api.updateFirstWeek = async (change: any) => { Object.assign(week, change); };
  }
}

if (new URLSearchParams(location.search).get("page") === "design") {
  const live = { themeBase: { id: "atlas", name: "Atlas" }, primaryColor: "#1f1e1b" };
  const api = adminApi as any;
  api.getSettings = async () => ({ design: live, designPublishedAt: "2026-11-06T15:00:00.000Z" });
  api.getPages = async () => [
    { id: "p1", title: "About", slug: "about", status: "published", order: 1 },
    { id: "p2", title: "Events", slug: "events", status: "draft", order: 2 },
  ];
  const { setThemeBackend } = await import("../app/admin/themeStore");
  const draft = { ...live, primaryColor: "#2a4d8f", copy: { cartTitle: "Your bag" } };
  setThemeBackend({
    open: async () => ({ draft, rev: 1, savedThemes: [] }),
    write: async (rev: number) => rev + 1, saveThemes: async () => {}, fieldUpdate: async () => {}, readField: async () => undefined,
    watch: () => () => {},
  } as any);
}

let helperShown = false;
// Fair helpers: the owner's admin keeps the menu and the inbox in memory (nothing reaches Firestore). `?helper=1` shows
// the Fair till a helper sees instead of the admin, with three items and one sale rung up earlier today.
{
  const { fairStore } = await import("../app/admin/stockroom/fairStore");
  let menu: any = { at: new Date().toISOString(), books: [
    { id: "salt-hours", title: "Salt Hours", price: 20, cur: "CAD", onHand: 14 },
    { id: "night-songs", title: "Night Songs", price: 18, cur: "CAD", onHand: 3 },
    { id: "ink-maps", title: "Ink Maps", price: 24, cur: "CAD", onHand: null },
  ] };
  const today = new Date().toLocaleDateString("en-CA");
  let mine: any[] = [{ id: "fs-early-0000000001", by: "sam@example.com", day: today, fair: "Harbour Fair", method: "Cash", imported: { at: "x" },
    lines: [{ bookId: "salt-hours", title: "Salt Hours", qty: 2, price: 20, cur: "CAD" }] }];
  const watchers = new Set<(s: any[]) => void>();
  const tell = () => { for (const w of watchers) w(mine); };
  fairStore.watchSales = (cb) => { cb([]); return () => {}; };
  fairStore.writeMenu = async (m) => { menu = m; };
  fairStore.watchMenu = (cb) => { cb(menu); return () => {}; };
  fairStore.watchMine = (_email, cb) => { watchers.add(cb); cb(mine); return () => { watchers.delete(cb); }; };
  fairStore.addSale = async (id, sale) => { mine = [...mine, { ...sale, id }]; tell(); };
  fairStore.cancelSale = async (id) => { mine = mine.map((x) => (x.id === id ? { ...x, cancelled: true } : x)); tell(); };
  if (new URLSearchParams(location.search).get("helper") === "1") {
    localStorage.setItem("colophon-helper-fair", JSON.stringify({ name: "Harbour Fair", day: today }));
    const { createElement } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { FairHelperDesk } = await import("../app/admin/FairHelperDesk");
    await import("../styles/index.css");
    createRoot(document.getElementById("root")!).render(createElement(FairHelperDesk, { email: "sam@example.com", appearance: "light" }));
    helperShown = true;
  }
}

// Settings › Plan and Billing with a sample Colophon plan (?plan=open, ?plan=cancelled, ?plan=trial, ?plan=closed): the plan document and the
// platform's billing answers are made here, so Close your shop can be tried end to end. Nothing leaves the page.
{
  const sample = new URLSearchParams(location.search).get("plan");
  if (sample === "open" || sample === "cancelled" || sample === "trial" || sample === "closed") {
    const { platformPlanSource } = await import("../app/admin/platformPlanApi");
    const HUB = "https://platform.example/api/shop-billing/";
    (globalThis as any).__fixtureIdToken = "fixture-token";
    // `&costs=over`: the platform's daily check has sent this month's heads-up, so the Alerts page shows it too. Read
    // now: the admin tidies the address once it opens.
    const asked = new URLSearchParams(location.search);
    const sign = asked.get("cur") === "usd" ? "US$" : "$";
    const headsUp = asked.get("costs") === "over" ? { month: new Date().toISOString().slice(0, 7), projected: `${sign}13.19`, limit: `${sign}10.00` } : null;
    platformPlanSource.watch = (next) => {
      const kept = new Date(Date.now() + 90 * 86_400_000).toISOString();
      if (sample === "closed") { next({ state: "closed", access: "closed", plan: "both", hasCard: true, hub: HUB, shopId: "test-press", link: "https://platform.example/account/billing?shop=test-press", closing: { stage: "closed", closedAt: new Date().toISOString(), downloadUntil: kept }, headsUp }); return () => {}; }
      next({ state: "active", access: "open", plan: "both", hasCard: true, hub: HUB, shopId: "test-press", link: "https://platform.example/account/billing?shop=test-press", cancelAtPeriodEnd: sample === "cancelled", endsAt: sample === "cancelled" ? "2026-12-12T12:00:00Z" : null, headsUp });
      return () => {};
    };
    let billing: any = { plan: "both", planName: "Colophon", price: "$5.00", plusTax: true, plans: [{ plan: "both", name: "Colophon", price: "$5.00", apps: ["shop", "stockroom"] }], status: "active", access: "open", cancelAtPeriodEnd: sample === "cancelled",
      ...(sample === "trial" ? { status: "trialing", trialEnd: "2026-11-30T12:00:00Z" } : {}), ...(sample === "closed" ? { status: "canceled", access: "closed" } : {}),
      currentPeriodEnd: "2026-12-12T12:00:00Z", nextPaymentAt: sample === "cancelled" ? null : "2026-12-12T12:00:00Z", hasCard: true, paymentWay: "monthly",
      card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030, words: "Visa ending 4242" },
      // The bank feed add-on (beta): `&bankaddon=on` shows it turned on with two banks, `&bankaddon=none` hides it.
      addOns: new URLSearchParams(location.search).get("bankaddon") === "none" ? undefined
        : { bankFeed: { on: new URLSearchParams(location.search).get("bankaddon") === "on", price: "CA$4", extraPrice: "CA$1.50", included: 2, banks: new URLSearchParams(location.search).get("bankaddon") === "on" ? 2 : 0, plusTax: true } } };
    // The running-cost tracker (Settings › Billing › Running costs): `&costs=over` is a month heading past the owner's
    // amount, `&costs=new` a shop with nothing measured yet, `&costs=trial` a free trial; `&cur=usd` bills in US
    // dollars and `&founding=1` takes the founding 25% off the fee.
    const q = new URLSearchParams(location.search);
    const usd = q.get("cur") === "usd", costsKind = q.get("costs") ?? "", founding = q.get("founding") === "1";
    const $ = (cents: number) => ({ cents, text: `${usd ? "US$" : "$"}${(cents / 100).toFixed(2)}` });
    const alertAt = costsKind === "over" ? 1000 : 2500;
    billing = { ...billing, price: $(500).text, currency: usd ? "USD" : "CAD",
      founding: founding ? { percentOff: 25, price: $(375).text } : null,
      usage: { fee: $(500).text, lastMonth: costsKind === "new" || costsKind === "trial" ? null : { month: "2026-10", monthWords: "October 2026", ...$(268) }, alert: $(alertAt) } };
    const costsAnswer = () => {
      const over = costsKind === "over", measured = costsKind !== "new", trial = costsKind === "trial";
      const groups = (over
        ? [["visitors", "Visitors", "14.2 GB of pages and photos shown", 294], ["work", "Orders and upkeep", "212,400 tasks run", 31], ["emails", "Emails", "410 emails sent", 25], ["storage", "Photos and files", "3.1 GB kept", 11], ["records", "Shop records", "About 486,000 looks and saves", 21]]
        : [["visitors", "Visitors", "5.6 GB of pages and photos shown", 116], ["emails", "Emails", "236 emails sent", 14], ["work", "Orders and upkeep", "38,200 tasks run", 12], ["records", "Shop records", "About 142,000 looks and saves", 9], ["storage", "Photos and files", "2.3 GB kept", 8]]
      ).map(([id, words, used, cents]) => ({ id, words, used, ...$(cents as number) }));
      const soFar = groups.reduce((sum, g) => sum + g.cents, 0), monthEnd = Math.round((soFar * 30) / 14);
      const fee = 500, after = founding ? 375 : 500, running = trial ? 0 : monthEnd;
      const past = costsKind === "new" || trial ? [null, null, null, null, null] : [null, 142, 197, 231, 268];
      const watched = after + monthEnd;
      return { costs: {
        month: "2026-11", monthWords: "November 2026", monthName: "November", day: 14, days: 30, measured, currency: usd ? "USD" : "CAD", plusTax: true, updatedAt: measured ? "2026-11-14T06:00:00Z" : null,
        soFar: measured ? $(soFar) : null, monthEnd: measured ? $(monthEnd) : null, groups: measured ? groups : [],
        estimate: { fee: $(fee), discount: founding ? $(125) : null, percentOff: founding ? 25 : null, running: measured ? $(running) : null, beforeTax: measured ? $(after + running) : null, freeTrial: trial },
        trend: [...["Jun", "Jul", "Aug", "Sep", "Oct"].map((words, i) => ({ month: `2026-${String(i + 6).padStart(2, "0")}`, words, now: false, ...(past[i] === null ? { cents: null, text: "" } : $(past[i]!)) })), { month: "2026-11", words: "Nov", now: true, ...(measured ? $(monthEnd) : { cents: null, text: "" }) }],
        lastMonth: past[4] === null ? null : { month: "2026-10", monthWords: "October 2026", ...$(268) }, average: past[4] === null ? null : $(210), change: past[4] === null || !measured ? null : Math.round(((monthEnd - 268) / 268) * 100),
        alert: { ...$(billing.usage.alert.cents), on: billing.usage.alert.cents > 0, watched: measured ? $(watched) : null, passing: measured && billing.usage.alert.cents > 0 && watched > billing.usage.alert.cents, used: measured && billing.usage.alert.cents > 0 ? Math.min(1, watched / billing.usage.alert.cents) : null, sent: over },
        // `&texts=sent`: booking reminders went by text this month (their own line on the next bill).
        ...(q.get("texts") === "sent" ? { texts: { count: 42, ...$(67) } } : {}),
      } };
    };
    const answers: Record<string, (body?: any) => unknown> = {
      costs: costsAnswer,
      "cost-alert": (body) => { billing = { ...billing, usage: { ...billing.usage, alert: $(body?.cents ?? 0) } }; return {}; },
      status: () => ({ billing, accountPage: "https://platform.example/account/", changesNeedTwoStep: false }),
      cancel: () => { billing = { ...billing, cancelAtPeriodEnd: true, nextPaymentAt: null }; return {}; },
      keep: () => { billing = { ...billing, cancelAtPeriodEnd: false, nextPaymentAt: billing.currentPeriodEnd }; return {}; },
      close: () => {
        if (billing.status === "active") { billing = { ...billing, cancelAtPeriodEnd: true, cancelEndsAt: billing.currentPeriodEnd, nextPaymentAt: null }; return { closed: false, closesAt: billing.currentPeriodEnd }; }
        billing = { ...billing, status: "canceled", access: "closed" }; return { closed: true, closesAt: null };
      },
      reopen: () => ({ url: "https://checkout.example/card" }),
      upcoming: () => ({ bill: billing.cancelAtPeriodEnd ? null : { date: billing.currentPeriodEnd, lines: [{ words: "Colophon fee", amount: $(500).text }, { words: "Running cost, October 2026", amount: $(268).text }], subtotal: $(768).text, discount: founding ? $(125).text : "", tax: usd ? "" : $(founding ? 84 : 100).text, total: $((founding ? 643 : 768) + (usd ? 0 : founding ? 84 : 100)).text, cents: { beforeTax: founding ? 643 : 768, tax: usd ? 0 : founding ? 84 : 100 } } }),
      "payment-methods": () => ({ cards: [{ id: "pm_1", words: "Visa ending 4242", brand: "visa", last4: "4242", expMonth: 12, expYear: 2030, primary: true, expired: false }] }),
      invoices: () => ({ invoices: [{ id: "in_1", number: "COL-0001", date: "2026-11-12T12:00:00Z", amount: "$8.36", tax: "$0.96", status: "paid", pdfUrl: null, pageUrl: null }], more: false, after: null }),
      details: () => ({ details: { name: "Test Press", email: "owner@example.com", address: null, taxNumber: "", taxLabel: "GST/HST", plusTax: true, country: "CA" } }),
      "payment-way": () => ({ view: null }),
      "add-on": () => { const now = billing.addOns.bankFeed; billing = { ...billing, addOns: { bankFeed: { ...now, on: !now.on, banks: 0 } } }; return {}; },
    };
    const realFetch = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.startsWith(HUB)) return realFetch(input as any, init);
      const answer = answers[url.slice(HUB.length).split("?")[0]];
      const sent = (() => { try { return JSON.parse(String(init?.body ?? "{}")); } catch { return {}; } })();
      return new Response(JSON.stringify({ ok: true, ...(answer ? (answer(sent) as object) : {}) }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
  }
}

// The accountant's desk (?accountant=1): what a Team member with the Accountant role sees instead of the admin. The
// books come through the same key-free copy the live desk reads (bookkeeper-copy.js), from the sample records above.
if (new URLSearchParams(location.search).get("accountant") === "1") {
  const { bookkeeperTaxCopy } = await import("@stockroom/bookkeeper-copy.js");
  const { taxCenterFromCopy } = await import("../app/admin/stockroom/stockroomData");
  stockroomApi.loadForBookkeeper = async () => {
    const r = await stockroomApi.load();
    const kept = ((r.taxCenter as Record<string, any> | null)?.businessExpenses || []) as Record<string, unknown>[];
    const taxCenter = { ...(r.taxCenter || {}), settings: { baseCurrency: "CAD", geminiKey: "never-shown" }, businessExpenses: [...kept,
      { id: "a1", date: "2026-10-04", desc: "Risograph paper", vendor: "Mill Example", cat: "Printing", currency: "CAD", amount: 180, baseAmount: 180, receipt: "https://files.example/paper.pdf" },
      { id: "a2", date: "2026-10-12", desc: "Fair table", vendor: "Harbour Fair", cat: "Fairs & events", currency: "CAD", amount: 60, baseAmount: 60 }] };
    return { ...r, taxCenter: taxCenterFromCopy(bookkeeperTaxCopy(taxCenter)), invoiceSettings: null, submissions: {} };
  };
  const { createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { BookkeeperDesk } = await import("../app/admin/BookkeeperDesk");
  await import("../styles/index.css");
  createRoot(document.getElementById("root")!).render(createElement(BookkeeperDesk, { email: "ben.example@example.com", appearance: "light" }));
  helperShown = true;
}

if (!helperShown) {
  const page = new URLSearchParams(location.search).get("page") || "";
  // The admin walkthrough's welcome opens by itself on a first visit; screens and scripts here skip it unless the
  // address asks for it (`?tour=1`, walkthrough/AdminTour.tsx).
  try {
    if (new URLSearchParams(location.search).get("tour") === "1") localStorage.removeItem("lm:admin-tour");
    else localStorage.setItem("lm:admin-tour", "tour-2");
  } catch { /* storage blocked: the welcome may show */ }
  history.replaceState(null, "", `/admin?debug=true${page ? `#${page}` : ""}`);
  await import("../main");
}

// Customers › Saved groups keep to this page in the fixture (one sample group).
{
  let groups: any[] = [{ id: "g1", name: "Newsletter regulars", seg: "returning", q: "", consent: "subscribed", tag: "", country: "", sort: "recent" }];
  customerGroupsStore.load = async () => groups;
  customerGroupsStore.save = async (next) => { groups = next; };
}
