// Customers › Newsletter: one sent (or sending) newsletter as the server stores it (functions/newsletterSend.js),
// and the plain words the card shows for it.
import type { BadgeTone } from "./riso/components";

export type NewsletterStatus = "queued" | "sending" | "sent" | "cancelled" | "paused";

export type NewsletterIssue = {
  id: string; subject: string; body?: string; buttonText?: string; buttonUrl?: string;
  status: NewsletterStatus; audience?: number; sent?: number; failed?: number; lastError?: string;
  createdAt?: string; finishedAt?: string; createdBy?: string;
};

export const NEWSLETTER_STATUS: Record<NewsletterStatus, { label: string; tone: BadgeTone }> = {
  queued: { label: "Starting soon", tone: "info" },
  sending: { label: "Sending", tone: "info" },
  sent: { label: "Sent", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  paused: { label: "Paused", tone: "warning" },
};

export const isActiveIssue = (issue: Pick<NewsletterIssue, "status">) => issue.status === "queued" || issue.status === "sending";

/** "120 of 340 people", or "340 people" once finished. */
export function reachedText(issue: Pick<NewsletterIssue, "status" | "sent" | "audience">): string {
  const sent = Number(issue.sent) || 0;
  const audience = Number(issue.audience) || 0;
  const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
  if (issue.status === "sent") return people(sent);
  return audience ? `${sent} of ${people(audience)}` : people(sent);
}

/** Why the send button is off, or "" when the draft can go. Mirrors the server's newsletterDraftProblem. */
export function draftProblem(d: { subject: string; body: string; buttonText: string; buttonUrl: string }): string {
  if (!d.subject.trim()) return "Give the newsletter a subject line.";
  if (!d.body.trim()) return "Write something in the newsletter before sending it.";
  if (d.buttonText.trim() && !d.buttonUrl.trim()) return "Add the web address the button opens, or clear the button words.";
  if (d.buttonUrl.trim() && !/^https:\/\/[^\s<>"']+$/i.test(d.buttonUrl.trim())) return "The button's web address must start with https://.";
  return "";
}
