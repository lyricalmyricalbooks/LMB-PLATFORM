// Get started: which step of the run a press sees next (plans 17.1 to 17.13). One place decides the order, so the
// Overview doesn't carry its own gates. Order: your press (17.2), bring your shop (17.3), the look (6.3, 17.8), Google
// (17.9), shipping and the address (17.11), the final check and open (17.13). Get paid (17.10) joins between Google and
// shipping when it is built. A shop with no setup document, a stockroom-only plan, or a press that never went through
// step 1 (older shops) gets no run at all.

import { finalCheckShows } from "./finalCheckStage";
import { shippingStepShows } from "./shippingStage";

export type RunStep = "details" | "bring" | "look" | "google" | "shipping" | "final";

export type RunDoc = {
  details?: unknown; bring?: unknown; welcome?: unknown; google?: unknown; shipping?: unknown; finalCheck?: unknown;
  plan?: string;
} | null;

export function nextRunStep(doc: RunDoc, settings: any): RunStep | null {
  if (!doc || doc.plan === "stockroom") return null;
  if (!doc.welcome) return !doc.details ? "details" : !doc.bring ? "bring" : "look";
  if (!doc.details) return null;
  if (!doc.google) return "google";
  if (shippingStepShows(doc)) return "shipping";
  if (finalCheckShows(doc, settings)) return "final";
  return null;
}
