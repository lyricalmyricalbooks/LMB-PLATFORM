// The Monday summary email (Settings › Email sender › Shop alerts › Monday summary): last week (Monday to Sunday,
// Toronto days) against the week before, from real paid orders and the shop's own daily traffic counters. Same rules as
// the admin Overview: test orders, unpaid/refunded orders and the owner's own orders (placed with the shop's own email:
// src/app/lib/ownerDevice.ts isOwnOrder) don't count; revenue is after partial refunds. Pure.
const OWNER_EMAIL = "lyricalmyricalbooks@gmail.com";
const TZ = "America/Toronto";
const DAY = 86_400_000;

const torontoDay = ms => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const keyMs = key => Date.parse(`${key}T12:00:00Z`);
const shiftKey = (key, days) => new Date(keyMs(key) + days * DAY).toISOString().slice(0, 10);

/** Last week's Monday–Sunday and the week before, as Toronto day keys, for a run at `nowMs`. */
function lastWeek(nowMs) {
  const today = torontoDay(nowMs);
  const weekday = (new Date(keyMs(today)).getUTCDay() + 6) % 7; // Monday = 0
  const start = shiftKey(today, -weekday - 7);
  return { start, end: shiftKey(start, 6), prevStart: shiftKey(start, -7), prevEnd: shiftKey(start, -1) };
}

const timeOf = v => {
  if (!v) return 0;
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (typeof v._seconds === "number") return v._seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
};
const num = v => Number(v) || 0;

const isOwnOrder = o => String(o?.customer?.email || "").trim().toLowerCase() === OWNER_EMAIL;
/** A sale the Overview counts. */
const countsAsSale = o => o?.paymentStatus === "paid" && o?.isTest !== true && o?.sandboxPayment !== true && !isOwnOrder(o);

/** Mirrors the Overview's refundedAmount: the refunded share of the CAD total. */
function refundedAmount(o) {
  const minor = num(o?.refundedAmountMinor), total = num(o?.total);
  if (minor <= 0 || total <= 0) return 0;
  const expected = num(o?.expectedAmountMinor);
  if (expected > 0) return Math.min(total, (total * minor) / expected);
  const cur = String(o?.checkoutCurrency || o?.expectedCurrency || "CAD").toUpperCase();
  return cur === "CAD" ? Math.min(total, minor / 100) : 0;
}

function figures(orders, from, to, firstOrderIds) {
  const week = orders.filter(o => { const k = torontoDay(timeOf(o.createdAt)); return k >= from && k <= to; });
  const revenue = week.reduce((s, o) => s + Math.max(0, num(o.total) - refundedAmount(o)), 0);
  const units = week.reduce((s, o) => s + (o.items || []).reduce((n, i) => n + num(i.quantity), 0), 0);
  const books = new Map();
  week.forEach(o => (o.items || []).forEach(i => {
    if (i?.giftCard === true || i?.promoGift) return;
    const key = String(i.bookId || i.id || i.name || "");
    if (!key) return;
    const b = books.get(key) || { title: String(i.name || i.title || "Untitled"), units: 0 };
    b.units += num(i.quantity); books.set(key, b);
  }));
  return {
    orders: week.length, revenue, units, aov: week.length ? revenue / week.length : 0,
    newCustomers: week.filter(o => firstOrderIds.has(o.id)).length,
    top: [...books.values()].sort((a, b) => b.units - a.units || a.title.localeCompare(b.title)).slice(0, 5),
  };
}

/** Daily `analytics/<UTC date>` docs → visits and checkout starts between two day keys. */
function traffic(daily, from, to) {
  const rows = (daily || []).filter(d => { const k = String(d?.date || d?.id || ""); return k >= from && k <= to; });
  return {
    recorded: rows.length > 0,
    visits: rows.reduce((s, d) => s + num(d.visits), 0),
    checkouts: rows.reduce((s, d) => s + num(d?.funnel?.checkout_start), 0),
  };
}

const money = n => `$${(Math.round(n * 100) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const change = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null);
const changeWords = (now, before) => {
  const c = change(now, before);
  if (c === null) return now > 0 ? "new" : "same as before";
  if (Math.abs(c) < 0.5) return "same as the week before";
  return `${c > 0 ? "▲ up" : "▼ down"} ${Math.abs(c).toFixed(0)}%`;
};
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dayWords = key => new Date(keyMs(key)).toLocaleDateString("en-CA", { day: "numeric", month: "short", timeZone: "UTC" });

/** The email's pointer to the attached highlights PDF (index.js drops it again if the PDF couldn't be made). */
const WEEKLY_PDF_LINE = `<p style="margin:24px 0 0;">The attached PDF has last week's highlights on two pages: sales and visits by day, best sellers, the most looked-at books, where visitors came from, searches and how many shoppers went from looking to buying.</p>`;

