// The fair day email (Settings › Email sender › Shop alerts › Fair day summary; docs/combined-admin.md): on an evening
// after the Fair till sold something, the day's takings, ways of paying and best sellers, from the sales the stockroom
// has uploaded. Read-only: the stockroom stays the only place a sale is recorded. Silent on a day with no till sales.
// The rules match the stockroom's own end-of-day summary (apps/stockroom/src/lib/fair-mode.js registerSalesForDay,
// saleMethod, fairNameOf), so the email and the till's "End of day" agree. Pure.
const TZ = "America/Toronto";

const torontoDay = ms => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

// The till's ways of paying, longest first so "Stripe QR (printed …)" isn't read as something shorter.
const METHODS = [
  { value: "Bank Transfer", label: "E-transfer" }, { value: "Stripe QR", label: "QR / Stripe" },
  { value: "Comp/Gift", label: "Comp" }, { value: "Card", label: "Card reader" }, { value: "Cash", label: "Cash" },
];
const methodOf = notes => METHODS.find(m => String(notes || "").startsWith(m.value)) || { value: "Other", label: "Other" };

/** The fair a till row was sold at, from its note ("Cash · Harbour Fair · Price A→B"); "" when none was named. */
function fairNameOf(notes) {
  const text = String(notes || "");
  const method = methodOf(text);
  const rest = method.value === "Other" ? "" : text.slice(method.value.length).replace(/^ \([^)]*\)/, "");
  const m = /^ · (.+?)(?: · Price [^·]*→[^·]*)?$/.exec(rest);
  return m && !/^Price [^·]*→/.test(m[1]) ? m[1].trim() : "";
}

/** A book's currency ("CA$", "cad", "USD") as a code; CAD when unclear, as the stockroom does. */
function currencyCode(cur) {
  const upper = String(cur || "").trim().toUpperCase();
  if (upper === "CA$" || upper === "C$" || upper === "$") return "CAD";
  if (upper === "US$") return "USD";
  if (upper === "€") return "EUR";
  if (upper === "£") return "GBP";
  return /^[A-Z]{3}$/.test(upper) ? upper : "CAD";
}

const cents = n => Math.round((Number(n) || 0) * 100) / 100;
const totalsList = totals => Object.entries(totals).sort(([a], [b]) => a.localeCompare(b)).map(([cur, amount]) => ({ cur, amount: cents(amount) }));
const add = (totals, cur, amount) => { totals[cur] = (totals[cur] || 0) + amount; };

/**
 * One day at the Fair till. `books` are [{ id, title, currency, hist }] (the stockroom's uploaded sales records); only
 * live Book Fair rows of `day` count, one sale per checkout number. Totals stay per currency, never converted.
 */
function fairDaySummary(books, day) {
  const sales = new Map();
  const titles = new Map();
  const fairs = new Map();
  const totals = {};
  let units = 0;
  for (const book of books || []) {
    for (const h of Array.isArray(book?.hist) ? book.hist : []) {
      if (!h || h.voided || h.chan !== "Book Fair" || h.date !== day || !h.num) continue;
      const qty = Number(h.qty) || 0;
      const amount = qty * (Number(h.price) || 0);
      const cur = h.cur ? currencyCode(h.cur) : currencyCode(book.currency);
      const method = methodOf(h.notes);
      const sale = sales.get(h.num) || { method: method.label, totals: {} };
      add(sale.totals, cur, amount);
      sales.set(h.num, sale);
      const title = String(book.title || book.id || "Untitled");
      const t = titles.get(book.id) || { title, units: 0, totals: {} };
      t.units += qty; add(t.totals, cur, amount);
      titles.set(book.id, t);
      const fair = fairNameOf(h.notes);
      if (fair) fairs.set(fair, (fairs.get(fair) || 0) + 1);
      add(totals, cur, amount);
      units += qty;
    }
  }
  const methods = new Map();
  for (const sale of sales.values()) {
    const m = methods.get(sale.method) || { label: sale.method, sales: 0, totals: {} };
    m.sales++;
    for (const [cur, amount] of Object.entries(sale.totals)) add(m.totals, cur, amount);
    methods.set(sale.method, m);
  }
  return {
    day,
    fairs: [...fairs.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name),
    sales: sales.size,
    units,
    totals: totalsList(totals),
    methods: [...methods.values()].sort((a, b) => b.sales - a.sales || a.label.localeCompare(b.label)).map(m => ({ ...m, totals: totalsList(m.totals) })),
    titles: [...titles.values()].sort((a, b) => b.units - a.units || a.title.localeCompare(b.title)).map(t => ({ ...t, totals: totalsList(t.totals) })),
  };
}

