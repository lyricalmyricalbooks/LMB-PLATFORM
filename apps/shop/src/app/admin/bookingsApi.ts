// Bookings (beta): what the admin reads and the changes it asks the server for (functions/bookings.js). The admin reads
// services, hours and bookings straight from the shop's folder (firestore.rules: admin read, no browser write); every
// change goes through the server's bookingsAdmin action, which checks the time is still free.
import { useWaysOn } from "./waysApi";
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { cleanBookingSettings, cleanService, type BookingExtra, type BookingService, type BookingSettings, type SavedCard, type VisitPart } from "../../shared/bookingTimes";

/** "requested": waiting for the owner to accept or decline (plan 4, 2.5). */
export type BookingStatus = "held" | "requested" | "confirmed" | "cancelled";
export type Booking = {
  id: string; serviceId: string; serviceName: string; minutes: number; location?: string; meetUrl?: string; start: string; end: string;
  customer: { name: string; email: string; phone?: string }; note?: string; answers?: { label: string; answer: string }[]; status: BookingStatus;
  payment: "free" | "card" | "deposit" | "atShop" | "pack"; priceMinor: number; /** With payment "deposit": the part taken by card when booked. */ depositMinor?: number; depositPaid?: boolean; currency: string; paid: boolean; noShow?: boolean; clearing?: boolean;
  /** The code the client shows at the desk, and when the shop checked them in (op checkIn). */ checkInCode?: string; checkedInAt?: string | null;
  /** A course: every date this one sign-up holds a place on (the first is `start`), and their shop days. */
  course?: { starts: string[]; days: string[]; /** Who takes each date, when it isn't the same person throughout. */ staff?: string[] };
  refund?: { amountMinor: number; at: string } | null; source?: "website" | "admin" | "desk"; cancelledBy?: string;
  /** Which ready link a website booking came through (plan 4, 2.7); `walkIn` for one made at the desk. */ cameFrom?: string; walkIn?: boolean;
  /** A request (plan 4, 2.5): when it is let go unless answered; `declined` once the owner said no or ran out of time. */
  answerBy?: string | null; declined?: boolean;
  /** Card on file: the most the owner may charge after a missed booking, the saved card, and the fee once charged. */
  cardHold?: boolean; lateFeeMinor?: number; card?: SavedCard | null; fee?: { amountMinor: number; at: string; reason?: string } | null;
  /** What was left, paid later by card from the client's booking page; `restOpen` while a page to pay it is open. */
  rest?: { amountMinor: number; at: string; reader?: boolean } | null; restOpen?: boolean;
  /** A payment sent to the shop's card reader and not finished yet; `readerError` what the reader said last time. */
  readerOpen?: boolean; readerError?: string; readerCharge?: { readerId: string; amountMinor: number; at: string } | null;
  /** A discount code the customer typed: what it took off (`priceMinor` is already after it; `listPriceMinor` before). */
  discount?: { id: string; code: string; amountMinor: number; returned?: boolean } | null; listPriceMinor?: number;
  /** A gift card that paid part or all of what was paid when booked (`returned` once put back on the card). */
  giftCard?: { id: string; last4: string; amountMinor: number; returned?: boolean } | null;
  /** A pack of visits that paid for it: which visit of the pack it is (`returned` once the visit went back on the pack). */
  pack?: { id: string; last4: string; visit?: number; visits?: number; returned?: boolean } | null;
  /** Sales tax (a service that charges it): the part of `priceMinor` that is tax, by its name in the books. */
  taxMinor?: number; taxLines?: { name: string; cents: number }[];
  /** A tip the client added by card (never part of the price or a refund). */
  tip?: { amountMinor: number; at: string } | null;
  /** Who takes it (when the shop lists people) and the room it uses, named as they were when booked or moved. */
  staffId?: string; staffName?: string; roomId?: string; roomName?: string;
  history?: { at: string; what: string; by: string }[]; createdAt?: string;
  /** A standing appointment: which visit of the run this is, how many there are and how often (each is its own booking). */
  /** Add-ons and options the client ticked (each already in `minutes` and `priceMinor`). */
  extras?: BookingExtra[] | null;
  /** Processing time kept from the service when booked (plan 4, 1.5): minutes in, and how long. */
  processAfter?: number; processMinutes?: number;
  /** Set-up or travel time kept free before it (plan 4, 1.6), kept from the service when booked. */
  gapBefore?: number;
  series?: { id: string; visit: number; visits: number; everyWeeks: number } | null;
  /** The client asked to hear if an earlier time opens (Services plan 2, B5). */
  earlierWanted?: boolean;
  /** Several services in one visit (plan 4, 2.1): the services after the first, back to back, each with its person. */
  parts?: VisitPart[] | null; leadPriceMinor?: number;
  /** On the calendar only: one service of a visit drawn as its own card (`partIndex` 0 is the first), and the whole visit. */
  partIndex?: number; whole?: Booking;
};

