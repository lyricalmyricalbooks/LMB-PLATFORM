// Whether this shop takes rentals right now, for the footer link. The server keeps `settings/website.rentalsLive`
// in step (functions/rentals.js `tellWebsite`), so the pages learn it from the settings they already read: no extra
// request. It is only a hint for showing a link; the server still decides.
import { useSyncExternalStore } from "react";

let live = false;
const listeners = new Set<() => void>();

export function setRentalsLive(next: boolean) {
  if (next === live) return;
  live = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** True while the shop rents things out. */
export const useRentalsLive = () => useSyncExternalStore(subscribe, () => live, () => false);
