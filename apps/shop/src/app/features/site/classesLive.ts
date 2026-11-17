// Whether this shop has classes on its timetable right now, for the header icon, the phone menu and the footer link.
// The server keeps `settings/website.classesLive` in step (functions/bookings.js `tellWebsite`: the shop sells Classes,
// takes bookings, and has a class with weekly times), so the pages learn it from the settings they already read: no
// extra request. It is only a hint for showing a link; the server still decides what can be booked.
import { useSyncExternalStore } from "react";

let live = false;
const listeners = new Set<() => void>();

export function setClassesLive(next: boolean) {
  if (next === live) return;
  live = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** True while the shop has a timetable to show. */
export const useClassesLive = () => useSyncExternalStore(subscribe, () => live, () => false);

/** The header and phone-menu link: there is a timetable and the owner hasn't hidden it (Style › Header › Icons & buttons). */
export const classesLinkShown = (isLive: boolean, flags: any) => isLive && !flags?.hideHeaderClasses;
