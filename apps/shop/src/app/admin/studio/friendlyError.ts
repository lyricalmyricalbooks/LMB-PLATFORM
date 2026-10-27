/** Studio error words (pure). A failure is always shown as a failure; this only swaps the raw provider text
 *  ("FirebaseError: Missing or insufficient permissions…") for a sentence the owner can act on. The raw error goes to
 *  the browser console for anyone debugging. */

const text = (err: unknown): string => {
  const e = err as any;
  return String(e?.message ?? (typeof err === "string" ? err : "") ?? "");
};
const codeOf = (err: unknown): string => String((err as any)?.code ?? "").toLowerCase();

/** The plain reason, or "" when the error isn't one we recognise. */
export function friendlyReason(err: unknown): string {
  const code = codeOf(err), msg = text(err).toLowerCase();
  const has = (...needles: string[]) => needles.some(n => code.includes(n) || msg.includes(n));
  if (has("permission-denied", "insufficient permissions", "unauthenticated", "unauthorized")) return "The shop didn't allow that. Sign in again with the shop's Google account, then retry.";
  if (has("deadline-exceeded", "timed out", "timeout")) return "The shop took too long to answer. Try again in a moment.";
  if (has("resource-exhausted", "quota")) return "The shop's database is over its daily limit for now. Try again later.";
  if (has("unavailable", "failed to fetch", "network", "offline", "load failed")) return "The connection dropped. Check your internet and try again.";
  if (has("not-found", "not found")) return "That item no longer exists. Reload Studio to see what's current.";
  return "";
}

/** A message that is already plain English (short, no provider codes or stack text) can be shown as it is. */
export function isPlainMessage(message: string): boolean {
  const m = message.trim();
  if (!m || m.length > 160) return false;
  if (/firebase|firestore|\bat \S+:\d+|[{}[\]<>]|\w+\/[\w-]+|\bundefined\b|\bnull\b|\[object|error:|exception/i.test(m)) return false;
  return /[a-z]{3}/i.test(m);
}

/**
 * "Couldn't <what>. <reason> Your changes are still here."
 *
 * `keepsChanges`: say "Your changes are still here." Only pass it where that is true (a save or publish failed and the
 * draft stays in the editor). Always logs the raw error and always says the action failed.
 */
export function friendlyError(err: unknown, what: string, opts: { keepsChanges?: boolean } = {}): string {
  console.error(`[Studio] couldn't ${what}`, err);
  const known = friendlyReason(err);
  const raw = text(err).trim();
  const reason = known || (isPlainMessage(raw) ? (/[.!?]$/.test(raw) ? raw : `${raw}.`) : "Something went wrong. Try again in a moment.");
  return `Couldn't ${what}. ${reason}${opts.keepsChanges ? " Your changes are still here." : ""}`;
}
