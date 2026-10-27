// The PDF attached to the Monday summary email: a two-page "weekly highlights" print-out of last week's shop
// analytics (figures from weeklySummary.js weeklyHighlights). Written by hand with the PDF's built-in Helvetica
// fonts, so it needs no package and no network. Pure: buildWeeklyPdf(highlights) → Buffer.
const zlib = require("zlib");

// Riso Press colours (functions/emailTheme.js RISO light), as PDF 0–1 RGB.
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const C = {
  paper: hex("#faf6ec"), card: hex("#ffffff"), ink: hex("#100f0d"), muted: hex("#5f5950"),
  hair: hex("#d9d0bd"), accent: hex("#e8402a"), up: hex("#0a6b47"), down: hex("#b4271a"),
};

// Helvetica / Helvetica-Bold advance widths (1/1000 em) for ASCII 32–126; anything else counts as 556.
const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const WIDE = { "—": 1000, "–": 556, "•": 350, "·": 278, "›": 333, "…": 1000 };

// WinAnsi bytes for the few non-Latin-1 characters the report uses; anything else not in Latin-1 loses its accent or becomes "?".
const WIN = { "€": 0x80, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "‹": 0x8b, "›": 0x9b };
function winAnsi(text) {
  const out = [];
  for (const ch of String(text ?? "")) {
    const code = ch.codePointAt(0);
    if (WIN[ch]) out.push(WIN[ch]);
    else if ((code >= 32 && code < 127) || (code >= 0xa0 && code <= 0xff)) out.push(code);
    else {
      const base = ch.normalize("NFD")[0];
      const b = base && base.codePointAt(0);
      out.push(b >= 32 && b < 127 ? b : 63);
    }
  }
  return out;
}
const pdfString = text => `<${winAnsi(text).map(b => b.toString(16).padStart(2, "0")).join("")}>`;

function textWidth(text, size, bold = false) {
  let w = 0;
  for (const ch of String(text ?? "")) {
    const code = ch.codePointAt(0);
    w += code >= 32 && code <= 126 ? (bold ? W_BOLD : W_REG)[code - 32] : (WIDE[ch] || 556);
  }
  return (w * size) / 1000;
}
/** Shortens `text` with an ellipsis so it fits `max` points. */
function fit(text, size, max, bold = false) {
  let t = String(text ?? "");
  if (textWidth(t, size, bold) <= max) return t;
  while (t.length > 1 && textWidth(`${t}…`, size, bold) > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

const PAGE_W = 612, PAGE_H = 792, M = 48; // US Letter, ¾" margins
const f = n => (Math.round(n * 100) / 100).toString();

/** One page's drawing commands, in top-left coordinates (y grows downward like the screen). */
function canvas() {
  const ops = [];
  const rgb = c => c.map(f).join(" ");
  const y = v => PAGE_H - v;
  return {
    ops,
    rect(x, top, w, h, { fill, stroke, width = 1 } = {}) {
      if (fill) ops.push(`${rgb(fill)} rg`);
      if (stroke) ops.push(`${rgb(stroke)} RG ${f(width)} w`);
      ops.push(`${f(x)} ${f(y(top + h))} ${f(w)} ${f(h)} re ${fill && stroke ? "B" : fill ? "f" : "S"}`);
    },
    line(x1, y1, x2, y2, { color = C.ink, width = 1 } = {}) {
      ops.push(`${rgb(color)} RG ${f(width)} w ${f(x1)} ${f(y(y1))} m ${f(x2)} ${f(y(y2))} l S`);
    },
    /** `baseline` is the text's baseline; align left | right | center around x. */
    text(str, x, baseline, { size = 10, bold = false, color = C.ink, align = "left" } = {}) {
      const s = String(str ?? "");
      const w = textWidth(s, size, bold);
      const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
      ops.push(`BT /${bold ? "F2" : "F1"} ${f(size)} Tf ${rgb(color)} rg ${f(left)} ${f(y(baseline))} Td ${pdfString(s)} Tj ET`);
    },
  };
}

/** Assembles pages (arrays of drawing ops) into a PDF file. */
function writePdf(pages, { title = "Weekly highlights" } = {}) {
  const objects = [];
  const add = body => { objects.push(body); return objects.length; };
  const catalog = add(null), pagesObj = add(null);
  const font = name => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`);
  const f1 = font("Helvetica"), f2 = font("Helvetica-Bold");
  const kids = pages.map(ops => {
    const data = zlib.deflateSync(Buffer.from(ops.join("\n"), "latin1"));
    const content = add({ dict: `<< /Length ${data.length} /Filter /FlateDecode >>`, data });
    return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`);
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${pdfString(title)} /Producer (Lyricalmyrical Books) >>`);

  const chunks = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(offset);
    const parts = typeof body === "string"
      ? [Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, "latin1")]
      : [Buffer.from(`${i + 1} 0 obj\n${body.dict}\nstream\n`, "latin1"), body.data, Buffer.from("\nendstream\nendobj\n", "latin1")];
    parts.forEach(p => { chunks.push(p); offset += p.length; });
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`, "latin1"));
  return Buffer.concat(chunks);
}

