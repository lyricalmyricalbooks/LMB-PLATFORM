// Get started: which step of the run a press sees next (plans 17.1 to 17.13). One place decides the order, so the
// Overview doesn't carry its own gates. Order: your brand (17.2), your products (17.3), the look (6.3, 17.8), Get paid
// (17.10, only for a press whose cards go through the platform), shipping (17.11), and opening the shop (17.13).
// Google (17.9) left the run on 11 November 2026: it is optional and the Overview's own Connect Google card asks for it,
// so a step that mostly said "coming soon" was filler. Older documents keep their `google` marker; nothing reads it here.
// A shop with no setup document, a stockroom-only plan, or a press that never went through step 1 (older shops) gets no
// run at all.

import { finalCheckShows } from "./finalCheckStage";
import { paymentsStepShows } from "./paymentsStage";
import { shippingStepShows } from "./shippingStage";

export type RunStep = "details" | "bring" | "look" | "payments" | "shipping" | "final";

export type RunDoc = {
  details?: unknown; bring?: unknown; welcome?: unknown; payments?: unknown; shipping?: unknown; finalCheck?: unknown;
  plan?: string;
} | null;

/** The press's own name for each step, as the progress strip shows it. */
export const RUN_LABELS: Record<RunStep, string> = {
  details: "Your brand",
  bring: "Your products",
  look: "Your look",
  payments: "Get paid",
  shipping: "Shipping",
  final: "Open your shop",
};

/** The steps this press walks, in order: Get paid only when its cards go through the platform. */
export function runSteps(platform: "stripe" | "square" | null): RunStep[] {
  return ["details", "bring", "look", ...(platform ? ["payments" as const] : []), "shipping", "final"];
}

/** `platform` is the card provider the shop's cards go through on the platform (Stripe or Square), or null on its own keys. */
export function nextRunStep(doc: RunDoc, settings: any, platform: "stripe" | "square" | null): RunStep | null {
  if (!doc || doc.plan === "stockroom") return null;
  if (!doc.welcome) return !doc.details ? "details" : !doc.bring ? "bring" : "look";
  if (!doc.details) return null;
  if (paymentsStepShows(doc, platform)) return "payments";
  if (shippingStepShows(doc)) return "shipping";
  if (finalCheckShows(doc, settings)) return "final";
  return null;
}
