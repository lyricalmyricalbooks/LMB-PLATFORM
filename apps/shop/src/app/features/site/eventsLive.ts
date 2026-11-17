// Whether this shop has events coming up right now, for the header icon, the phone menu and the footer link. The
// server keeps `settings/website.eventsLive` in step (functions/events.js `tellWebsite`: after an event is saved or
// deleted and when the owner flips the switch), so the pages learn it from the settings they already read: no extra
// request. It is only a hint for showing a link; the server still decides what can be bought.
import { useSyncExternalStore } from "react";

let live = false;
const listeners = new Set<() => void>();

export function setEventsLive(next: boolean) {
  if (next === live) return;
  live = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** True while the shop has events on sale or coming. */
export const useEventsLive = () => useSyncExternalStore(subscribe, () => live, () => false);

/** The header and phone-menu link: events are coming and the owner hasn't hidden it (Style › Header › Icons & buttons). */
export const eventsLinkShown = (isLive: boolean, flags: any) => isLive && !flags?.hideHeaderEvents;