/**
 * The email for the week. `orders` are the paid orders of at least the last two weeks (any extra are ignored),
 * `firstOrderIds` the ids of each customer's first-ever paid order (for "new customers"), `daily` the analytics docs.
 * `toDo` is what still needs the owner today ({ toShip: paid orders waiting 3+ days, as in the daily digest }). Returns { subject, html, figures }.
 */
function buildWeeklySummary({ orders, daily, week, firstOrderIds = new Set(), toDo = {}, link = p => p, withPdf = false }) {
  const sales = (orders || []).filter(countsAsSale);
  const cur = figures(sales, week.start, week.end, firstOrderIds);
  const prev = figures(sales, week.prevStart, week.prevEnd, firstOrderIds);
  const tCur = traffic(daily, week.start, week.end);
  const tPrev = traffic(daily, week.prevStart, week.prevEnd);
  const conv = tCur.visits > 0 ? (cur.orders / tCur.visits) * 100 : null;

  const headline = cur.orders === 0
    ? "No sales last week."
    : `${money(cur.revenue)} from ${cur.orders} ${cur.orders === 1 ? "order" : "orders"} (${changeWords(cur.revenue, prev.revenue)}).`;
  const row = (label, value, note) => `<tr><td style="padding:6px 0;color:#555;">${escapeHtml(label)}</td><td style="padding:6px 0;text-align:right;font-weight:600;">${escapeHtml(value)}</td><td style="padding:6px 0 6px 12px;color:#777;font-size:13px;">${escapeHtml(note || "")}</td></tr>`;
  const rows = [
    row("Revenue", money(cur.revenue), changeWords(cur.revenue, prev.revenue)),
    row("Orders", String(cur.orders), changeWords(cur.orders, prev.orders)),
    row("Average order", cur.orders ? money(cur.aov) : "—", prev.orders ? `${money(prev.aov)} the week before` : ""),
    row("Copies sold", String(cur.units), changeWords(cur.units, prev.units)),
    row("New customers", String(cur.newCustomers), `${prev.newCustomers} the week before`),
    ...(tCur.recorded ? [
      row("Visits (shop counter)", tCur.visits.toLocaleString("en-CA"), tPrev.recorded ? changeWords(tCur.visits, tPrev.visits) : ""),
      row("Visits that bought", conv === null ? "—" : `${conv.toFixed(1)}%`, `${tCur.checkouts} started checkout`),
    ] : []),
  ].join("");
  const top = cur.top.length
    ? `<h3 style="margin:24px 0 8px;">Best sellers</h3><ol style="padding-left:20px;margin:0;">${cur.top.slice(0, 3).map(b => `<li style="margin:4px 0;">${escapeHtml(b.title)} — ${b.units} ${b.units === 1 ? "copy" : "copies"}</li>`).join("")}</ol>`
    : "";
  const toShip = num(toDo.toShip);
  const todo = toShip > 0
    ? `<p style="margin:24px 0 0;"><strong>${toShip} paid ${toShip === 1 ? "order has" : "orders have"} waited 3 days or more to ship.</strong> <a href="${link("/admin#orders")}">Open Orders &rarr;</a></p>`
    : "";
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <p style="margin:0;color:#777;font-size:13px;">Week of ${escapeHtml(dayWords(week.start))} – ${escapeHtml(dayWords(week.end))}, compared with the week before</p>
      <h2 style="margin:8px 0 16px;">${escapeHtml(headline)}</h2>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      ${top}
      ${todo}
      ${withPdf ? WEEKLY_PDF_LINE : ""}
      <p style="margin:24px 0 0;"><a href="${link("/admin#overview")}">See everything on the Overview &rarr;</a></p>
      <p style="margin:24px 0 0;color:#999;font-size:12px;">Test orders and your own orders are left out. Turn this email off in Settings › Email sender › Shop alerts.</p>
    </div>`;
  const subject = `[WEEKLY] ${cur.orders === 0 ? "No sales" : `${money(cur.revenue)} · ${cur.orders} ${cur.orders === 1 ? "order" : "orders"}`} last week`;
  return { subject, html, figures: { cur, prev, traffic: tCur, conversion: conv } };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const daysOf = start => WEEKDAYS.map((_, i) => shiftKey(start, i));
/** A free-key count map summed over the week's analytics docs, biggest first. */
function sumMap(rows, field) {
  const out = new Map();
  rows.forEach(d => Object.entries(d?.[field] || {}).forEach(([k, v]) => { if (num(v) > 0) out.set(k, (out.get(k) || 0) + num(v)); }));
  return [...out.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Everything the PDF attached to the Monday email draws (functions/weeklyPdf.js), from the same inputs and rules as
 * buildWeeklySummary. `bookTitles` maps a book id to its title (for "most viewed"). Signals the shop never recorded
 * that week come back empty (`recorded: false` / []), never as made-up zeros.
 */
function weeklyHighlights({ orders, daily, week, firstOrderIds = new Set(), bookTitles = new Map() }) {
  const sales = (orders || []).filter(countsAsSale);
  const cur = figures(sales, week.start, week.end, firstOrderIds);
  const prev = figures(sales, week.prevStart, week.prevEnd, firstOrderIds);
  const tCur = traffic(daily, week.start, week.end);
  const tPrev = traffic(daily, week.prevStart, week.prevEnd);
  const inWeek = (from, to) => (daily || []).filter(d => { const k = String(d?.date || d?.id || ""); return k >= from && k <= to; });
  const rows = inWeek(week.start, week.end);
  const dayOfDoc = new Map((daily || []).map(d => [String(d?.date || d?.id || ""), d]));
  const revenueOn = key => sales.filter(o => torontoDay(timeOf(o.createdAt)) === key)
    .reduce((s, o) => s + Math.max(0, num(o.total) - refundedAmount(o)), 0);
  const series = (start, fn) => daysOf(start).map(fn);
  const title = id => bookTitles.get(id) || bookTitles.get(String(id)) || "A book no longer in the catalogue";

  const adds = new Map(sumMap(rows, "bookAdds").map(r => [r.key, r.count]));
  const funnel = rows.reduce((f, d) => {
    ["view", "add_to_cart", "checkout_start", "purchase"].forEach(k => { f[k] += num(d?.funnel?.[k]); });
    return f;
  }, { view: 0, add_to_cart: 0, checkout_start: 0, purchase: 0 });

  return {
    week,
    cur, prev,
    traffic: { cur: tCur, prev: tPrev },
    conversion: tCur.visits > 0 ? (cur.orders / tCur.visits) * 100 : null,
    prevConversion: tPrev.visits > 0 ? (prev.orders / tPrev.visits) * 100 : null,
    days: WEEKDAYS,
    revenueByDay: { cur: series(week.start, revenueOn), prev: series(week.prevStart, revenueOn) },
    visitsByDay: {
      cur: series(week.start, k => num(dayOfDoc.get(k)?.visits)),
      prev: series(week.prevStart, k => num(dayOfDoc.get(k)?.visits)),
    },
    bestSellers: cur.top,
    mostViewed: sumMap(rows, "bookViews").slice(0, 5).map(r => ({ title: title(r.key), views: r.count, adds: adds.get(r.key) || 0 })),
    sources: sumMap(rows, "sources").slice(0, 6),
    devices: sumMap(rows, "devices"),
    funnel: funnel.view + funnel.add_to_cart + funnel.checkout_start + funnel.purchase > 0 ? funnel : null,
    searches: sumMap(rows, "searches").slice(0, 6),
    noResults: sumMap(rows, "noResults").slice(0, 6),
  };
}

/** Settings › Email sender › Shop alerts › Monday summary (on unless switched off). */
const weeklySummaryEnabled = notificationSettings => notificationSettings?.shopAlerts?.weeklySummary !== false;

/** Ids of each customer's first-ever paid sale, from every paid order read. */
function firstOrders(orders) {
  const first = new Map();
  (orders || []).filter(countsAsSale).forEach(o => {
    const email = String(o?.customer?.email || "").trim().toLowerCase();
    if (!email) return;
    const seen = first.get(email);
    if (!seen || timeOf(o.createdAt) < timeOf(seen.createdAt)) first.set(email, o);
  });
  return new Set([...first.values()].map(o => o.id));
}

module.exports = { WEEKLY_PDF_LINE, lastWeek, buildWeeklySummary, weeklyHighlights, weeklySummaryEnabled, firstOrders, countsAsSale, isOwnOrder, torontoDay };