/**
 * The reads and the server call behind the page, as one object so the admin fixture (src/adminFixture/main.ts) can swap
 * in sample bookings; the exports below hand on to it.
 */
export const bookingsData = {
  /** Follows platform/features (written only by the platform): whether Bookings is on for this shop. */
  watchOn(onChange: (on: boolean) => void): () => void {
    return onSnapshot(doc(db, "platform", "features"), (snap) => onChange(snap.exists() && snap.data()?.bookings === true), () => onChange(false));
  },
  readSetup: readSetupFromShop,
  follow: followFromShop,
  followCourse: followCourseFromShop,
  followRequests: followRequestsFromShop,
  range: rangeFromShop,
  admin: adminFromServer as (op: AdminOp, body: Record<string, unknown>) => Promise<unknown>,
};

/**
 * Whether the booking engine is on for this shop: the platform turned Bookings on, or Classes (a way to sell, which
 * runs on the same engine) is allowed by the platform and switched on by the owner. The server's `engineOn`
 * (functions/bookings.js) reads the same switches.
 */
export function useBookingsOn(enabled: boolean): boolean {
  const [on, setOn] = useState(false);
  const classesOn = useWaysOn(enabled).includes("classes");
  useEffect(() => {
    if (!enabled) return;
    return bookingsData.watchOn(setOn);
  }, [enabled]);
  return on || classesOn;
}

export const readBookingSetup = () => bookingsData.readSetup();

/** Bookings starting from `fromIso` up to `toIso`, earliest first, followed live. */
export const followBookings = (fromIso: string, toIso: string, onRows: (rows: Booking[]) => void, onError: (e: Error) => void) =>
  bookingsData.follow(fromIso, toIso, onRows, onError);

export const bookingsAdmin = <T = { ok?: boolean }>(op: AdminOp, body: Record<string, unknown> = {}) => bookingsData.admin(op, body) as Promise<T>;

async function readSetupFromShop(): Promise<{ services: BookingService[]; settings: BookingSettings; saved: boolean }> {
  const [servicesSnap, settingsSnap] = await Promise.all([getDocs(query(collection(db, "bookingServices"), limit(30))), getDoc(doc(db, "bookingSettings", "main"))]);
  const services = servicesSnap.docs
    .map((d) => cleanService(d.data(), d.id))
    .filter((s): s is BookingService => !("problem" in s))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return { services, settings: cleanBookingSettings(settingsSnap.exists() ? settingsSnap.data() : null), saved: settingsSnap.exists() };
}

function followFromShop(fromIso: string, toIso: string, onRows: (rows: Booking[]) => void, onError: (e: Error) => void): () => void {
  const q = query(collection(db, "bookings"), where("start", ">=", fromIso), where("start", "<", toIso), orderBy("start"), limit(500));
  return onSnapshot(q, (snap) => onRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))), onError);
}

/**
 * Everyone signed up for a course with a date on one of `days` (shop days, at most 30): a course is one booking that
 * starts on its first date, so the week's own query misses it in the later weeks.
 */
function followCourseFromShop(days: string[], onRows: (rows: Booking[]) => void, onError: (e: Error) => void): () => void {
  if (!days.length) { onRows([]); return () => {}; }
  const q = query(collection(db, "bookings"), where("course.days", "array-contains-any", days.slice(0, 30)), limit(500));
  return onSnapshot(q, (snap) => onRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))), onError);
}
/** Requests waiting for the owner's answer (plan 4, 2.5), whatever week they are in. */
function followRequestsFromShop(onRows: (rows: Booking[]) => void, onError: (e: Error) => void): () => void {
  const q = query(collection(db, "bookings"), where("status", "==", "requested"), limit(100));
  return onSnapshot(q, (snap) => onRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))), onError);
}
export const followRequests = (onRows: (rows: Booking[]) => void, onError: (e: Error) => void) => bookingsData.followRequests(onRows, onError);
/** Followed live, like the week's own bookings, so a sign-up or a cancellation shows in every week the course runs. */
export const followCourseRows = (days: string[], onRows: (rows: Booking[]) => void, onError: (e: Error) => void) =>
  bookingsData.followCourse(days, onRows, onError);

