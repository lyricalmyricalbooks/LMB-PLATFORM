// Events page (features/site/EventsPage.tsx): the shapes the server answers (functions/events.js `publicEvent`,
// `publicOrder`) and the page's own small sums. Pure, tested in eventsRules.test.ts. The server decides every price,
// every place left and every total; these only show them and keep the pickers inside what it said.

export type EventTicketView = { id: string; name: string; priceMinor: number; maxPerOrder: number; left: number; soldOut: boolean; taxMinor?: number };
export type EventView = {
  id: string; title: string; description?: string; start: string; end?: string; venue?: string; address?: string; photo?: string;
  online: boolean; open: boolean; cancelled: boolean; tickets: EventTicketView[];
};
export type EventsInfo = { on: boolean; zone?: string; currency?: string; codes?: boolean; events?: EventView[] };
/** A discount code the server accepted for the tickets picked: what comes off and what is left to pay. */
export type TicketCode = { code: string; amountMinor: number; totalMinor: number; taxMinor: number; chargedMinor: number };
export type EventOrderView = {
  id: string; status: "held" | "paid" | "cancelled" | "refunded"; refundedMinor?: number; eventId: string; title: string; start: string; end: string; venue: string; address: string; name: string;
  lines: { ticketId: string; name: string; qty: number; priceMinor: number }[];
  totalMinor: number; taxMinor: number; chargedMinor: number; currency: string; holdUntil: string | null; discount?: { code: string; amountMinor: number } | null;
  tickets: { code: string; ticketId: string; name: string; used?: boolean }[]; onlineUrl: string; eventCancelled: boolean;
};

/** The buyer's own link (`/events?order=<id>&key=<key>`), or null when it is missing or misshapen. */
export function orderFromSearch(search: string): { id: string; key: string } | null {
  const q = new URLSearchParams(search);
  const id = q.get("order") || "";
  const key = q.get("key") || "";
  return /^[A-Za-z0-9_-]{6,40}$/.test(id) && /^[a-f0-9]{48}$/.test(key) ? { id, key } : null;
}

/** The event a link opens (`/events?event=<id>`), "" when none. */
export function eventFromSearch(search: string): string {
  const id = new URLSearchParams(search).get("event") || "";
  return /^[A-Za-z0-9_-]{6,40}$/.test(id) ? id : "";
}

/** The date block on an event card: short month, day number, short weekday, in the shop's zone. */
export function eventDayParts(startIso: string, zone: string, locale?: string): { month: string; day: string; weekday: string } {
  const d = new Date(startIso);
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(locale, { timeZone: zone, ...o });
  return { month: f({ month: "short" }), day: f({ day: "numeric" }), weekday: f({ weekday: "short" }) };
}

const dayKey = (iso: string, zone: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: zone });

/** "Saturday 5 December, 7:00 p.m. – 10:00 p.m."; no end shows the start alone; an end on another day shows both days. */
export function eventWhenText(startIso: string, endIso: string | undefined, zone: string, locale?: string): string {
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { timeZone: zone, weekday: "long", day: "numeric", month: "long" });
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { timeZone: zone, hour: "numeric", minute: "2-digit" });
  const first = `${day(startIso)}, ${time(startIso)}`;
  if (!endIso || !(Date.parse(endIso) > Date.parse(startIso))) return first;
  return dayKey(startIso, zone) === dayKey(endIso, zone) ? `${first} – ${time(endIso)}` : `${first} – ${day(endIso)}, ${time(endIso)}`;
}

/** The cheapest ticket still to be had (any ticket when all are gone), for "From $15". Null when the event has none. */
export function lowestPrice(event: Pick<EventView, "tickets">): number | null {
  const pool = event.tickets.some((t) => !t.soldOut) ? event.tickets.filter((t) => !t.soldOut) : event.tickets;
  return pool.length ? Math.min(...pool.map((t) => t.priceMinor)) : null;
}

/** What the card says about an event's tickets. */
export type EventState = "cancelled" | "closed" | "soldOut" | "open";
export function eventState(event: EventView): EventState {
  if (event.cancelled) return "cancelled";
  if (!event.open) return "closed";
  return event.tickets.every((t) => t.soldOut) ? "soldOut" : "open";
}

/** How many of one ticket the picker may hold: never under 0, never over what the server said is left for one order. */
export const clampQty = (ticket: Pick<EventTicketView, "left" | "soldOut">, qty: number) =>
  ticket.soldOut ? 0 : Math.max(0, Math.min(Math.round(Number(qty)) || 0, Math.max(0, ticket.left)));

/** The picks as the server wants them (ticket id → how many, only the ones above zero), with the page's own sums. */
export function cartOf(event: Pick<EventView, "tickets">, picks: Record<string, number>): { tickets: Record<string, number>; count: number; totalMinor: number; taxed: boolean } {
  const tickets: Record<string, number> = {};
  let count = 0;
  let totalMinor = 0;
  let taxed = false;
  for (const t of event.tickets) {
    const qty = clampQty(t, picks[t.id] || 0);
    if (!qty) continue;
    tickets[t.id] = qty;
    count += qty;
    totalMinor += qty * t.priceMinor;
    if (t.taxMinor) taxed = true;
  }
  return { tickets, count, totalMinor, taxed };
}

/** A ticket code in groups, easier to read out at the door ("TICK-2222" stays as it is). */
export const codeText = (code: string) => (code.includes("-") ? code : code.replace(/(.{4})(?=.)/g, "$1 "));
