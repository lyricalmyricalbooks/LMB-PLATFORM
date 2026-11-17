// Events and tickets (beta): the pure rules behind Admin › Events (Events.tsx): the editor's form and what it sends,
// how an event reads in the list, and the figures at the top. Times are typed and shown in the shop's own time zone.
import { zonedTime, dayOf, addDays } from "../../shared/bookingTimes";
import { salesOpen, type EventStatus } from "../../shared/eventTickets";
import type { AdminEvent, TicketOrder } from "./eventsApi";

export type TicketForm = { id: string; name: string; price: string; places: string; maxPerOrder: string };
export type EventForm = {
  id: string; title: string; description: string; day: string; time: string; endTime: string; venue: string; address: string;
  onlineUrl: string;
  /** Kept as saved: the picture is chosen with the website page (not in this form yet). */
  photo: string; status: EventStatus; chargeTax: boolean; tickets: TicketForm[];
};

/** "19:00" on the shop's clock for an ISO time. */
export function clockOf(iso: string, zone: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(new Date(ms));
}

/** "12.5" or "12,50" → 1250; "" or "free" → 0; anything else NaN. */
export function priceMinorOf(typed: string): number {
  const raw = typed.trim().replace(/^(CA|US)?\s*[$€£]\s*/i, "").replace(",", ".");
  if (!raw || /^free$/i.test(raw)) return 0;
  return /^\d+(\.\d{1,2})?$/.test(raw) ? Math.round(Number(raw) * 100) : NaN;
}
export const priceText = (minor: number): string => (minor ? (minor / 100).toFixed(2) : "");

let ticketSeq = 0;
/** A new ticket row with an id of its own (ids must stay the same once people have bought that ticket). */
export const blankTicket = (name = ""): TicketForm => ({ id: `t${Date.now().toString(36)}${(ticketSeq++).toString(36)}`, name, price: "", places: "", maxPerOrder: "10" });

/** A new event's form: two weeks from today at 7 in the evening, one General ticket. */
export function blankForm(zone: string, nowMs: number): EventForm {
  return {
    id: "", title: "", description: "", day: addDays(dayOf(nowMs, zone), 14), time: "19:00", endTime: "", venue: "", address: "", onlineUrl: "", photo: "",
    status: "draft", chargeTax: false, tickets: [blankTicket("General")],
  };
}

export function formFromEvent(event: AdminEvent, zone: string): EventForm {
  return {
    id: event.id, title: event.title, description: event.description, day: dayOf(Date.parse(event.start), zone), time: clockOf(event.start, zone),
    endTime: event.end ? clockOf(event.end, zone) : "", venue: event.venue, address: event.address, onlineUrl: event.onlineUrl, photo: event.photo || "", status: event.status,
    chargeTax: event.chargeTax,
    tickets: event.tickets.map((t) => ({ id: t.id, name: t.name, price: priceText(t.priceMinor), places: String(t.places), maxPerOrder: String(t.maxPerOrder) })),
  };
}

/** What the form sends to the server, or the first problem in plain words (the server checks everything again). */
export function eventFromForm(form: EventForm, zone: string): { event: Record<string, unknown> } | { problem: string } {
  if (!form.title.trim()) return { problem: "Give the event a name." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.day) || !/^\d{2}:\d{2}$/.test(form.time)) return { problem: "Say when the event starts." };
  const start = zonedTime(form.day, form.time, zone);
  let end = "";
  if (form.endTime) {
    if (!/^\d{2}:\d{2}$/.test(form.endTime)) return { problem: "The end time doesn't look right." };
    // An end before the start is the small hours of the next day (a launch from 21:00 to 01:00).
    const sameDay = zonedTime(form.day, form.endTime, zone);
    end = new Date(sameDay > start ? sameDay : zonedTime(addDays(form.day, 1), form.endTime, zone)).toISOString();
  }
  if (!form.tickets.length) return { problem: "Add at least one ticket." };
  const tickets = [];
  for (const t of form.tickets) {
    const name = t.name.trim();
    if (!name) return { problem: "Give each ticket a name, like General." };
    const priceMinor = priceMinorOf(t.price);
    if (!Number.isFinite(priceMinor)) return { problem: `The price of "${name}" doesn't look right. Use a number like 15 or 12.50, or leave it empty for free.` };
    const places = Number(t.places);
    if (!Number.isInteger(places) || places < 1) return { problem: `Say how many places "${name}" has.` };
    tickets.push({ id: t.id, name, priceMinor, places, maxPerOrder: Number(t.maxPerOrder) || 10 });
  }
  const link = form.onlineUrl.trim();
  if (link && !/^https:\/\/\S+$/i.test(link)) return { problem: "The online link starts with https://" };
  return {
    event: {
      ...(form.id ? { id: form.id } : {}), title: form.title, description: form.description, start: new Date(start).toISOString(), end,
      venue: form.venue, address: form.address, onlineUrl: link, photo: form.photo, status: form.status, chargeTax: form.chargeTax, tickets,
    },
  };
}

