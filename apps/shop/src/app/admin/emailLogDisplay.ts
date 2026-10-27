import type { BadgeTone } from "./riso/components";

type LogEntry = {
  status?: string; note?: string; error?: string; keySource?: string; sandbox?: boolean; from?: string;
  attempt?: number; retryAt?: string | null; outboxId?: string; at?: string;
};

/**
 * How one emailLog row reads in Settings › Notifications › Recent deliveries (pure).
 * "fallback" = Gmail missed and the shop switched to the backup sender (Resend); the row
 * after it says whether that worked, so it is a warning, never a failure.
 * "queued" = every sender refused it, but it is saved and will be tried again automatically.
 */
export function emailLogBadge(entry: LogEntry): { tone: BadgeTone; label: string } {
  if (entry.status === "failed") return { tone: "danger", label: "Failed" };
  if (entry.status === "bounced") return { tone: "danger", label: "Bounced" };
  if (entry.status === "complained") return { tone: "danger", label: "Marked as spam" };
  if (entry.status === "queued") return { tone: "warning", label: "Will retry" };
  if (entry.status === "cancelled") return { tone: "neutral", label: "Stopped" };
  if (entry.status === "fallback") return { tone: "warning", label: "Gmail missed · used backup" };
  if (entry.sandbox || entry.note || entry.from === "onboarding@resend.dev") return { tone: "warning", label: "Sent (sandbox)" };
  if ((entry.attempt || 0) > 1) return { tone: "success", label: "Sent on retry" };
  return { tone: "success", label: "Sent" };
}

export function emailLogDetail(entry: LogEntry): string {
  const base = entry.error || entry.note || (entry.keySource === "gmail" ? "Accepted by Gmail" : "Accepted by Resend");
  const tries = entry.status === "sent" && (entry.attempt || 0) > 1 ? ` (try ${entry.attempt})` : "";
  const next = entry.status === "queued" && entry.retryAt ? ` Next try ${new Date(entry.retryAt).toLocaleString()}.` : "";
  return `${base}${tries}${next}`;
}

/** Rows that need the owner: failures, give-ups and emails still waiting to be retried. */
export function needsAttention(entry: LogEntry): boolean {
  return ["failed", "bounced", "complained", "queued"].includes(entry.status || "");
}

/**
 * The rows that still describe something: for an email the retry queue handled, only its newest
 * row (rows are newest first) — an email sent on try 3 no longer counts as failed or waiting.
 */
export function currentRows<T extends LogEntry>(rows: T[]): T[] {
  const newest = new Map<string, T>();
  for (const row of rows) if (row?.outboxId && !newest.has(row.outboxId)) newest.set(row.outboxId, row);
  return rows.filter(row => !row?.outboxId || newest.get(row.outboxId) === row);
}

