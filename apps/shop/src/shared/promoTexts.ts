// Promo texts (Bookings plan 4, step 5.6): one text to a group of clients, such as "Openings this Friday". Only clients who
// ticked "Text me offers" on a booking get them (their own yes, separate from reminder texts), only in the daytime on the
// shop's clock, at most one a day, always with the shop's name and how to stop. One copy for the admin and the server.

export type PromoGroup = "all" | "recent" | "service";
export const PROMO_GROUPS: ReadonlyArray<{ id: PromoGroup; label: string }> = [
  { id: "all", label: "Everyone who said yes" },
  { id: "recent", label: "Clients who came in the last 90 days" },
  { id: "service", label: "Clients who booked one service" },
];
export const RECENT_DAYS = 90;
export const MIN_PROMO = 10;
export const MAX_PROMO = 300;
/** The most texts one promo sends. */
export const MAX_PROMO_TEXTS = 500;
/** Hours between two promos. */
export const PROMO_GAP_HOURS = 24;
/** Promos go out from 9 a.m. until 8 p.m. on the shop's clock. */
export const PROMO_FROM_HOUR = 9;
export const PROMO_UNTIL_HOUR = 20;

/** The owner's words, trimmed and on one line; a problem in plain words when too short or too long. */
export function cleanPromo(value: unknown): { text: string } | { problem: string } {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length < MIN_PROMO) return { problem: `Write at least ${MIN_PROMO} letters.` };
  if (text.length > MAX_PROMO) return { problem: `Keep it to ${MAX_PROMO} letters or fewer.` };
  return { text };
}

export function cleanGroup(value: unknown): PromoGroup {
  return value === "recent" || value === "service" ? value : "all";
}

/** The whole text as clients get it: the shop's name first, the words, then how to stop. */
export function promoBody(text: string, shop: string, lang: "en" | "fr" = "en"): string {
  const stop = lang === "fr" ? "Répondez STOP pour ne plus recevoir de textos." : "Reply STOP to stop texts.";
  const name = String(shop || "").trim();
  return `${name ? `${name}: ` : ""}${text} ${stop}`;
}

// The plain text alphabet phones send 160 to a part in; anything else (an emoji, curly quotes) means 70.
const PLAIN = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

/** How many parts a text is billed as: 160 plain letters in one (153 a part after that), 70 otherwise (67 after). */
export function textParts(body: string): number {
  const chars = [...String(body || "")].length;
  if (!chars) return 0;
  const [one, many] = PLAIN.test(body) ? [160, 153] : [70, 67];
  return chars <= one ? 1 : Math.ceil(chars / many);
}

/** The hour (0 to 23) on the shop's clock. */
function hourIn(ms: number, zone: string): number {
  const hour = new Intl.DateTimeFormat("en-CA", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(ms);
  return Number(hour) % 24;
}

/** Whether a promo may go out now: daytime on the shop's clock. */
export function promoHours(ms: number, zone: string): boolean {
  const h = hourIn(ms, zone);
  return h >= PROMO_FROM_HOUR && h < PROMO_UNTIL_HOUR;
}

/** Digits of a phone number, for telling two bookings of the same person apart from two people. */
export function phoneKey(phone: unknown): string {
  return String(phone ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}