export type EventState = "draft" | "onSale" | "soldOut" | "past" | "cancelled";
/** Where an event stands, for its badge. */
export function eventState(event: AdminEvent, nowMs: number): EventState {
  if (event.status === "cancelled") return "cancelled";
  if (Date.parse(event.start) <= nowMs) return "past";
  if (event.status === "draft") return "draft";
  return event.soldTotal >= event.placesTotal ? "soldOut" : "onSale";
}
export const STATE_WORDS: Record<EventState, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  draft: { label: "Draft", tone: "neutral" },
  onSale: { label: "On sale", tone: "success" },
  soldOut: { label: "Sold out", tone: "info" },
  past: { label: "Over", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

/** Coming events soonest first; past and cancelled ones newest first. */
export function splitEvents(events: AdminEvent[], nowMs: number): { coming: AdminEvent[]; past: AdminEvent[] } {
  const isComing = (e: AdminEvent) => e.status !== "cancelled" && Date.parse(e.start) > nowMs;
  return {
    coming: events.filter(isComing).sort((a, b) => a.start.localeCompare(b.start)),
    past: events.filter((e) => !isComing(e)).sort((a, b) => b.start.localeCompare(a.start)),
  };
}

/** The tiles at the top: the next event on sale, tickets sold for coming events, and money taken in all. */
export function eventFigures(events: AdminEvent[], nowMs: number): { next: AdminEvent | null; onSale: number; sold: number; places: number; paidMinor: number } {
  const { coming } = splitEvents(events, nowMs);
  const selling = coming.filter((e) => salesOpen(e, nowMs));
  return {
    next: selling[0] || coming[0] || null, onSale: selling.length,
    sold: coming.reduce((sum, e) => sum + e.soldTotal, 0), places: coming.reduce((sum, e) => sum + e.placesTotal, 0),
    paidMinor: events.reduce((sum, e) => sum + e.paidMinor, 0),
  };
}

/** "Sat 5 Dec" and "7:00 PM" in the shop's zone, and the day number and month for the date block. */
export function whenParts(iso: string, zone: string): { weekday: string; day: string; month: string; time: string } {
  const d = new Date(Date.parse(iso));
  const part = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, ...opts }).format(d);
  return { weekday: part({ weekday: "short" }), day: part({ day: "numeric" }), month: part({ month: "short" }), time: part({ hour: "numeric", minute: "2-digit" }) };
}

export const moneyText = (minor: number, currency: string): string =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: currency || "CAD" }).format(minor / 100);

/** "12 of 40 sold" and how full that is (0 to 100). */
export function soldLine(event: Pick<AdminEvent, "soldTotal" | "placesTotal">): { text: string; percent: number } {
  const percent = event.placesTotal ? Math.min(100, Math.round((event.soldTotal / event.placesTotal) * 100)) : 0;
  return { text: `${event.soldTotal} of ${event.placesTotal} sold`, percent };
}

/** The guest list as spreadsheet rows, one per ticket, by name. Cells that could run as a formula are made plain. */
export function guestCsv(orders: TicketOrder[]): string {
  const safe = (value: string) => { const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value; return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const rows = orders.flatMap((o) => o.tickets.map((t) => [o.name, o.email, t.name, t.code, t.usedAt ? "Yes" : ""])).sort((a, b) => a[0].localeCompare(b[0]) || a[3].localeCompare(b[3]));
  return [["Name", "Email", "Ticket", "Code", "Arrived"], ...rows].map((r) => r.map(safe).join(",")).join("\n");
}

/** How many of an event's tickets have been checked in, from its guest list. */
export const arrivedCount = (orders: TicketOrder[]): number => orders.reduce((sum, o) => sum + o.tickets.filter((t) => t.usedAt).length, 0);

/** The guest list narrowed to what the door typed: part of a name, an email or a code (spaces, dashes and case don't matter). */
export function findGuests(orders: TicketOrder[], typed: string): TicketOrder[] {
  const words = typed.trim().toLowerCase();
  if (!words) return orders;
  const plain = words.replace(/[^a-z0-9]/g, "");
  return orders.filter((o) => o.name.toLowerCase().includes(words) || o.email.toLowerCase().includes(words)
    || (plain.length >= 3 && o.tickets.some((t) => t.code.toLowerCase().replace(/[^a-z0-9]/g, "").includes(plain))));
}

/** The guest list after the door's answer for one ticket: that ticket marked used, or not, with nothing read again. */
export function withTicketUsed(orders: TicketOrder[], code: string, usedAt: string): TicketOrder[] {
  return orders.map((o) => (o.tickets.some((t) => t.code === code) ? { ...o, tickets: o.tickets.map((t) => (t.code === code ? { ...t, usedAt } : t)) } : o));
}


/** The guest list after a refund: the order as the server now has it, with fully refunded orders kept last. */
export function withOrderChanged(orders: TicketOrder[], next: TicketOrder): TicketOrder[] {
  const list = orders.map((o) => (o.id === next.id ? next : o));
  return [...list.filter((o) => o.status !== "refunded"), ...list.filter((o) => o.status === "refunded")];
}

/** How many of each kind of ticket the picked codes come to (what the refund rules count with). */
export function countsOfCodes(order: Pick<TicketOrder, "tickets">, codes: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of order.tickets) if (codes.includes(t.code)) counts[t.ticketId] = (counts[t.ticketId] || 0) + 1;
  return counts;
}
