// The services test shop's bookings (docs/test-shop.md > Test Studio): three services and opening hours, so Bookings
// has something to show and the Book a time page answers. Written by setup step 12 only where missing, like the starter
// catalogue, in the shapes the shop's own server keeps (apps/shop/src/shared/bookingTimes.ts BookingService and
// BookingSettings). No sample appointments: a booking also takes its time in `bookingDays`, which only the shop's
// server may write, so appointments are made by booking on the test shop itself.
const HOURS = Object.freeze({ start: "10:00", end: "18:00" });

const service = (id, order, name, minutes, priceMinor, extra = {}) => ({
  path: `bookingServices/${id}`,
  data: { id, name, description: "", minutes, gapAfter: 15, priceMinor, payment: priceMinor > 0 ? "full" : "free", depositMinor: 0, depositPercent: 0, holdCard: false, lateFeeMinor: 0, location: "Test Studio, 1 Test Street", active: true, order, questions: [], places: 1, classTimes: [], ...extra },
});

/** The Test Studio's services and hours: [{ path, data }]. */
export function testStudioDocs() {
  return [
    service("test-consultation", 0, "Test Consultation", 15, 0, { description: "A free chat about what you'd like.", gapAfter: 0 }),
    service("test-cut", 1, "Test Cut and Style", 45, 6000, { description: "Wash, cut and blow-dry.", questions: [{ id: "q1", label: "Anything we should know?", long: true, required: false }] }),
    // A deposit when booking, the rest at the visit: what most salons do for a long appointment.
    service("test-colour", 2, "Test Colour", 120, 14000, { description: "Full colour with a toner.", gapAfter: 30, payment: "deposit", depositPercent: 25 }),
    {
      path: "bookingSettings/main",
      // Tuesday to Saturday, ten to six. Live, so the Book a time page answers.
      data: { live: true, hours: [[], [], [{ ...HOURS }], [{ ...HOURS }], [{ ...HOURS }], [{ ...HOURS }], [{ ...HOURS }]], daysOff: [], minNoticeHours: 2, maxDaysAhead: 60, cancelHours: 24, step: 30, reminderHours: 24, tips: true, tipPercents: [15, 18, 20] },
    },
  ];
}