// ── Wording ──
const money = n => `$${(Math.round(n * 100) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = n => Math.round(n).toLocaleString("en-CA");
const keyMs = key => Date.parse(`${key}T12:00:00Z`);
const dayWords = (key, opts = { day: "numeric", month: "short" }) => new Date(keyMs(key)).toLocaleDateString("en-CA", { ...opts, timeZone: "UTC" });
/** { words, tone } for a change against the week before: tone up | down | flat. */
function delta(now, before) {
  if (!(before > 0)) return { words: now > 0 ? "New this week" : "Same as the week before", tone: "flat" };
  const c = ((now - before) / before) * 100;
  if (Math.abs(c) < 0.5) return { words: "Same as the week before", tone: "flat" };
  return { words: `${c > 0 ? "Up" : "Down"} ${Math.abs(c).toFixed(0)}% on the week before`, tone: c > 0 ? "up" : "down" };
}
const note = ({ words, tone }) => ({ note: words, tone });
const toneColor = tone => (tone === "up" ? C.up : tone === "down" ? C.down : C.muted);
const SOURCE_NAMES = { direct: "Typed the address or a bookmark" };
// Sources are stored with dots as spaces (src/app/lib/analyticsKeys.ts analyticsKey): "google com" → "google.com".
const sourceName = key => SOURCE_NAMES[key] || (/^[a-z0-9-]+( [a-z0-9-]+)+$/i.test(key) ? key.replace(/ /g, ".") : key);
const DEVICE_NAMES = { mobile: "Phones", tablet: "Tablets", desktop: "Computers" };

// ── Building blocks ──
function header(c, h, page, pages) {
  c.rect(0, 0, PAGE_W, PAGE_H, { fill: C.paper });
  c.text("LYRICALMYRICAL BOOKS", M, M + 10, { size: 9, bold: true, color: C.muted });
  c.text(`Page ${page} of ${pages}`, PAGE_W - M, M + 10, { size: 9, color: C.muted, align: "right" });
  c.text(page === 1 ? "Weekly highlights" : "Weekly highlights, continued", M, M + 44, { size: page === 1 ? 30 : 20, bold: true });
  const range = `${dayWords(h.week.start, { weekday: "long", day: "numeric", month: "long" })} to ${dayWords(h.week.end, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;
  c.text(range, M, M + (page === 1 ? 64 : 60), { size: 11, color: C.muted });
  const ruleY = M + (page === 1 ? 76 : 72);
  c.rect(M, ruleY, PAGE_W - 2 * M, 2.5, { fill: C.ink });
  return ruleY + 2.5;
}

function footer(c) {
  c.line(M, PAGE_H - M - 14, PAGE_W - M, PAGE_H - M - 14, { color: C.hair, width: 0.75 });
  c.text("Test orders and your own orders are left out. Revenue is after refunds. Visits come from the shop's own counter,",
    M, PAGE_H - M, { size: 7.5, color: C.muted });
  c.text("which counts only shoppers who accepted analytics cookies. The admin Overview has every figure in full.",
    M, PAGE_H - M + 10, { size: 7.5, color: C.muted });
}

function sectionTitle(c, title, x, top, w) {
  c.text(title.toUpperCase(), x, top + 10, { size: 9, bold: true });
  c.rect(x, top + 15, w, 1.25, { fill: C.ink });
  return top + 26;
}

function tile(c, x, top, w, h, { label, value, note, tone = "flat" }) {
  c.rect(x + 3, top + 3, w, h, { fill: C.ink }); // flat offset shadow
  c.rect(x, top, w, h, { fill: C.card, stroke: C.ink, width: 1.5 });
  c.text(fit(label.toUpperCase(), 7.5, w - 20, true), x + 10, top + 17, { size: 7.5, bold: true, color: C.muted });
  c.text(fit(value, 20, w - 20, true), x + 10, top + 43, { size: 20, bold: true });
  if (note) c.text(fit(note, 7.5, w - 20), x + 10, top + h - 10, { size: 7.5, color: toneColor(tone) });
}

/** Paired bars per weekday: this week in ink, the week before in a light outline. */
function weekBars(c, x, top, w, h, { cur, prev, labels, format, empty }) {
  const max = Math.max(0, ...cur, ...prev);
  const baseY = top + h - 18;
  const chartH = h - 36;
  c.line(x, baseY, x + w, baseY, { width: 1 });
  if (!(max > 0)) {
    c.text(empty, x + w / 2, top + h / 2, { size: 9, color: C.muted, align: "center" });
    return;
  }
  [0.5, 1].forEach(t => c.line(x, baseY - chartH * t, x + w, baseY - chartH * t, { color: C.hair, width: 0.5 }));
  c.text(format(max), x, baseY - chartH - 4, { size: 7, color: C.muted });
  const slot = w / labels.length;
  const bw = Math.min(16, slot / 3);
  labels.forEach((label, i) => {
    const mid = x + slot * i + slot / 2;
    const hp = (prev[i] / max) * chartH, hc = (cur[i] / max) * chartH;
    if (hp > 0) c.rect(mid - bw - 1, baseY - hp, bw, hp, { fill: C.card, stroke: C.muted, width: 0.75 });
    if (hc > 0) c.rect(mid + 1, baseY - hc, bw, hc, { fill: C.ink });
    if (cur[i] > 0) c.text(format(cur[i]), mid + 1 + bw / 2, baseY - hc - 3, { size: 6.5, align: "center" });
    c.text(label, mid, baseY + 12, { size: 8, color: C.muted, align: "center" });
  });
}

function legend(c, x, baseline) {
  c.rect(x, baseline - 7, 8, 8, { fill: C.ink });
  c.text("Last week", x + 12, baseline, { size: 8 });
  c.rect(x + 70, baseline - 7, 8, 8, { fill: C.card, stroke: C.muted, width: 0.75 });
  c.text("The week before", x + 82, baseline, { size: 8 });
}

/** A ranked list with a share bar behind each count. rows: [{ label, value, count, note? }]. */
function rankedList(c, x, top, w, rows, { empty, rowH = 19 } = {}) {
  if (!rows.length) {
    c.text(empty, x, top + 12, { size: 9, color: C.muted });
    return top + 24;
  }
  const max = Math.max(...rows.map(r => r.count)) || 1;
  const valueW = 70;
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const barW = ((w - valueW) * r.count) / max;
    c.rect(x, y + 2, Math.max(2, barW), rowH - 5, { fill: i === 0 ? C.accent : C.hair });
    c.text(`${i + 1}`, x + 5, y + rowH - 7, { size: 8, bold: true });
    c.text(fit(r.label, 8.5, w - valueW - 24), x + 18, y + rowH - 7, { size: 8.5 });
    c.text(r.value, x + w, y + rowH - 7, { size: 8.5, bold: true, align: "right" });
  });
  return top + rows.length * rowH + 6;
}

