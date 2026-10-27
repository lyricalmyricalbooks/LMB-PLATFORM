// Announcement countdown (Studio › Style › Header & announcement bar › announcementCountdown, off by default).
// A message from Announcement messages with a Show until day (a Toronto shop date, inclusive) ends at the next
// Toronto midnight; inside the last `announcementCountdownWithin` hours (default 72) the bar adds "Ends in 5h 12m"
// after it. Pure, so the storefront and tests share one reading.
import { saleCountdown } from "./saleCountdown";
import { designNumber } from "./designNumber";
import { getCopy } from "./storeCopy";

export const announcementCountdownOn = (look: any) => look?.announcementCountdown === true;

/** The words to show after a message ending on `until`, or "" (switch off, no end day, too far off, or over). */
export function announcementCountdownText(look: any, copyDesign: any, until: string | undefined, nowMs: number): string {
  if (!announcementCountdownOn(look) || !until) return "";
  const left = saleCountdown(until, nowMs, designNumber(look, "announcementCountdownWithin", 72));
  if (!left) return "";
  const key = left.days > 0 ? "announceEndsDays" : left.hours > 0 ? "announceEndsHours" : "announceEndsMinutes";
  return String(getCopy(copyDesign, key, { days: String(left.days), hours: String(left.hours), minutes: String(left.minutes) }) ?? "").trim();
}
