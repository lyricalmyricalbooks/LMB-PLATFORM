// The Book a time page inside Studio's preview: sample services, times and one sample booking, so an owner can
// design every step (and the "You're booked" page) before taking a single booking, and whether or not bookings are
// switched on. Only a real Studio preview gets these (the address says preview=true AND Studio's snapshot is on the
// window, like draft books in useSiteData); a shopper who types ?preview=true still talks to the server. Nothing is
// saved and no email is sent.
import { addDays, dayOf, weekdayOf, zonedTime } from "../../../shared/bookingTimes";
import { shopTimeZone } from "../../../shared/shopTimeZone";
import { fitRun, lengthLabel, takesDeposit, upFrontMinor, withCode, type RunVisit, type BookingCode, type BookingInfo, type BookingPackView, type BookingServiceView, type BookingView, type VisitReview } from "./bookTimeRules";

export const SAMPLE_BOOKING_ID = "sample-booking";
export const SAMPLE_BOOKING_KEY = "0".repeat(48);

export const isBookingPreview = () => typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("preview") === "true" && Boolean((window as any).__studioPreviewState);

const SERVICES: BookingServiceView[] = [
  { id: "sample-visit", name: "Studio visit", description: "Sample service. Yours show here once you add them under Bookings.", minutes: 30, priceMinor: 0, payment: "free", location: "The studio", holdCard: true, lateFeeMinor: 1500, group: "Visits",
    // Offered in two lengths (plan 4, 2.2). Not on the one-to-one session: its sample person has her own length there.
    lengths: [{ id: "l1", name: "", minutes: 30, priceMinor: 0 }, { id: "l2", name: "", minutes: 45, priceMinor: 0 }] },
  { id: "sample-session", name: "One-to-one session", description: "An hour together, paid by card when booked.", minutes: 60, priceMinor: 4500, payment: "full", location: "The studio", group: "Visits",
    packVisits: 5, packPriceMinor: 18000, packDays: 365,
    extras: [{ id: "x1", name: "Longer session", minutes: 30, priceMinor: 2000 }, { id: "x2", name: "Printed notes", minutes: 0, priceMinor: 500 }],
    questions: [{ id: "q1", label: "What would you like to work on?", long: true, required: true }, { id: "q2", label: "How did you hear about us?", long: false, required: false }] },
  { id: "sample-class", name: "Saturday workshop", description: "A group class with a set number of places.", minutes: 120, priceMinor: 6000, payment: "deposit", depositMinor: 2000, location: "The studio", places: 8, group: "Classes" },
  { id: "sample-call", name: "Quick call", description: "Fifteen minutes by phone.", minutes: 15, priceMinor: 0, payment: "free", location: "", repeats: true },
  { id: "sample-review", name: "Portfolio review", description: "The shop answers each request before it's booked.", minutes: 45, priceMinor: 0, payment: "free", location: "The studio", approval: true },
];
/** Places left at the sample class's times, so "3 left", "Last place" and a full time (0) are on show. */
const CLASS_LEFT = [8, 3, 0, 1, 6];
const TIMES = ["10:00", "11:00", "13:30", "15:00", "18:00"];
/** Sample opening hours, Sunday first: weekdays 9 to 5 with a late Thursday, Saturday 10 to 4, closed Sunday. */
const SAMPLE_HOURS = [[], ...[1, 2, 3].map(() => [{ start: "09:00", end: "17:00" }]), [{ start: "09:00", end: "20:00" }], [{ start: "09:00", end: "17:00" }], [{ start: "10:00", end: "16:00" }]];

/** The sample booking as last changed in this preview (Change time and Cancel work on it). */
let sample: BookingView | null = null;
/** The sample standing appointment's visits, when the sample was booked as one (the first is the sample itself). */
let sampleRun: RunVisit[] = [];

