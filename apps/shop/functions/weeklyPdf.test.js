import { createRequire } from "module";
import zlib from "zlib";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { lastWeek, weeklyHighlights, buildWeeklySummary, firstOrders, WEEKLY_PDF_LINE } = require("./weeklySummary");
const { buildWeeklyPdf, weeklyPdfName, winAnsi, fit, textWidth, sourceName } = require("./weeklyPdf");

const MONDAY = Date.parse("2026-10-19T12:00:00Z");
const week = lastWeek(MONDAY);
const order = (id, createdAt, extra = {}) => ({
  id, createdAt, paymentStatus: "paid", total: 30, customer: { email: `${id}@example.com` },
  items: [{ bookId: "b1", name: "Riso Book", quantity: 1 }], ...extra,
});
const orders = [
  order("a", "2026-10-13T15:00:00Z", { total: 60, items: [{ bookId: "b1", name: "Riso Book", quantity: 2 }] }),
  order("b", "2026-10-18T23:00:00Z", { items: [{ bookId: "b2", name: "Poèmes (côté) \\ éditions", quantity: 1 }] }), // Sunday evening Toronto
  order("c", "2026-10-07T15:00:00Z"),
  order("own", "2026-10-14T15:00:00Z", { customer: { email: "lyricalmyricalbooks@gmail.com" }, total: 999 }),
];
const daily = [
  { date: "2026-10-13", visits: 100, funnel: { view: 40, add_to_cart: 6, checkout_start: 4, purchase: 1 },
    sources: { "google com": 30, direct: 70 }, devices: { mobile: 60, desktop: 40 }, bookViews: { b1: 9, gone: 2 }, bookAdds: { b1: 3 },
    searches: { riso: 2 }, noResults: { tarot: 1 } },
  { date: "2026-10-14", visits: 20, bookViews: { b1: 1 } },
  { date: "2026-10-06", visits: 50, bookViews: { b1: 99 } },
];
const pageStreams = pdf => {
  const text = pdf.toString("latin1");
  const out = [];
  const re = /(?<!end)stream\n/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    const end = text.indexOf("\nendstream", start);
    out.push(zlib.inflateSync(pdf.subarray(start, end)).toString("latin1"));
  }
  return out;
};
const hexText = s => `<${winAnsi(s).map(b => b.toString(16).padStart(2, "0")).join("")}>`;

describe("weekly highlights", () => {
  const h = weeklyHighlights({ orders, daily, week, firstOrderIds: firstOrders(orders), bookTitles: new Map([["b1", "Riso Book"]]) });

  it("uses the same sales rules as the email and splits them by Toronto day", () => {
    expect(h.cur.orders).toBe(2);
    expect(h.cur.revenue).toBe(90);
    expect(h.revenueByDay.cur).toEqual([0, 60, 0, 0, 0, 0, 30]); // Tue, and the Sunday-evening order on Sunday
    expect(h.revenueByDay.prev[2]).toBe(30);
    expect(h.visitsByDay.cur.slice(0, 3)).toEqual([0, 100, 20]);
  });

  it("sums the week's signals only, with titles for viewed books", () => {
    expect(h.mostViewed).toEqual([{ title: "Riso Book", views: 10, adds: 3 }, { title: "A book no longer in the catalogue", views: 2, adds: 0 }]);
    expect(h.sources.map(s => s.key)).toEqual(["direct", "google com"]);
    expect(h.funnel).toEqual({ view: 40, add_to_cart: 6, checkout_start: 4, purchase: 1 });
    expect(h.bestSellers[0]).toEqual({ title: "Riso Book", units: 2 });
  });

  it("leaves never-recorded signals empty instead of zero", () => {
    const empty = weeklyHighlights({ orders: [], daily: [], week });
    expect(empty.traffic.cur.recorded).toBe(false);
    expect(empty.funnel).toBeNull();
    expect(empty.conversion).toBeNull();
    expect(empty.mostViewed).toEqual([]);
  });
});

describe("weekly highlights PDF", () => {
  const h = weeklyHighlights({ orders, daily, week, firstOrderIds: firstOrders(orders), bookTitles: new Map([["b1", "Riso Book"]]) });
  const pdf = buildWeeklyPdf(h);

  it("is a well-formed two-page PDF with a correct cross-reference table", () => {
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Count 2");
    const startxref = Number(text.match(/startxref\n(\d+)/)[1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const offsets = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n/g)].map(m => Number(m[1]));
    offsets.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it("draws the figures and names, accents and all", () => {
    const [one, two] = pageStreams(pdf);
    expect(one).toContain(hexText("$90.00"));
    expect(one).toContain(hexText("Weekly highlights"));
    expect(two).toContain(hexText("Poèmes (côté) \\ éditions"));
    expect(two).toContain(hexText("google.com"));
    expect(two).not.toContain(hexText("Book views are not recorded yet."));
  });

  it("still builds with no data at all, saying what isn't recorded", () => {
    const [one, two] = pageStreams(buildWeeklyPdf(weeklyHighlights({ orders: [], daily: [], week })));
    expect(one).toContain(hexText("No sales last week."));
    expect(one).toContain(hexText("Visits are not recorded yet."));
    expect(two).toContain(hexText("Book views are not recorded yet."));
  });

  it("names the file after the week", () => {
    expect(weeklyPdfName(week)).toBe("lyricalmyrical-weekly-highlights-2026-10-12.pdf");
  });
});

describe("PDF text helpers", () => {
  it("maps text to WinAnsi bytes, dropping accents it can't encode", () => {
    expect(winAnsi("é—…")).toEqual([0xe9, 0x97, 0x85]);
    expect(winAnsi("Ā")).toEqual([0x41]);
    expect(winAnsi("書")).toEqual([0x3f]);
  });

  it("shortens long titles to fit", () => {
    const t = fit("A very long book title that keeps going and going", 10, 100);
    expect(t.endsWith("…")).toBe(true);
    expect(textWidth(t, 10)).toBeLessThanOrEqual(100);
    expect(fit("Short", 10, 100)).toBe("Short");
  });

  it("turns stored source keys back into addresses", () => {
    expect(sourceName("google com")).toBe("google.com");
    expect(sourceName("direct")).toBe("Typed the address or a bookmark");
    expect(sourceName("newsletter")).toBe("newsletter");
  });
});

describe("Monday email and its PDF", () => {
  it("mentions the attachment only when one is sent", () => {
    expect(buildWeeklySummary({ orders, daily, week, withPdf: true }).html).toContain(WEEKLY_PDF_LINE);
    expect(buildWeeklySummary({ orders, daily, week }).html).not.toContain(WEEKLY_PDF_LINE);
  });
});
