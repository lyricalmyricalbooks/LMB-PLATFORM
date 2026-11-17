// Books › edit › Digital product › Tell buyers about a new version (Digital D2b, Beta): the server's answer and the words
// the card shows for it. Pure, so the card stays a thin view.

export type DigitalUpdateJob = {
  id: string;
  status: "queued" | "sending" | "sent" | "cancelled" | "paused";
  audience: number;
  sent: number;
  failed: number;
  createdAt: string;
  finishedAt: string;
  lastError: string;
};

export type DigitalUpdateAnswer = { ok?: boolean; buyers?: number; latest?: DigitalUpdateJob | null };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "";
};

/** The one line about the last send, or "" when there has been none. */
export function jobLine(job: DigitalUpdateJob | null | undefined): string {
  if (!job) return "";
  const when = day(job.finishedAt || job.createdAt);
  if (job.status === "queued") return `Starting soon: ${plural(job.audience, "buyer")} will be told within 15 minutes.`;
  if (job.status === "sending") return `Telling buyers: ${job.sent} of ${job.audience} so far.`;
  if (job.status === "paused") return job.lastError || "Sending paused. Press Carry on to try again.";
  if (job.status === "cancelled") return `Stopped${when ? ` on ${when}` : ""} after ${plural(job.sent, "buyer")}.`;
  return `Last told ${plural(job.sent, "buyer")}${when ? ` on ${when}` : ""}${job.failed ? ` (${job.failed} address${job.failed === 1 ? "" : "es"} didn't work)` : ""}.`;
}

/** True while a send is still going, so the button waits. */
export const jobActive = (job: DigitalUpdateJob | null | undefined) => !!job && (job.status === "queued" || job.status === "sending");

/** Whether any of the product's (or its editions') files has been replaced by a newer version. */
export function hasNewVersion(form: any): boolean {
  const holders = [form, ...((form && form.variants) || [])];
  return holders.some((h) => Array.isArray(h?.digitalFiles) && h.digitalFiles.some((f: any) => Number(f?.version) > 1));
}
