// Bookings (beta): what the admin reads and the changes it asks the server for (functions/bookings.js). The admin reads
// services, hours and bookings straight from the shop's folder (firestore.rules: admin read, no browser write); every
// change goes through the server's bookingsAdmin action, which checks the time is still free.
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { cleanBookingSettings, cleanService, type BookingService, type BookingSettings, type SavedCard } from "../../shared/bookingTimes";

export type BookingStatus = "held" | "confirmed" | "cancelled";
export type Booking = {
  id: string; serviceId: string; serviceName: string; minutes: number; location?: string; start: string; end: string;
  customer: { name: string; email: string; phone?: string }; note?: string; answers?: { label: string; answer: string }[]; status: BookingStatus;
  payment: "free" | "card" | "deposit" | "atShop"; priceMinor: number; /** With payment "deposit": the part taken by card when booked. */ depositMinor?: number; depositPaid?: boolean; currency: string; paid: boolean; noShow?: boolean; clearing?: boolean;
  refund?: { amountMinor: number; at: string } | null; source?: "website" | "admin"; cancelledBy?: string;
  /** Card on file: the most the owner may charge after a missed booking, the saved card, and the fee once charged. */
  cardHold?: boolean; lateFeeMinor?: number; card?: SavedCard | null; fee?: { amountMinor: number; at: string; reason?: string } | null;
  history?: { at: string; what: string; by: string }[]; createdAt?: string;
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
  range: rangeFromShop,
  admin: adminFromServer as (op: AdminOp, body: Record<string, unknown>) => Promise<unknown>,
};

/** Whether the platform turned Bookings on for this shop. */
export function useBookingsOn(enabled: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    return bookingsData.watchOn(setOn);
  }, [enabled]);
  return on;
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

/** Every booking starting from `fromIso` up to `toIso`, read once (the Figures tab). */
async function rangeFromShop(fromIso: string, toIso: string): Promise<Booking[]> {
  const snap = await getDocs(query(collection(db, "bookings"), where("start", ">=", fromIso), where("start", "<", toIso), orderBy("start"), limit(5000)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }));
}
export const readBookingsBetween = (fromIso: string, toIso: string) => bookingsData.range(fromIso, toIso);

export type AdminOp = "saveService" | "deleteService" | "saveSettings" | "setLive" | "times" | "create" | "cancel" | "move" | "noShow" | "paidAtShop" | "chargeFee" | "calendarFeed" | "waitlist" | "removeWaiting";

/** Someone who asked to hear when a full class time (start) or a booked-up day (no start) has room again. */
export type Waiting = { id: string; serviceId: string; serviceName: string; day: string; start: string | null; name: string; email: string; createdAt: string;
  /** A freed place held for them until then (the waiting list offers it first come, first served), else null. */
  heldUntil?: string | null };

async function adminFromServer(op: AdminOp, body: Record<string, unknown> = {}): Promise<unknown> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be signed in as admin.");
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify({ action: "bookingsAdmin", op, ...body }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Bookings couldn't be saved just now. Please try again.");
  return result;
}
