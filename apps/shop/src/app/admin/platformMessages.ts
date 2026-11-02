// The platform's messages to the press (code plan 19.14). Pure and tested (platformMessages.test.ts).
//
// The platform's control room writes the admin-only `platform/messages` document into the shop's database: every
// message for this shop that hasn't ended, upcoming ones included (control-room/messages.js in the platform repo). No
// browser can write it and only admins can read it (firestore.rules). The admin shows the ones between their start and
// end as a banner over every admin page (PlatformMessagesBar.tsx); the storefront never reads it.
//
// A press can close a banner; that is kept in this browser only. Admin-only words, plain (no technical terms).

export type PlatformMessageLevel = "info" | "important";

export type PlatformMessage = { id: string; words: string; level: PlatformMessageLevel; startsAt: string; endsAt: string };

/** Where this browser keeps the messages the press closed. */
export const DISMISSED_KEY = "lmb-admin-closed-platform-messages";
/** At most this many banners at once; the rest wait until one is closed. */
export const MAX_SHOWN = 3;
const MAX_WORDS = 400;

const time = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);

/** The document's messages as the admin may trust them; anything malformed is left out. */
export function parsePlatformMessages(raw: unknown): PlatformMessage[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { messages?: unknown }).messages) ? (raw as { messages: unknown[] }).messages : [];
  const out: PlatformMessage[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const startsAt = time(m.startsAt);
    const endsAt = time(m.endsAt);
    if (typeof m.id !== "string" || !m.id || typeof m.words !== "string" || !m.words.trim() || !startsAt || !endsAt) continue;
    out.push({ id: m.id, words: m.words.trim().slice(0, MAX_WORDS), level: m.level === "important" ? "important" : "info", startsAt, endsAt });
  }
  return out;
}

/**
 * The banners to show now: between their start and end, not closed in this browser, important first, then the
 * earliest start, at most MAX_SHOWN.
 */
export function pickPlatformMessages(raw: unknown, { now = Date.now(), dismissed = [] }: { now?: number; dismissed?: readonly string[] } = {}): PlatformMessage[] {
  const closed = new Set(dismissed);
  return parsePlatformMessages(raw)
    .filter((m) => Date.parse(m.startsAt) <= now && now < Date.parse(m.endsAt) && !closed.has(m.id))
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "important" ? -1 : 1) || Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, MAX_SHOWN);
}

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void } | null | undefined;

/** The ids the press closed in this browser. A blocked or broken store reads as none. */
export function readDismissed(store: Store): string[] {
  try {
    const parsed = JSON.parse(store?.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(-100) : [];
  } catch {
    return [];
  }
}

/** Remembers one closed message (the last 100 are kept). Returns the new list, kept even if the store refuses it. */
export function rememberDismissed(store: Store, id: string): string[] {
  const next = [...readDismissed(store).filter((x) => x !== id), id].slice(-100);
  try {
    store?.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the banner closes for this visit only.
  }
  return next;
}
