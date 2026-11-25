// Get started: which step of the run a press sees next (plans 17.1 to 17.13). One place decides the order, so the
// Overview doesn't carry its own gates. Order since the sign-up to open shop plan (move 4, 25 November 2026): the look
// (6.3, 17.8, picked at sign-up so it is one press), your products (17.3), Get paid (17.10, only for a press whose cards
// go through the platform), where customers reach you (17.2) and shipping (17.11), and opening the shop (17.13).
// Home shows them as one list (openList.ts, OpenListCard.tsx).
// Google (17.9) left the run on 11 November 2026: it is optional and the Overview's own Connect Google card asks for it,
// so a step that mostly said "coming soon" was filler. Older documents keep their `google` marker; nothing reads it here.
// A services shop that sells no products (servicesSetup.ts) adds its services where a shop brings its products, and
// has no shipping step: nothing ships.
// A shop with no setup document, a stockroom-only plan, or an older shop that chose its look before the run existed
// (`welcome` without `firstRun`, and no other step) gets no run at all.

import { finalCheckShows } from "./finalCheckStage";
import { paymentsStepShows } from "./paymentsStage";
import { shippingStepShows } from "./shippingStage";
import { servicesOnly } from "./servicesSetup";

export type RunStep = "details" | "bring" | "services" | "look" | "payments" | "shipping" | "final";

export type RunDoc = {
  details?: unknown; bring?: unknown; welcome?: { firstRun?: boolean } | unknown; payments?: unknown; shipping?: unknown; finalCheck?: unknown;
  plan?: string;
  sells?: string | null; publishes?: string | null; sellsProducts?: boolean;
} | null;

/** The step names (the release notes and older words still use them). */
export const RUN_LABELS: Record<RunStep, string> = {
  details: "Your brand",
  bring: "Your products",
  services: "Your services",
  look: "Your look",
  payments: "Get paid",
  shipping: "Shipping",
  final: "Open your shop",
};

/** The steps this press walks, in order: Get paid only when its cards go through the platform. */
export function runSteps(platform: "stripe" | "square" | null, services = false): RunStep[] {
  const paid = platform ? ["payments" as const] : [];
  if (services) return ["look", "services", ...paid, "details", "final"];
  return ["look", "bring", ...paid, "details", "shipping", "final"];
}

/** `platform` is the card provider the shop's cards go through on the platform (Stripe or Square), or null on its own keys. */
export function nextRunStep(doc: RunDoc, settings: any, platform: "stripe" | "square" | null): RunStep | null {
  if (!doc || doc.plan === "stockroom") return null;
  // The services step records itself where the products step does (`bring`), so the run reads one marker for both.
  const services = servicesOnly(doc);
  const firstRun = !!(doc.welcome as { firstRun?: boolean } | undefined)?.firstRun;
  if (doc.welcome && !firstRun && !doc.details && !doc.bring) return null;
  if (!doc.welcome) return "look";
  if (!doc.bring) return services ? "services" : "bring";
  if (paymentsStepShows(doc, platform)) return "payments";
  if (!doc.details) return "details";
  if (!services && shippingStepShows(doc)) return "shipping";
  // The final check comes after shipping; a services shop has no shipping step to wait for.
  if (finalCheckShows(services ? { ...doc, shipping: doc.shipping ?? true } : doc, settings)) return "final";
  return null;
}
