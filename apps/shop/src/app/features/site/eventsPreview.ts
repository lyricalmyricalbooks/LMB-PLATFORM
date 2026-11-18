// The Events page inside Studio's preview: sample events and one sample order, so an owner can design the list, an
// event's page and the "You're going" page before selling a single ticket, and whether or not Events is switched on.
// Only a real Studio preview gets these (bookTimePreview.ts `isBookingPreview`); nothing is saved and no email is sent.
import { shopTimeZone } from "../../../shared/shopTimeZone";
import type { EventOrderView, EventView, EventsInfo } from "./eventsRules";

export const SAMPLE_EVENT_ORDER = "sample-tickets";
export const SAMPLE_EVENT_KEY = "0".repeat(48);

const DAY = 86_400_000;

/** Sample events from today on: one on sale with a nearly gone ticket, a free one that is also online, one sold out. */
export function sampleEvents(nowMs: number): EventView[] {
  const at = (days: number, hour: number) => { const d = new Date(nowMs + days * DAY); d.setUTCHours(hour, 0, 0, 0); return d.toISOString(); };
  return [
    { id: "sample-launch", title: "Autumn launch party", description: "Sample event. Yours show here once you add them under Events.\n\nReadings, music and a first look at the new season.",
      start: at(12, 23), end: at(13, 2), venue: "The Print Room", address: "12 Sample Street", photo: "", online: false, open: true, cancelled: false,
      tickets: [
        { id: "general", name: "General", priceMinor: 1500, maxPerOrder: 6, left: 6, soldOut: false },
        { id: "supporter", name: "Supporter (with a signed print)", priceMinor: 4000, maxPerOrder: 4, left: 2, soldOut: false },
        { id: "student", name: "Student", priceMinor: 800, maxPerOrder: 2, left: 0, soldOut: true },
      ],
      extras: [{ id: "programme", name: "Printed programme", priceMinor: 500, maxPerOrder: 6 }, { id: "drink", name: "Welcome drink", priceMinor: 800, maxPerOrder: 6 }], feeMinor: 100 },
    { id: "sample-talk", title: "In conversation: making things by hand", description: "A free evening talk, in the room or online.",
      start: at(20, 23), end: at(21, 0), venue: "The studio", address: "", photo: "", online: true, open: true, cancelled: false, membersUntil: at(5, 14),
      tickets: [{ id: "seat", name: "A seat", priceMinor: 0, maxPerOrder: 4, left: 4, soldOut: false }] },
    { id: "sample-market", title: "Winter market", description: "Stalls, hot drinks and gifts.",
      start: at(33, 16), end: at(33, 22), venue: "Market Hall", address: "", photo: "", online: false, open: true, cancelled: false,
      tickets: [{ id: "entry", name: "Entry", priceMinor: 500, maxPerOrder: 10, left: 0, soldOut: true }] },
  ];
}

/** The sample order as last made in this preview. */
let sample: EventOrderView | null = null;

function sampleOrder(nowMs: number, currency: string, eventId?: string, picks?: Record<string, number>, name?: string, extraPicks: Record<string, number> = {}): EventOrderView {
  const events = sampleEvents(nowMs);
  const event = events.find((e) => e.id === eventId) || events[0];
  const wanted = picks && Object.values(picks).some((n) => n > 0) ? picks : { [event.tickets[0].id]: 2 };
  const lines = event.tickets.filter((t) => wanted[t.id] > 0).map((t) => ({ ticketId: t.id, name: t.name, qty: Math.min(wanted[t.id], t.maxPerOrder), priceMinor: t.priceMinor }));
  const extras = (event.extras ?? []).filter((x) => extraPicks[x.id] > 0).map((x) => ({ extraId: x.id, name: x.name, qty: Math.min(extraPicks[x.id], x.maxPerOrder), priceMinor: x.priceMinor }));
  const feeMinor = (event.feeMinor || 0) * lines.reduce((sum, l) => sum + (l.priceMinor > 0 ? l.qty : 0), 0);
  const totalMinor = lines.reduce((sum, l) => sum + l.qty * l.priceMinor, 0) + extras.reduce((sum, x) => sum + x.qty * x.priceMinor, 0) + feeMinor;
  let n = 0;
  return {
    id: SAMPLE_EVENT_ORDER, status: "paid", eventId: event.id, title: event.title, start: event.start, end: event.end || "", venue: event.venue || "", address: event.address || "",
    name: name || "Sample Customer", lines, extras, feeMinor, totalMinor, taxMinor: 0, chargedMinor: totalMinor, currency, holdUntil: null,
    tickets: lines.flatMap((l) => Array.from({ length: l.qty }, () => ({ code: `SAMP-${String(++n).padStart(4, "0")}`, ticketId: l.ticketId, name: l.name }))),
    onlineUrl: event.online ? "https://example.com/watch" : "", eventCancelled: false,
  };
}

/** What the server would answer, from sample data. */
export function previewEventsAnswer(action: string, body: Record<string, any> = {}, currency = "CAD", nowMs = Date.now(), zone = shopTimeZone()): Record<string, any> {
  if (action === "eventsInfo") return { on: true, zone, currency, codes: true, events: sampleEvents(nowMs) } satisfies EventsInfo;
  // Any code takes a sample tenth off, so the owner sees how an applied code looks.
  if (action === "eventCode") {
    const event = sampleEvents(nowMs).find((e) => e.id === body.eventId);
    const list = (event?.tickets || []).reduce((sum, t) => sum + (Number(body.tickets?.[t.id]) || 0) * t.priceMinor, 0);
    const amountMinor = Math.round(list / 10);
    const feeMinor = (event?.feeMinor || 0) * (event?.tickets || []).reduce((sum, t) => sum + (t.priceMinor > 0 ? Number(body.tickets?.[t.id]) || 0 : 0), 0);
    const due = list - amountMinor + feeMinor + (event?.extras || []).reduce((sum, x) => sum + (Number(body.extras?.[x.id]) || 0) * x.priceMinor, 0);
    return { code: String(body.code || "").trim().toUpperCase(), amountMinor, feeMinor, totalMinor: due, taxMinor: 0, chargedMinor: due };
  }
  if (action === "eventStart") {
    sample = sampleOrder(nowMs, currency, body.eventId, body.tickets, body.name, body.extras);
    return { orderId: SAMPLE_EVENT_ORDER, key: SAMPLE_EVENT_KEY, paid: true };
  }
  sample ||= sampleOrder(nowMs, currency);
  return { order: sample, zone };
}
