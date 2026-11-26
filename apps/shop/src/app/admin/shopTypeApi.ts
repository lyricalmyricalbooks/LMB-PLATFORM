// What the Change your type dialog reads and asks for (shop types plan, part 3). One object, so the admin fixture
// (src/adminFixture/main.ts) can swap in sample answers; nothing here writes `firstWeek/start` (the dialog does that
// through adminApi.updateFirstWeek, which the rules check).
import { collection, getCountFromServer } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { bookingsAdmin, bookingsData, readBookingsBetween, type Booking } from "./bookingsApi";
import { billingCall } from "./platformBilling";
import { hubReady, type PlatformPlan } from "./platformPlan";
import { cardTaken } from "../../shared/bookingTimes";
import type { TypeCounts } from "./shopTypeChange";

const YEAR = 365 * 86_400_000;
const count = (q: Parameters<typeof getCountFromServer>[0]) => getCountFromServer(q).then((s) => s.data().count).catch(() => null);

/** Bookings still to come that someone is waiting on: confirmed, or asked for and not answered yet. */
export const stillComing = (rows: Booking[]) => rows.filter((b) => b.status === "confirmed" || b.status === "requested");

export const shopTypeData = {
  /** What the shop has, each count on its own (null where it can't be read). */
  async counts(): Promise<TypeCounts> {
    const [products, orders, services, clients, upcoming] = await Promise.all([
      count(collection(db, "books")),
      count(collection(db, "orders")),
      count(collection(db, "bookingServices")),
      count(collection(db, "customerNotes")),
      shopTypeData.upcoming().then((rows) => rows.length).catch(() => null),
    ]);
    return { products, orders, services, clients, upcoming };
  },
  /** Upcoming bookings (a year ahead), earliest first. */
  upcoming: async (): Promise<Booking[]> => stillComing(await readBookingsBetween(new Date().toISOString(), new Date(Date.now() + YEAR).toISOString())),
  /** Whether Bookings is on for the shop now (platform/features, written only by the platform). */
  bookingsOn: (): Promise<boolean> => new Promise((resolve) => {
    let stop: (() => void) | null = null;
    stop = bookingsData.watchOn((on) => { resolve(on); queueMicrotask(() => stop?.()); });
  }),
  /** Asks the platform to turn Bookings on for this shop (a product shop taking bookings). */
  async openBookings(plan: PlatformPlan | null): Promise<void> {
    if (!hubReady(plan)) throw new Error("Your shop can't reach Colophon right now. Try again in a minute.");
    await billingCall(plan, "open-bookings");
  },
  /** Cancels (and refunds in full) or declines one booking, emailing the client as a cancel from the calendar does. */
  async cancelOne(b: Booking): Promise<void> {
    if (b.status === "requested") await bookingsAdmin("decline", { id: b.id, reason: "We've stopped taking bookings." });
    else await bookingsAdmin("cancel", { id: b.id, refundMinor: cardTaken(b), giftBack: true, packBack: true });
  },
};
