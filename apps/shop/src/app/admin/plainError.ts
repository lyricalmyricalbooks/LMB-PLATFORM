/**
 * Plain words for a failure shown on an admin screen (pure). The shop's own Functions already answer in plain
 * English ("Gmail refused the app password."), so those are shown as they are; provider text (Firebase codes,
 * stack lines, HTTP status words) is swapped for a sentence the owner can act on. The raw error goes to the console.
 */
const textOf = (err: unknown): string => {
  const e = err as any;
  return String(e?.message ?? (typeof err === "string" ? err : "") ?? "").trim();
};

/** A known kind of failure, in shop words; "" when unrecognised. */
export function knownReason(err: unknown): string {
  const code = String((err as any)?.code ?? "").toLowerCase();
  const msg = textOf(err).toLowerCase();
  const has = (...n: string[]) => n.some((x) => code.includes(x) || msg.includes(x));
  if ((err as any)?.name === "TypeError" && has("fetch", "network", "load failed")) return "The connection dropped. Check your internet and try again.";
  if (has("permission-denied", "insufficient permissions", "unauthenticated")) return "The shop didn't allow that. Sign in again with the shop's Google account, then try again.";
  if (has("deadline-exceeded", "timed out", "timeout")) return "The shop took too long to answer. Try again in a moment.";
  if (has("unavailable", "failed to fetch", "networkerror", "offline")) return "The connection dropped. Check your internet and try again.";
  if (has("answered 404", "answered 5")) return "The email service didn't answer. Try again in a few minutes.";
  return "";
}

/** Short, sentence-like text with no provider codes, braces or stack text. */
export function isPlainSentence(message: string): boolean {
  const m = message.trim();
  if (!m || m.length > 300) return false;
  if (/firebase|firestore|\bat \S+:\d+|[{}<>]|\[object|\bundefined\b|\bnull\b|typeerror|referenceerror|exception|cloud functions|\b[45]\d\d\b/i.test(m)) return false;
  return /[a-z]{3}/i.test(m);
}

/** "<what failed>. <reason>" — always says the action failed, never shows raw provider text. */
export function plainError(err: unknown, whatFailed: string): string {
  console.warn(`[admin] ${whatFailed}`, err);
  const known = knownReason(err);
  const raw = textOf(err);
  const reason = known || (isPlainSentence(raw) ? (/[.!?]$/.test(raw) ? raw : `${raw}.`) : "Try again in a moment.");
  return `${whatFailed}. ${reason}`;
}
