// Get started, step 8: the final check and open (plan 17.13). Pure: when the step shows and what it records. The checks
// are the same ones the setup guide's open step runs (openBlockers in firstWeek.ts, launchReadiness.ts); this step adds
// the order the press sees them in, and the practice order, which is recommended and never required (decision 1).

import { shopIsOpen } from "./firstWeek";

/** What the step records once the shop is open (firstWeek/start › finalCheck). `opened` is false when the press finishes later. */
export interface FinalCheckMarker {
  at: string;
  opened: boolean;
}

/**
 * Whether the step is still to show: after shipping (step 6), for a press that went through Get started, until it is
 * done or the shop is already open (opened from the setup guide, so there is nothing left to check here).
 */
export function finalCheckShows(doc: { details?: unknown; plan?: string; welcome?: unknown; shipping?: unknown; finalCheck?: unknown } | null, settings: any): boolean {
  if (!doc || !doc.details || doc.plan === "stockroom" || !doc.welcome || !doc.shipping || doc.finalCheck) return false;
  return !(settings && shopIsOpen(settings));
}
