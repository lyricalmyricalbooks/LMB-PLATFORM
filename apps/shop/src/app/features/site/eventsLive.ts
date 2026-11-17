// Whether this shop has events coming up right now, for the header icon, the phone menu and the footer link. The
// server keeps `settings/website.eventsLive` in step (functions/events.js `tellWebsite`: after an event is saved or
// deleted and when the owner flips the switch), so the pages learn it from the settings they already read: no extra
// request. It is only a hint for showing a link; the server still decides what can be bought. The server also says
// when the last coming event is over (`eventsLiveUntil`), so the link comes down by itself with nobody saving anything.
import { useSyncExternalStore } from "react";

let live = false;
const listeners = new Set<() => void>();

let timer: ReturnType<typeof setTimeout> | null = null;
const MAX_WAIT = 2_000_000_000; // setTimeout's longest wait, about 23 days

/** Whether the hint still holds at `nowMs`: on, and not past the end of the last coming event (no end kept = on). */
export function eventsLiveNow(on: boolean, until: unknown, nowMs: number): boolean {
  if (!on) return false;
  const end = typeof until === "string" ? Date.parse(until) : NaN;
  return !Number.isFinite(end) || end > nowMs;
}

export function setEventsLive(on: boolean, until?: unknown) {
  if (timer) { clearTimeout(timer); timer = null; }
  const next = eventsLiveNow(on, until, Date.now());
  // An open page takes the link down when the last event ends.
  const end = typeof until === "string" ? Date.parse(until) : NaN;
  if (next && Number.isFinite(end)) timer = setTimeout(() => setEventsLive(on, until), Math.min(MAX_WAIT, end - Date.now() + 1000));
  if (next === live) return;
  live = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** True while the shop has events on sale or coming. */
export const useEventsLive = () => useSyncExternalStore(subscribe, () => live, () => false);

/** The header and phone-menu link: events are coming and the owner hasn't hidden it (Style › Header › Icons & buttons). */
export const eventsLinkShown = (isLive: boolean, flags: any) => isLive && !flags?.hideHeaderEvents;
