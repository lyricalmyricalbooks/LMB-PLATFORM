// The services test shop's bookings (docs/test-shop.md > Test Studio): three services, opening hours and sample clients, so Bookings
// has something to show and the Book a time page answers. Written by setup step 12 only where missing, like the starter
// catalogue, in the shapes the shop's own server keeps (apps/shop/src/shared/bookingTimes.ts BookingService and
// BookingSettings). No sample appointments: a booking also takes its time in `bookingDays`, which only the shop's
// server may write, so appointments are made by booking on the test shop itself.
// Five sample clients, as a salon brings its client list over from an old system: customer notes (the shop's
// `customerNotes/{sha256 of the lowercased email}`, apps/shop/firestore.rules) marked as brought over, so Clients lists
// them before they book. Made-up example.com people only. Two sample people and one chair (Services plan phase 4), so the Team day view and
// the With picker have something to show; no emails, so nobody is sent a morning list.
import { createHash } from "node:crypto";

/** The mark Clients looks for (apps/shop/src/app/admin/customerInsights.ts MOVED_MARK). */
export const MOVED_MARK = "Brought over from your old shop";

const client = (name, email, place, note, tags) => ({
  path: `customerNotes/${createHash("sha256").update(email.toLowerCase()).digest("hex")}`,
  data: { email, name, place, note: `${MOVED_MARK}. ${note}`, tags, updatedAt: "2026-11-16T12:00:00.000Z" },
});

/** The Test Studio's sample clients: [{ path, data }]. */
export function testStudioClients() {
  return [
    client("Ada Example", "ada.client@example.com", "Toronto, ON", "Prefers mornings. Colour every eight weeks.", ["regular"]),
    client("Ben Example", "ben.client@example.com", "Toronto, ON", "Short back and sides.", []),
    client("Cleo Example", "cleo.client@example.com", "Mississauga, ON", "Sensitive scalp: patch test first.", ["patch test"]),
    client("Dev Example", "dev.client@example.com", "Toronto, ON", "Books for two (with Ada).", ["regular"]),
    client("Eve Example", "eve.client@example.com", "Hamilton, ON", "", []),
  ];
}

const HOURS = Object.freeze({ start: "10:00", end: "18:00" });
const LATE = Object.freeze({ start: "12:00", end: "20:00" });
const SHOP_WEEK = () => [[], [], [{ ...HOURS }], [{ ...HOURS }], [{ ...HOURS }], [{ ...HOURS }], [{ ...HOURS }]];

/** Sam does everything in the shop's hours; Riya does colour and cuts, later in the day, Wednesday to Saturday. */
const TEST_STUDIO_STAFF = [
  { id: "sam", name: "Sam Example", active: true, serviceIds: [], ownHours: false, hours: SHOP_WEEK(), daysOff: [], email: "" },
  { id: "riya", name: "Riya Example", active: true, serviceIds: ["test-cut", "test-colour"], ownHours: true, hours: [[], [], [], [{ ...LATE }], [{ ...LATE }], [{ ...LATE }], [{ ...LATE }]], daysOff: [], email: "" },
];

const service = (id, order, name, minutes, priceMinor, extra = {}) => ({
  path: `bookingServices/${id}`,
  data: { id, name, description: "", minutes, gapAfter: 15, priceMinor, payment: priceMinor > 0 ? "full" : "free", depositMinor: 0, depositPercent: 0, holdCard: false, lateFeeMinor: 0, meet: false, packVisits: 0, packPriceMinor: 0, packDays: 0, location: "Test Studio, 1 Test Street", active: true, order, questions: [], places: 1, classTimes: [], roomId: "", ...extra },
});

/** The Test Studio's services, hours and sample clients: [{ path, data }]. */
export function testStudioDocs() {
  return [
    service("test-consultation", 0, "Test Consultation", 15, 0, { description: "A free chat about what you'd like.", gapAfter: 0 }),
    // Sells a pack of five, so a test purchase of a pack and a visit booked with it can be tried.
    service("test-cut", 1, "Test Cut and Style", 45, 6000, { description: "Wash, cut and blow-dry.", packVisits: 5, packPriceMinor: 27000, packDays: 365, questions: [{ id: "q1", label: "Anything we should know?", long: true, required: false }] }),
    // A deposit when booking, the rest at the visit: what most salons do for a long appointment.
    service("test-colour", 2, "Test Colour", 120, 14000, { description: "Full colour with a toner.", gapAfter: 30, payment: "deposit", depositPercent: 25, roomId: "colour-chair" }),
    ...testStudioClients(),
    {
      path: "bookingSettings/main",
      // Tuesday to Saturday, ten to six. Live, so the Book a time page answers.
      data: { live: true, hours: SHOP_WEEK(), daysOff: [], minNoticeHours: 2, maxDaysAhead: 60, cancelHours: 24, step: 30, reminderHours: 24, secondReminderHours: 0, dailySummary: false, googleCalendar: false, waitHoldMinutes: 60, tips: true, tipPercents: [15, 18, 20], pickupTimes: false, pickupSlotMinutes: 30, pickupPerSlot: 4, pickupReadyHours: 2, staff: TEST_STUDIO_STAFF, rooms: [{ id: "colour-chair", name: "Colour chair" }] },
    },
  ];
}
