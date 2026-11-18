// Whether this shop takes gifts right now, for the header icon, the phone menu and the footer link. The server keeps
// `settings/website.givingLive` in step (functions/giving.js `tellWebsite`: both switches are on), so the pages learn it
// from the settings they already read: no extra request. It is only a hint for showing a link; the server still decides.
import { useSyncExternalStore } from "react";

let live = false;
const listeners = new Set<() => void>();

export function setGivingLive(next: boolean) {
  if (next === live) return;
  live = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** True while the shop takes gifts. */
export const useGivingLive = () => useSyncExternalStore(subscribe, () => live, () => false);

/** The header and phone-menu link: gifts are on and the owner hasn't hidden it (Style › Header › Icons & buttons). */
export const supportLinkShown = (isLive: boolean, flags: any) => isLive && !flags?.hideHeaderSupport;
