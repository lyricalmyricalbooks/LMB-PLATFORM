// Digital D3 (Beta): where a shopper stopped in a bought audiobook or video, kept in this browser only, so Listen/Watch
// picks up there. Pure apart from the storage passed in; the player (MediaPlayer.tsx) wraps every call in try/catch.

const PREFIX = "lm:listen:";
/** Closer than this to the end counts as finished, so the next play starts again from the top. */
const END_SLACK_SECONDS = 15;

export function placeKey(orderId: string, itemId: string, variantId: string, file: number): string {
  return `${PREFIX}${orderId}:${itemId}|${variantId || ""}|${file || 0}`;
}

/** The second to start from: a saved, finite, positive number not within the last few seconds; else 0. */
export function startFrom(saved: string | null | undefined, duration?: number): number {
  const at = Number(saved);
  if (!Number.isFinite(at) || at <= 0) return 0;
  if (duration && Number.isFinite(duration) && at >= duration - END_SLACK_SECONDS) return 0;
  return Math.floor(at);
}

/** What to store for a position: the whole second, or null (remove) at the start or near the end. */
export function placeToSave(at: number, duration?: number): string | null {
  if (!Number.isFinite(at) || at < 5) return null;
  if (duration && Number.isFinite(duration) && at >= duration - END_SLACK_SECONDS) return null;
  return String(Math.floor(at));
}

/** A play link is worth asking for again a little before it runs out, or after the player says it failed. */
export function linkNeedsRefresh(expiresAt: number | undefined, now: number): boolean {
  return !expiresAt || expiresAt - now < 60_000;
}