const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function money(amount, cur) {
  try { return new Intl.NumberFormat("en-CA", { style: "currency", currency: cur }).format(amount); } catch { return `${cur} ${amount.toFixed(2)}`; }
}
const totalsText = list => (list.length ? list.map(t => money(t.amount, t.cur)).join(" + ") : money(0, "CAD"));
const dayWords = key => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/**
 * The email for one fair day, or null when the till sold nothing that day. `words` is the shop's words (books or
 * products, plan 10.23); `link` makes an admin address.
 */
function buildFairDayEmail(summary, { link = p => p, words = t => t } = {}) {
  if (!summary || !summary.sales) return null;
  const where = summary.fairs.length ? summary.fairs.join(" and ") : "the Fair till";
  const things = words(summary.units === 1 ? "book" : "books");
  const headline = `${totalsText(summary.totals)} at ${where}`;
  const row = (label, note, value) => `<tr><td style="padding:6px 0;">${escapeHtml(label)}<div style="color:#777;font-size:13px;">${escapeHtml(note)}</div></td><td style="padding:6px 0;text-align:right;font-weight:600;white-space:nowrap;">${escapeHtml(value)}</td></tr>`;
  const methods = summary.methods.map(m => row(m.label, `${m.sales} ${m.sales === 1 ? "sale" : "sales"}`, totalsText(m.totals))).join("");
  const titles = summary.titles.slice(0, 10).map(t => row(t.title, `${t.units} sold`, totalsText(t.totals))).join("");
  const more = summary.titles.length > 10 ? `<p style="margin:8px 0 0;color:#777;font-size:13px;">${escapeHtml(words(`and ${summary.titles.length - 10} more books`))}</p>` : "";
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <p style="margin:0;color:#777;font-size:13px;">${escapeHtml(dayWords(summary.day))}</p>
      <h2 style="margin:8px 0 4px;">${escapeHtml(headline)}</h2>
      <p style="margin:0 0 16px;">${summary.units} ${escapeHtml(things)} in ${summary.sales} ${summary.sales === 1 ? "sale" : "sales"}.</p>
      <h3 style="margin:24px 0 4px;">By way of paying</h3>
      <p style="margin:0 0 8px;color:#777;font-size:13px;">Check the card reader line against your card reader's own total for the day.</p>
      <table style="width:100%;border-collapse:collapse;">${methods}</table>
      <h3 style="margin:24px 0 8px;">${escapeHtml(words("By book"))}</h3>
      <table style="width:100%;border-collapse:collapse;">${titles}</table>${more}
      <p style="margin:24px 0 0;"><a href="${link("/admin#sales")}">Compare your fair days in All sales &rarr;</a></p>
      <p style="margin:24px 0 0;color:#999;font-size:12px;">From the sales the Fair till had uploaded by this evening. A phone that was still offline adds its sales when it next connects. Turn this email off in Settings › Email sender › Shop alerts.</p>
    </div>`;
  const subject = `[FAIR DAY] ${totalsText(summary.totals)} · ${summary.sales} ${summary.sales === 1 ? "sale" : "sales"}${summary.fairs.length ? ` at ${summary.fairs[0]}` : ""}`;
  return { subject, html };
}

/** Settings › Email sender › Shop alerts › Fair day summary (on unless switched off). */
const fairDayEmailEnabled = notificationSettings => notificationSettings?.shopAlerts?.fairDaySummary !== false;

module.exports = { fairDaySummary, buildFairDayEmail, fairDayEmailEnabled, fairNameOf, currencyCode, torontoDay };