// ── Pages ──
function pageOne(h) {
  const c = canvas();
  let top = header(c, h, 1, 2);
  const { cur, prev } = h;
  const visits = h.traffic.cur, visitsBefore = h.traffic.prev;

  const headline = cur.orders === 0
    ? "No sales last week."
    : `${money(cur.revenue)} from ${cur.orders} ${cur.orders === 1 ? "order" : "orders"}. ${delta(cur.revenue, prev.revenue).words}.`;
  c.text(fit(headline, 15, PAGE_W - 2 * M, true), M, top + 30, { size: 15, bold: true });
  top += 48;

  const gap = 12, cols = 4;
  const tw = (PAGE_W - 2 * M - gap * (cols - 1) - 3) / cols, th = 64;
  const tiles = [
    { label: "Revenue", value: money(cur.revenue), ...note(delta(cur.revenue, prev.revenue)) },
    { label: "Orders", value: whole(cur.orders), ...note(delta(cur.orders, prev.orders)) },
    { label: "Average order", value: cur.orders ? money(cur.aov) : "—", note: prev.orders ? `${money(prev.aov)} the week before` : "No orders the week before" },
    { label: "Copies sold", value: whole(cur.units), ...note(delta(cur.units, prev.units)) },
    { label: "New customers", value: whole(cur.newCustomers), note: `${whole(prev.newCustomers)} the week before` },
    visits.recorded
      ? { label: "Visits", value: whole(visits.visits), ...(visitsBefore.recorded ? note(delta(visits.visits, visitsBefore.visits)) : { note: "Not counted the week before" }) }
      : { label: "Visits", value: "—", note: "Not recorded yet" },
    { label: "Visits that bought", value: h.conversion === null ? "—" : `${h.conversion.toFixed(1)}%`,
      note: h.prevConversion === null ? (h.conversion === null ? "Not recorded yet" : "") : `${h.prevConversion.toFixed(1)}% the week before` },
    { label: "Started checkout", value: visits.recorded ? whole(visits.checkouts) : "—",
      note: visits.recorded ? (visitsBefore.recorded ? `${whole(visitsBefore.checkouts)} the week before` : "") : "Not recorded yet" },
  ];
  tiles.forEach((t, i) => tile(c, M + (i % cols) * (tw + gap), top + Math.floor(i / cols) * (th + gap), tw, th, t));
  top += 2 * th + gap + 26;

  const fullW = PAGE_W - 2 * M;
  top = sectionTitle(c, "Sales by day", M, top, fullW);
  legend(c, PAGE_W - M - 160, top - 16);
  weekBars(c, M, top, fullW, 150, { cur: h.revenueByDay.cur, prev: h.revenueByDay.prev, labels: h.days, format: v => `$${Math.round(v)}`, empty: "No sales in these two weeks." });
  top += 172;

  top = sectionTitle(c, "Visits by day", M, top, fullW);
  legend(c, PAGE_W - M - 160, top - 16);
  weekBars(c, M, top, fullW, 150, {
    cur: h.visitsByDay.cur, prev: h.visitsByDay.prev, labels: h.days, format: v => whole(v),
    empty: visits.recorded ? "No visits counted in these two weeks." : "Visits are not recorded yet.",
  });
  footer(c);
  return c.ops;
}
function pageTwo(h) {
  const c = canvas();
  let top = header(c, h, 2, 2) + 22;
  const colGap = 24;
  const colW = (PAGE_W - 2 * M - colGap) / 2;
  const left = M, right = M + colW + colGap;

  // Left column: books.
  let l = sectionTitle(c, "Best sellers", left, top, colW);
  l = rankedList(c, left, l, colW, h.bestSellers.map(b => ({ label: b.title, value: `${whole(b.units)} ${b.units === 1 ? "copy" : "copies"}`, count: b.units })),
    { empty: "Nothing sold last week." }) + 14;
  l = sectionTitle(c, "Most looked-at books", left, l, colW);
  l = rankedList(c, left, l, colW, h.mostViewed.map(b => ({ label: b.title, value: `${whole(b.views)} views`, count: b.views })),
    { empty: "Book views are not recorded yet." });
  if (h.mostViewed.length) {
    const added = h.mostViewed.filter(b => b.adds > 0);
    if (added.length) c.text(fit(`Added to bag: ${added.map(b => `${b.title} (${whole(b.adds)})`).join(", ")}`, 7.5, colW), left, l + 4, { size: 7.5, color: C.muted });
    l += 16;
  }
  l += 14;
  l = sectionTitle(c, "What shoppers searched for", left, l, colW);
  l = rankedList(c, left, l, colW, h.searches.map(s => ({ label: `“${s.key}”`, value: whole(s.count), count: s.count })),
    { empty: "No searches recorded last week." }) + 14;
  if (h.noResults.length) {
    l = sectionTitle(c, "Searches that found nothing", left, l, colW);
    rankedList(c, left, l, colW, h.noResults.map(s => ({ label: `“${s.key}”`, value: whole(s.count), count: s.count })), {});
  }

  // Right column: visitors.
  let r = sectionTitle(c, "Where visitors came from", right, top, colW);
  const sourceTotal = h.sources.reduce((s, x) => s + x.count, 0);
  r = rankedList(c, right, r, colW, h.sources.map(s => ({ label: sourceName(s.key), value: `${Math.round((s.count / sourceTotal) * 100)}%`, count: s.count })),
    { empty: "Visit sources are not recorded yet." }) + 14;
  r = sectionTitle(c, "Phones or computers", right, r, colW);
  const deviceTotal = h.devices.reduce((s, x) => s + x.count, 0);
  r = rankedList(c, right, r, colW, h.devices.map(d => ({ label: DEVICE_NAMES[d.key] || d.key, value: `${Math.round((d.count / deviceTotal) * 100)}%`, count: d.count })),
    { empty: "Devices are not recorded yet." }) + 14;
  r = sectionTitle(c, "From looking to buying", right, r, colW);
  if (!h.funnel) {
    c.text("The shopper journey is not recorded yet.", right, r + 12, { size: 9, color: C.muted });
  } else {
    const steps = [["Looked at a book", h.funnel.view], ["Added to bag", h.funnel.add_to_cart], ["Started checkout", h.funnel.checkout_start], ["Bought", h.funnel.purchase]];
    const max = Math.max(...steps.map(s => s[1])) || 1;
    steps.forEach(([label, n], i) => {
      const y = r + i * 30;
      c.text(label, right, y + 9, { size: 8.5 });
      c.text(whole(n), right + colW, y + 9, { size: 8.5, bold: true, align: "right" });
      c.rect(right, y + 13, colW, 8, { fill: C.card, stroke: C.hair, width: 0.5 });
      if (n > 0) c.rect(right, y + 13, (colW * n) / max, 8, { fill: i === steps.length - 1 ? C.accent : C.ink });
    });
  }
  footer(c);
  return c.ops;
}

/** The two-page highlights PDF for weeklyHighlights() output. */
function buildWeeklyPdf(highlights) {
  return writePdf([pageOne(highlights), pageTwo(highlights)], { title: `Weekly highlights, week of ${dayWords(highlights.week.start)}` });
}

const weeklyPdfName = week => `lyricalmyrical-weekly-highlights-${week.start}.pdf`;

module.exports = { buildWeeklyPdf, weeklyPdfName, winAnsi, textWidth, fit, sourceName };
