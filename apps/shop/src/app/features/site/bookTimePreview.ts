// The Book a time page inside Studio's preview: sample services, times and one sample booking, so an owner can
// design every step (and the "You're booked" page) before taking a single booking, and whether or not bookings are
// switched on. Only a real Studio preview gets these (the address says preview=true AND Studio's snapshot is on the
// window, like draft books in useSiteData); a shopper who types ?preview=true still talks to the server. Nothing is
// saved and no email is sent.
import { addDays, dayOf, weekdayOf, zonedTime } from "../../../shared/bookingTimes";
import { shopTimeZone } from "../../../shared/shopTimeZone";
import { takesDeposit, upFrontMinor, type BookingInfo, type BookingServiceView, type BookingView } from "./bookTimeRules";

export const SAMPLE_BOOKING_ID = "sample-booking";
export const SAMPLE_BOOKING_KEY = "0".repeat(48);

export const isBookingPreview = () => typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("preview") === "true" && Boolean((window as any).__studioPreviewState);

const SERVICES: BookingServiceView[] = [
  { id: "sample-visit", name: "Studio visit", description: "Sample service. Yours show here once you add them under Bookings.", minutes: 30, priceMinor: 0, payment: "free", location: "The studio", holdCard: true, lateFeeMinor: 1500 },
  { id: "sample-session", name: "One-to-one session", description: "An hour together, paid by card when booked.", minutes: 60, priceMinor: 4500, payment: "full", location: "The studio",
    questions: [{ id: "q1", label: "What would you like to work on?", long: true, required: true }, { id: "q2", label: "How did you hear about us?", long: false, required: false }] },
  { id: "sample-class", name: "Saturday workshop", description: "A group class with a set number of places.", minutes: 120, priceMinor: 6000, payment: "deposit", depositMinor: 2000, location: "The studio", places: 8 },
  { id: "sample-call", name: "Quick call", description: "Fifteen minutes by phone.", minutes: 15, priceMinor: 0, payment: "free", location: "" },
];
/** Places left at the sample class's times, so "3 left", "Last place" and a full time (0) are on show. */
const CLASS_LEFT = [8, 3, 0, 1, 6];
const TIMES = ["10:00", "11:00", "13:30", "15:00", "18:00"];

/** The sample booking as last changed in this preview (Change time and Cancel work on it). */
let sample: BookingView | null = null;

function sampleBooking(zone: string, currency: string, nowMs: number, serviceId?: string, start?: string): BookingView {
  const service = SERVICES.find((s) => s.id === serviceId) || SERVICES[1];
  const deposit = takesDeposit(service);
  const startMs = start ? Date.parse(start) : zonedTime(addDays(dayOf(nowMs, zone), 3), "11:00", zone);
  return {
    id: SAMPLE_BOOKING_ID, serviceId: service.id, serviceName: service.name, minutes: service.minutes, location: service.location,
    start: new Date(startMs).toISOString(), end: new Date(startMs + service.minutes * 60_000).toISOString(),
    status: "confirmed", payment: deposit ? "deposit" : service.priceMinor > 0 ? "card" : "free", paid: !deposit && service.priceMinor > 0, priceMinor: service.priceMinor, currency,
    ...(deposit ? { depositMinor: upFrontMinor(service), depositPaid: true, dueMinor: service.priceMinor - upFrontMinor(service), canPayRest: true, restPaidMinor: 0 } : {}),
    name: "Sample Customer", email: "customer@example.com", refunded: false, canChange: true, cancelHours: 24,
    ...(service.holdCard ? { cardHold: true, cardLast4: "4242", lateFeeMinor: service.lateFeeMinor } : {}),
  };
}

/** What the server would answer, from sample data. */
export function previewAnswer(action: string, body: Record<string, any> = {}, currency = "CAD", nowMs = Date.now(), zone = shopTimeZone()): Record<string, any> {
  const today = dayOf(nowMs, zone);
  if (action === "bookingInfo") {
    return { on: true, zone, currency, cancelHours: 24, maxDaysAhead: 60, today, services: SERVICES } satisfies BookingInfo;
  }
  if (action === "bookingTimes") {
    const from = typeof body.from === "string" ? body.from : today;
    const count = Math.min(14, Math.max(1, Number(body.days) || 7));
    const days: Record<string, string[]> = {};
    for (let i = 0; i < count; i++) {
      const day = addDays(from, i);
      // Sundays are closed and today is past, so the empty-day look is on show too.
      days[day] = weekdayOf(day) === 0 || day <= today ? [] : TIMES.map((t) => new Date(zonedTime(day, t, zone)).toISOString());
    }
    if (body.serviceId !== "sample-class") return { on: true, days, fullDays: [] };
    const left: Record<string, number> = {};
    const full: Record<string, string[]> = {};
    for (const [day, list] of Object.entries(days)) {
      list.forEach((iso, i) => { left[iso] = CLASS_LEFT[i % CLASS_LEFT.length]; });
      const gone = list.filter((iso) => left[iso] === 0);
      if (gone.length) { full[day] = gone; days[day] = list.filter((iso) => left[iso] > 0); }
    }
    return { on: true, days, fullDays: [], places: 8, left, full };
  }
  if (action === "bookingWait") return { ok: true };
  if (action === "bookingStart") {
    sample = sampleBooking(zone, currency, nowMs, body.serviceId, body.start);
    return { id: SAMPLE_BOOKING_ID, key: SAMPLE_BOOKING_KEY };
  }
  sample ||= sampleBooking(zone, currency, nowMs);
  if (action === "bookingMove" && typeof body.start === "string") sample = sampleBooking(zone, currency, nowMs, sample.serviceId, body.start);
  // Paying what is left: no card page in the preview, it just shows as paid in full.
  if (action === "bookingPayRest") sample = { ...sample, canPayRest: false, restPaidMinor: sample.dueMinor || 0, dueMinor: 0 };
  if (action === "bookingCancel") sample = { ...sample, status: "cancelled", canChange: false, refunded: sample.paid || !!sample.depositPaid };
  return { booking: sample };
}
