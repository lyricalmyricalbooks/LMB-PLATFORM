// What the Change your type dialog reads and asks for (shop types plan, part 3). One object, so the admin fixture
// (src/adminFixture/main.ts) can swap in sample answers; nothing here writes `firstWeek/start` (the dialog does that
// through adminApi.updateFirstWeek, which the rules check).
import { collection, getCountFromServer } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { bookingsAdmin, bookingsData, readBookingSetup, readBookingsBetween, type Booking } from "./bookingsApi";
import { billingCall } from "./platformBilling";
import { hubReady, type PlatformPlan } from "./platformPlan";
import { cardTaken } from "../../shared/bookingTimes";
import type { ShopType, TypeCounts } from "./shopTypeChange";
import type { LeadSide } from "./servicesSetup";
import { adminApi } from "./api";
import { openWorkspace } from "./themeStore";
import { currentWebsite, starterTheme, type CurrentWebsite } from "./websiteChoice";

/** The website the owner is working on (the draft's, else the live one's). */
async function workingWebsite(): Promise<{ settings: any; website: CurrentWebsite }> {
  const settings = await adminApi.getSettings();
  const ws = await openWorkspace(settings);
  return { settings, website: currentWebsite(ws.draft || settings?.design) };
}

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
  /** The website the owner is working on: a starter (`id`) can follow a new type; their own design (`id: null`) can't. */
  website: async (): Promise<CurrentWebsite> => (await workingWebsite()).website,
  /**
   * The website follows the type (part 4): the same starter and colours, its version for `kind`, put in Studio's draft
   * the way Online store's Use this does (the design before is kept for Online store's Switch back). False for the
   * owner's own design, which stays as it is.
   */
  async followWebsite(kind: ShopType, lead: LeadSide | undefined, sells: string | null): Promise<boolean> {
    const { settings, website } = await workingWebsite();
    const theme = website.id ? starterTheme(website.id, website.style) : null;
    if (!theme) return false;
    const { applyChosenLook } = await import("./chooseLook");
    await applyChosenLook(theme, settings, sells, { kind, lead, keepBefore: true });
    return true;
  },
  /** Whether the website's Book a time page is open now (Calendar's on/off switch). */
  bookingPageOpen: async (): Promise<boolean> => (await readBookingSetup()).settings.live === true,
  /** Opens or closes the Book a time page, as Calendar's switch does (bookings already made stay). */
  setBookingPage: async (live: boolean): Promise<void> => { await bookingsAdmin("setLive", { live }); },
  /** Cancels (and refunds in full) or declines one booking, emailing the client as a cancel from the calendar does. */
  async cancelOne(b: Booking): Promise<void> {
    if (b.status === "requested") await bookingsAdmin("decline", { id: b.id, reason: "We've stopped taking bookings." });
    else await bookingsAdmin("cancel", { id: b.id, refundMinor: cardTaken(b), giftBack: true, packBack: true });
  },
};
