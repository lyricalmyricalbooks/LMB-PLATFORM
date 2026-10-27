// Close button on the announcement bar (Studio › Style › Header & announcement bar › announcementDismissible,
// off by default). A shopper who closes the bar doesn't see it again in that browser until the messages change:
// the closed bar is remembered as a short fingerprint of today's messages, so a new or edited message shows again.
// Never remembered in the Studio preview (the owner must always see the bar there).
import { useCallback, useSyncExternalStore } from "react";
import { inEditorPreview } from "../../lib/trackingGuard";

export const ANNOUNCE_CLOSED_KEY = "lm:announce-closed";

export const announcementDismissOn = (look: any) => look?.announcementDismissible === true;

/** A short, stable fingerprint of the messages on show (text + link), so editing one brings the bar back. */
export function announcementSignature(messages: { text: string; link?: string }[]): string {
  const source = messages.map((m) => `${m.text}\u0001${m.link || ""}`).join("\u0002");
  let hash = 5381;
  for (let i = 0; i < source.length; i++) hash = ((hash * 33) ^ source.charCodeAt(i)) >>> 0;
  return `${messages.length}-${hash.toString(36)}`;
}

let closedInMemory: string | null = null;
const listeners = new Set<() => void>();

function readClosed(): string | null {
  if (closedInMemory !== null) return closedInMemory;
  if (inEditorPreview()) return null;
  try { return window.localStorage.getItem(ANNOUNCE_CLOSED_KEY); } catch { return null; }
}

/** Remembers that the bar showing `signature` was closed (storage failures still close it for this page view). */
export function closeAnnouncement(signature: string) {
  closedInMemory = signature;
  if (!inEditorPreview()) {
    try { window.localStorage.setItem(ANNOUNCE_CLOSED_KEY, signature); } catch { /* private window: this visit only */ }
  }
  listeners.forEach((fn) => fn());
}

/** Test helper: forget the closed bar. */
export function resetAnnouncementDismissal() {
  closedInMemory = null;
  try { window.localStorage.removeItem(ANNOUNCE_CLOSED_KEY); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** True while the switch is on and the shopper closed exactly these messages. The prerender always shows the bar. */
export function useAnnouncementClosed(on: boolean, signature: string): boolean {
  const closed = useSyncExternalStore(subscribe, () => (on ? readClosed() : null), () => null);
  return on && !!signature && closed === signature;
}

export function useCloseAnnouncement(signature: string) {
  return useCallback(() => closeAnnouncement(signature), [signature]);
}
