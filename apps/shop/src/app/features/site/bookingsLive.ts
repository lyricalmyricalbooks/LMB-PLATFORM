// Whether this shop is taking bookings right now, for the header icon, the phone menu and the footer link.
// The server keeps `settings/website.bookingsLive` in step with the owner's switch (functions/bookings.js
// `tellWebsite`), so the pages learn it from the settings they already read: no extra request. It is only a
// hint for showing a link; the server still decides whether a booking can be made.
import { useSyncExternalStore } from "react";

let live = false;
const listeners = new Set<() => void>();

export function setBookingsLive(next: boolean) {
  if (next === live) return;
  live = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** True while the shop takes bookings. */
export const useBookingsLive = () => useSyncExternalStore(subscribe, () => live, () => false);

/** The header and phone-menu link: bookings are on and the owner hasn't hidden it (Style › Header › Icons & buttons). */
export const bookingsLinkShown = (isLive: boolean, flags: any) => isLive && !flags?.hideHeaderBookings;