/** A standing appointment's dates at the same shop-clock time: every one free in the preview. */
function sampleRunStarts(start: string, run: { everyWeeks: number; visits: number }, zone: string): string[] {
  const ms = Date.parse(start);
  const day = dayOf(ms, zone);
  const time = new Date(ms).toLocaleTimeString("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return Array.from({ length: run.visits }, (_, n) => new Date(zonedTime(addDays(day, n * run.everyWeeks * 7), time, zone)).toISOString());
}

/** Any code typed in the preview takes 10% off a paid service, so the code box and its summary row can be designed. */
function sampleCode(service: BookingServiceView, code: unknown): BookingCode | null {
  const typed = typeof code === "string" ? code.trim().toUpperCase().slice(0, 40) : "";
  if (!typed || service.priceMinor <= 0) return null;
  const discountMinor = Math.round(service.priceMinor / 10);
  const priceMinor = service.priceMinor - discountMinor;
  return { code: typed, discountMinor, priceMinor, payNowMinor: upFrontMinor({ ...service, priceMinor }) };
}

/** Any gift card typed in the preview pays up to 25.00 of what is paid now, so the gift card box and its row can be designed. */
function sampleGift(service: BookingServiceView, giftCard: unknown): { last4: string; giftMinor: number; payNowMinor: number } | null {
  const typed = typeof giftCard === "string" ? giftCard.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  const upFront = upFrontMinor(service);
  if (typed.length < 4 || upFront <= 0) return null;
  const giftMinor = Math.min(upFront, 2500);
  return { last4: typed.slice(-4), giftMinor, payNowMinor: upFront - giftMinor };
}

function sampleBooking(zone: string, currency: string, nowMs: number, serviceId?: string, start?: string, code?: unknown, giftCard?: unknown): BookingView {
  const listed = SERVICES.find((s) => s.id === serviceId) || SERVICES[1];
  const applied = sampleCode(listed, code);
  const service = withCode(listed, applied);
  const deposit = takesDeposit(service);
  const gift = sampleGift(service, giftCard);
  const startMs = start ? Date.parse(start) : zonedTime(addDays(dayOf(nowMs, zone), 3), "11:00", zone);
  return {
    id: SAMPLE_BOOKING_ID, serviceId: service.id, serviceName: service.name, minutes: service.minutes, location: service.location,
    start: new Date(startMs).toISOString(), end: new Date(startMs + service.minutes * 60_000).toISOString(),
    status: "confirmed", payment: deposit ? "deposit" : service.priceMinor > 0 ? "card" : "free", paid: !deposit && service.priceMinor > 0, priceMinor: service.priceMinor, currency,
    ...(deposit ? { depositMinor: upFrontMinor(service), depositPaid: true, dueMinor: service.priceMinor - upFrontMinor(service), canPayRest: true, restPaidMinor: 0, tipPercents: [15, 18, 20], tipLimitMinor: 10_000 } : {}),
    name: "Sample Customer", email: "customer@example.com", refunded: false, canChange: true, cancelHours: 24, canEarlier: (listed.places || 1) <= 1 && !listed.courseStarts?.length, earlier: false,
    form: { title: "Before your first visit", text: "Please tell us about anything that could affect your visit, like allergies or a recent treatment.", questions: [{ id: "allergies", label: "Any allergies?", long: false, required: false }] },
    // The review box shows on the sample so it can be designed (a real one shows only after the visit).
    canReview: true,
    ...(service.holdCard ? { cardHold: true, cardLast4: "4242", lateFeeMinor: service.lateFeeMinor } : {}),
    ...(applied ? { discountCode: applied.code, discountMinor: applied.discountMinor } : {}),
    ...(gift ? { giftCardLast4: gift.last4, giftMinor: gift.giftMinor } : {}),
  };
}

/** Sample client reviews for the Client reviews section in Studio's preview. */
const SAMPLE_REVIEWS: VisitReview[] = [
  { authorName: "Maya L.", rating: 5, body: "Sample review. Approved reviews from your clients show here.", serviceName: "One-to-one session", date: "2026-11-10" },
  { authorName: "Tom O.", rating: 5, body: "Friendly, on time and really helpful. I've already booked my next visit.", serviceName: "Studio visit", date: "2026-11-02" },
  { authorName: "Priya S.", rating: 4, body: "A lovely afternoon and I learned a lot in a small group.", serviceName: "Saturday workshop", date: "2026-10-26", reply: "Thank you, Priya. See you at the next one!" },
];

export const SAMPLE_PACK_CODE = "SAMP-LEPA-CK42";

/** The sample pack's own page: two of five visits used, one coming up, a year to book the rest. */
function samplePack(nowMs: number, zone: string, currency: string): BookingPackView {
  const day = dayOf(nowMs, zone);
  return { last4: "CK42", serviceId: "sample-session", serviceName: "One-to-one session", visits: 5, left: 3, status: "active", expiresOn: addDays(day, 300),
    priceMinor: 18000, currency, coming: [new Date(zonedTime(addDays(day, 4), "11:00", zone)).toISOString()] };
}

/** What the server would answer, from sample data. */
export function previewAnswer(action: string, body: Record<string, any> = {}, currency = "CAD", nowMs = Date.now(), zone = shopTimeZone()): Record<string, any> {
  const today = dayOf(nowMs, zone);
  if (action === "bookingInfo") {
    return { on: true, zone, currency, cancelHours: 24, maxDaysAhead: 60, today, services: SERVICES, codes: true, giftCards: true, texts: true, hours: SAMPLE_HOURS, reviews: SAMPLE_REVIEWS, staff: [{ id: "ana", name: "Ana", bio: "Ten years at the bench. Ask her about paper.", serviceIds: [], rates: [{ serviceId: "sample-session", minutes: 75, priceMinor: 6000 }] }, { id: "ben", name: "Ben", bio: "Runs the Saturday classes.", serviceIds: ["sample-session", "sample-class"] }] } satisfies BookingInfo;
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
  if (action === "bookingCode") {
    const applied = sampleCode(SERVICES.find((s) => s.id === body.serviceId) || SERVICES[1], body.code);
    if (!applied) throw Object.assign(new Error(), { code: "code" });
    return applied;
  }
  if (action === "bookingGiftCard") {
    const listed = SERVICES.find((s) => s.id === body.serviceId) || SERVICES[1];
    const gift = sampleGift(withCode(listed, sampleCode(listed, body.code)), body.giftCard);
    if (!gift) throw Object.assign(new Error(), { code: "gift" });
    return gift;
  }
  // Packs of visits: buying one opens the sample pack (no card page), and any code of twelve letters and numbers books with it.
  if (action === "bookingPackBuy") return { code: SAMPLE_PACK_CODE };
  if (action === "bookingPackView") return { pack: samplePack(nowMs, zone, currency) };
  if (action === "bookingPack") {
    const typed = typeof body.pack === "string" ? body.pack.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    const service = SERVICES.find((s) => s.id === body.serviceId);
    if (typed.length !== 12 || !service?.packVisits) throw Object.assign(new Error(), { code: "pack" });
    return { last4: typed.slice(-4), left: 3, visits: service.packVisits, expiresOn: addDays(today, 300) };
  }
  if (action === "bookingRunCheck") {
    const run = fitRun({ everyWeeks: Math.max(1, Number(body.run?.everyWeeks) || 1), visits: Math.max(2, Number(body.run?.visits) || 2) });
    return { visits: sampleRunStarts(String(body.start), run, zone).map((start) => ({ start, free: true })) };
  }
  if (action === "bookingStart") {
    sample = sampleBooking(zone, currency, nowMs, body.serviceId, body.start, body.code, body.giftCard);
    sampleRun = [];
    // Ask me first (plan 4, 2.5): the sample becomes a request the shop has two days to answer.
    if (SERVICES.find((x) => x.id === body.serviceId)?.approval && !body.run) {
      sample = { ...sample, status: "requested", answerBy: new Date(nowMs + 48 * 3600_000).toISOString(), canWithdraw: true, canChange: false, canEarlier: false, canReview: false };
    }
    if (body.run && typeof body.start === "string") {
      const run = fitRun({ everyWeeks: Math.max(1, Number(body.run.everyWeeks) || 1), visits: Math.max(2, Number(body.run.visits) || 2) });
      sample = { ...sample, run: { visit: 1, visits: run.visits, everyWeeks: run.everyWeeks } };
      sampleRun = sampleRunStarts(body.start, run, zone).map((start, n) => ({ id: n ? `${SAMPLE_BOOKING_ID}-${n + 1}` : SAMPLE_BOOKING_ID, start, status: "confirmed" as const, ...(n ? {} : { current: true }) }));
    }
    // A length chosen of a service offered in several: its minutes and price, named in the service.
    const sized = (SERVICES.find((x) => x.id === body.serviceId)?.lengths || []).find((l) => l.id === body.length);
    if (sized) {
      sample = { ...sample, serviceName: `${sample.serviceName}, ${lengthLabel(sized)}`, lengthId: sized.id, minutes: sized.minutes, priceMinor: sized.priceMinor,
        end: new Date(Date.parse(sample.start) + sized.minutes * 60_000).toISOString() };
    }
    const ticked = (SERVICES.find((x) => x.id === body.serviceId)?.extras || []).filter((x) => Array.isArray(body.extras) && body.extras.includes(x.id));
    if (ticked.length) {
      const minutes = sample.minutes + ticked.reduce((n, x) => n + x.minutes, 0);
      sample = { ...sample, extras: ticked, minutes, priceMinor: sample.priceMinor + ticked.reduce((n, x) => n + x.priceMinor, 0),
        end: new Date(Date.parse(sample.start) + minutes * 60_000).toISOString() };
    }
    // Several services in one visit: each added one straight after, the visit's length and price their sum.
    const added = (Array.isArray(body.also) ? body.also : []).flatMap((a: any) => {
      const sv = SERVICES.find((x) => x.id === a?.serviceId);
      return sv ? [sv] : [];
    });
    if (added.length) {
      let at = sample.end;
      const visit = [{ serviceName: sample.serviceName, staffName: "", start: sample.start, end: sample.end }, ...added.map((sv: BookingServiceView) => {
        const start = at;
        at = new Date(Date.parse(start) + sv.minutes * 60_000).toISOString();
        return { serviceName: sv.name, staffName: "", start, end: at };
      })];
      sample = { ...sample, visit, end: at, minutes: sample.minutes + added.reduce((n: number, sv: BookingServiceView) => n + sv.minutes, 0),
        priceMinor: sample.priceMinor + added.reduce((n: number, sv: BookingServiceView) => n + sv.priceMinor, 0),
        serviceName: visit.map((p) => p.serviceName).join(" + ") };
    }
    if (typeof body.pack === "string" && body.pack) {
      sample = { ...sample, payment: "pack", paid: true, priceMinor: 0, packLast4: body.pack.replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase(), packVisit: 3, packVisits: 5,
        depositMinor: undefined, depositPaid: undefined, dueMinor: undefined, canPayRest: undefined, discountCode: undefined, discountMinor: undefined, giftCardLast4: undefined, giftMinor: undefined };
    }
    return { id: SAMPLE_BOOKING_ID, key: SAMPLE_BOOKING_KEY };
  }
  // An earlier time held for the sample booking: two days sooner, held half an hour.
  if (action === "bookingEarlierView" || action === "bookingEarlierTake") {
    const was = sample || sampleBooking(zone, currency, nowMs);
    const offerStart = new Date(Date.parse(was.start) - 86_400_000).toISOString();
    if (action === "bookingEarlierTake") {
      sample = { ...sampleBooking(zone, currency, nowMs, was.serviceId, offerStart), earlier: false };
      return { offer: { serviceName: was.serviceName, staffName: was.staffName || "", minutes: was.minutes, start: offerStart, taken: true } };
    }
    return { offer: { serviceName: was.serviceName, staffName: was.staffName || "", minutes: was.minutes, start: was.start, offerStart, offerUntil: new Date(nowMs + 30 * 60_000).toISOString() } };
  }
  sample ||= sampleBooking(zone, currency, nowMs);
  if (action === "bookingEarlier") sample = { ...sample, earlier: body.on === true };
  if (action === "bookingForm") sample = { ...sample, form: undefined, formSigned: new Date(nowMs).toISOString() };
  if (action === "bookingMove" && typeof body.start === "string") sample = { ...sampleBooking(zone, currency, nowMs, sample.serviceId, body.start, sample.discountCode), giftCardLast4: sample.giftCardLast4, giftMinor: sample.giftMinor };
  // Paying what is left: no card page in the preview, it just shows as paid in full.
  if (action === "bookingPayRest") sample = { ...sample, canPayRest: false, restPaidMinor: sample.dueMinor || 0, dueMinor: 0, tipMinor: Number(body.tipMinor) || 0 };
  if (action === "bookingReview") sample = { ...sample, canReview: false, reviewed: true };
  if (action === "bookingCancel") {
    sample = { ...sample, status: "cancelled", canChange: false, refunded: sample.paid || !!sample.depositPaid };
    sampleRun = sampleRun.map((v) => (v.current || body.andLater === true ? { ...v, status: "cancelled" } : v));
  }
  return { booking: sample, ...(sampleRun.length ? { runVisits: sampleRun } : {}) };
}