/** Every booking starting from `fromIso` up to `toIso`, read once (the Figures tab). */
async function rangeFromShop(fromIso: string, toIso: string): Promise<Booking[]> {
  const snap = await getDocs(query(collection(db, "bookings"), where("start", ">=", fromIso), where("start", "<", toIso), orderBy("start"), limit(5000)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }));
}
export const readBookingsBetween = (fromIso: string, toIso: string) => bookingsData.range(fromIso, toIso);

export type AdminOp = "hint" | "saveService" | "deleteService" | "saveSettings" | "setLive" | "addBlock" | "removeBlock" | "times" | "create" | "cancel" | "accept" | "decline" | "move" | "noShow" | "paidAtShop" | "chargeFee" | "payLink" | "calendarFeed" | "waitlist" | "removeWaiting" | "packs" | "packClose" | "walkIn" | "readers" | "readerAdd" | "readerRemove" | "readerCharge" | "readerCheck" | "readerCancel" | "readerTest" | "checkIn" | "textStatus" | "runCheck" | "clientForm" | "teamCalendar";

/** A card reader that connects over the internet (Take a payment). */
export type CardReader = { id: string; label: string; online: boolean | null; device?: string };
/**
 * What the shop's card readers answer: none without card payments; `testMode` offers a test card. A Square shop
 * `pairsWithCode`: Add a reader gives a code to type on the Terminal (op `readerAdd` answers `pairing`).
 */
export type CardReaders = { available: boolean; testMode?: boolean; pairsWithCode?: boolean; readers: CardReader[] };
export type ReaderPairing = { code: string; pairBy: string | null };
/** A payment on a card reader: still on the reader, paid, or not (with the reader's words). */
export type ReaderState = { state: "waiting" | "paid" | "idle"; error: string; dueMinor: number };

/** Someone who asked to hear when a full class time (start) or a booked-up day (no start) has room again. */
export type Waiting = { id: string; serviceId: string; serviceName: string; day: string; start: string | null; name: string; email: string; createdAt: string;
  /** A freed place held for them until then (the waiting list offers it first come, first served), else null. */
  heldUntil?: string | null;
  /** The start of the place held for them (a booked-up day's waiter is held the first free time). */
  heldStart?: string | null };

async function adminFromServer(op: AdminOp, body: Record<string, unknown> = {}): Promise<unknown> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be signed in as admin.");
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify({ action: "bookingsAdmin", op, ...body }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || "Bookings couldn't be saved just now. Please try again."), { code: result.code, answer: result });
  return result;
}

/** The person at the desk, as the till shows them after a check-in (op checkIn). */
export type Arrival = {
  id: string; name: string; serviceName: string; start: string; end: string; minutes: number; status: BookingStatus;
  dueMinor: number; currency: string; note: string; checkedInAt: string | null; checkInCode: string;
};
export type CheckInResult = { ok: true; already?: boolean; booking: Arrival } | { ok: false; error: string; code?: string; booking?: Arrival };

/** Checks someone in by their code (typed or scanned) or a booking's id; `value: false` takes it off. Never throws. */
export async function checkInBooking(body: { code?: string; id?: string; value?: boolean }): Promise<CheckInResult> {
  try {
    const r = await bookingsData.admin("checkIn", body) as { already?: boolean; booking: Arrival };
    return { ok: true, already: r.already, booking: r.booking };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Check-in didn't work just now. Please try again.", code: e?.code, booking: e?.answer?.booking };
  }
}

/** A pack of visits a customer bought (op `packs`; held packs that were never paid are left out). */
export type PackRow = {
  id: string; last4: string; serviceId: string; serviceName: string; name: string; email: string;
  visits: number; left: number; status: "active" | "closed" | "used" | string; priceMinor: number; currency: string;
  expiresOn: string | null; paidAt: string | null; refundMinor: number;
  /** The sales tax inside priceMinor, when the service charges it (packs bought since 17 November 2026). */
  taxMinor?: number; taxLines?: { name: string; cents: number }[];
  uses: { bookingId: string; start: string | null; returned: boolean }[];
};
