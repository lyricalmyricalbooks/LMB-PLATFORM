// Settings › Email sender (redesign, 18 November 2026): the pure rules behind the three sub pages. Tested in
// emailSenderView.test.ts; nothing here reads Firestore or the server.

export type DeliveryRow = {
  id: string; at?: unknown; to?: string | null; subject?: string | null; status?: string; error?: string | null; note?: string | null;
  keySource?: string; sandbox?: boolean; from?: string; attempt?: number; retryAt?: string | null; outboxId?: string;
};

/** Each email's newest row only (rows are newest first): one the retry queue later sent no longer counts as a problem.
 *  The same rule as emailLogDisplay's currentRows, for rows read straight from Firestore. */
export function currentRows<T extends DeliveryRow>(rows: T[]): T[] {
  const newest = new Map<string, T>();
  for (const row of rows) if (row?.outboxId && !newest.has(row.outboxId)) newest.set(row.outboxId, row);
  return rows.filter((row) => !row?.outboxId || newest.get(row.outboxId) === row);
}

/** How a delivery reads in the table: a problem to fix, waiting for its next try, a shopper who asked for no more, sent, or stopped. */
export type DeliveryKind = "problem" | "waiting" | "paused" | "sent" | "stopped";

export function deliveryKind(row: DeliveryRow): DeliveryKind {
  if (row.status === "failed" || row.status === "bounced") return "problem";
  if (row.status === "queued") return "waiting";
  if (row.status === "complained") return "paused";
  if (row.status === "cancelled") return "stopped";
  return "sent";
}

export const KIND_LABEL: Record<DeliveryKind, string> = { problem: "Problem", waiting: "Will retry", paused: "Paused", sent: "Sent", stopped: "Stopped" };

/** The shopper's own words for why it didn't arrive, short enough for one table cell. */
export function deliveryDetail(row: DeliveryRow): string {
  const kind = deliveryKind(row);
  if (kind === "paused") return "Marked as spam";
  if (kind === "stopped") return "You stopped it";
  if (kind === "sent") {
    if (row.sandbox || row.note || row.from === "onboarding@resend.dev") return "Test sender: only reaches you";
    return (row.attempt || 0) > 1 ? `Sent on try ${row.attempt}` : "Delivered";
  }
  const text = String(row.error || row.note || "").trim();
  if (/mailbox (is )?full|over quota|quota exceeded/i.test(text)) return "Mailbox full";
  if (/does not exist|no such user|user unknown|unknown user|invalid recipient|address rejected|not found/i.test(text)) return "Address doesn't exist";
  if (/spam|blocked|rejected|denied|policy/i.test(text)) return "Rejected by their provider";
  if (kind === "waiting") return "Trying again soon";
  return text ? text.slice(0, 80) : "Didn't go through";
}

/** A row's time: the hour today, else the day. */
export function deliveryTime(at: unknown, now = new Date()): string {
  const when = toDate(at);
  if (!when) return "—";
  const sameDay = when.toDateString() === now.toDateString();
  return sameDay
    ? when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : when.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function toDate(at: unknown): Date | null {
  if (!at) return null;
  if (typeof at === "string" || typeof at === "number") { const d = new Date(at); return Number.isNaN(d.getTime()) ? null : d; }
  if (typeof at === "object" && at && typeof (at as { seconds?: unknown }).seconds === "number") return new Date((at as { seconds: number }).seconds * 1000);
  return null;
}

export type DeliveryFilter = "all" | "problems" | "paused" | "sent";

/** The table's rows for a filter and a search (address or email name, any case). Only each email's newest row counts. */
export function shownDeliveries<T extends DeliveryRow>(rows: T[], filter: DeliveryFilter, search = ""): T[] {
  const words = search.trim().toLowerCase();
  return currentRows(rows).filter((row) => {
    const kind = deliveryKind(row);
    if (filter === "problems" && kind !== "problem" && kind !== "waiting") return false;
    if (filter === "paused" && kind !== "paused") return false;
    if (filter === "sent" && kind !== "sent") return false;
    if (!words) return true;
    return `${row.to || ""} ${row.subject || ""}`.toLowerCase().includes(words);
  });
}

/** The three tiles at the top of Deliveries, and the count on the tab. */
export function deliveryStats(rows: DeliveryRow[], now = new Date()) {
  const current = currentRows(rows);
  const today = now.toDateString();
  const sentToday = current.filter((r) => deliveryKind(r) === "sent" && toDate(r.at)?.toDateString() === today).length;
  const problems = current.filter((r) => { const k = deliveryKind(r); return k === "problem" || k === "waiting"; }).length;
  const paused = new Set(current.filter((r) => deliveryKind(r) === "paused").map((r) => String(r.to || "").toLowerCase())).size;
  return { sentToday, problems, paused, sent: current.filter((r) => deliveryKind(r) === "sent").length };
}

/** "4 min ago" for the status banner. */
export function agoWords(at: unknown, now = new Date()): string {
  const when = toDate(at);
  if (!when) return "";
  const mins = Math.max(0, Math.round((now.getTime() - when.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Where emails go out from now. "platform": Colophon's address, "gmail": the shop's own Gmail, "backup": the shop's own mail service key. */
export type SendMethod = "platform" | "gmail" | "backup";

export function sendMethod({ shared, gmailAddress, lastKeySource }: { shared: boolean; gmailAddress: string; lastKeySource?: string }): SendMethod {
  if (gmailAddress || lastKeySource === "gmail") return "gmail";
  return shared ? "platform" : "backup";
}

/** The status banner: how sending is going, from the newest rows. */
export function senderHealth(rows: DeliveryRow[], now = new Date()): { tone: "good" | "problem" | "quiet"; title: string; line: string } {
  const current = currentRows(rows);
  const newest = current[0];
  const lastSent = current.find((r) => deliveryKind(r) === "sent");
  if (!newest) return { tone: "quiet", title: "Ready to send", line: "Nothing sent yet" };
  const recentProblems = current.slice(0, 5).filter((r) => deliveryKind(r) === "problem").length;
  if (deliveryKind(newest) === "problem" && recentProblems >= 3) {
    return { tone: "problem", title: "Needs a look", line: "The last few emails didn't go through" };
  }
  return { tone: "good", title: "Working normally", line: lastSent ? `Last email sent ${agoWords(lastSent.at, now)}` : "No email sent yet" };
}

/** The first letter of the sender name, for the inbox picture. */
export function initialOf(name: string): string {
  const letter = [...String(name || "").trim()][0];
  return letter ? letter.toUpperCase() : "·";
}
