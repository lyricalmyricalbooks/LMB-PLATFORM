// Live visitors (gap list 34, 13 November 2026). Google Analytics gives "on the shop now" only when it is connected;
// this is the shop's own count. Each shop tab that may be counted (trackingAllowed: consent, not the owner, not the
// preview) and is on screen adds one to the current minute of `live/<UTC day>` (`m.<minute of the UTC day>`), once
// per minute. Analytics shows the larger of the last full minute and this one. firestore.rules `live` lets a visitor
// raise one minute near the server's clock by one, so a forged client can't fake a crowd or write other days.
import { trackingAllowed } from "./trackingGuard";
import { lite } from "../../lib/lite";

/** The day document and minute key a ping at `now` lands in (UTC, the same minute the rules compute). */
export function liveSlot(now = new Date()): { day: string; minute: string } {
  return { day: now.toISOString().slice(0, 10), minute: String(now.getUTCHours() * 60 + now.getUTCMinutes()) };
}

/** People on the shop now from a day's minute counts: the larger of the last full minute and the current one. */
export function liveNow(counts: Record<string, unknown> | undefined | null, now = new Date()): number {
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const at = (m: number) => { const n = Number(counts?.[String(m)]); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
  return Math.max(at(minute), minute > 0 ? at(minute - 1) : 0);
}

async function ping(day: string, minute: string): Promise<void> {
  const { doc, setDoc, increment, liteDb } = await lite();
  await setDoc(doc(liteDb, "live", day), { date: day, m: { [minute]: increment(1) } }, { merge: true });
}

let started = false;

/**
 * Starts this tab's once-a-minute ping (only while the page is on screen). Safe to call more than once. `write` and
 * `allowed` are for tests.
 */
export function startLivePings(write = ping, allowed = trackingAllowed, clock = () => new Date()): () => void {
  if (started || typeof window === "undefined" || typeof document === "undefined") return () => {};
  started = true;
  let last = "";
  const tick = async () => {
    if (document.visibilityState !== "visible") return;
    const { day, minute } = liveSlot(clock());
    const key = `${day}/${minute}`;
    if (key === last) return;
    last = key;
    if (!(await allowed())) return;
    write(day, minute).catch(() => { /* best effort: a missed minute only lowers the live count */ });
  };
  const timer = window.setInterval(tick, 15_000);
  document.addEventListener("visibilitychange", tick);
  void tick();
  return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); started = false; };
}
