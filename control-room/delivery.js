// Payments and email delivery per shop (code plan 19.12): over the last 7 days, how many Stripe events came in for the
// shop and how many failed, and how many emails it sent and how many bounced or were marked as spam. Shown on the shop's
// record and fed to its health (controlRoom.js shopHealth), which adds a "look" reason past either line below.
//
//   deliveryCounts({ shopId, deliveryStats?, sentLog?, reputation?, now, days })
//     -> { payments: { received, failed }, email: { sent, bounced, complained }, since }
//   deliveryReasons(delivery) -> plain-word reasons, empty when nothing needs a look
//   deliveryReader(deps) -> (shopId) -> counts: what createControlRoom takes as `delivery`
//
// Where the counts come from (nothing is counted twice):
//   deliveryStats  count(shopId, kind, sinceIso): the payment service counts each Stripe event ("payment-event") and
//                  each it answered with a failure ("payment-event-failed") (services/payments/service.js)
//   sentLog        countSince(shopId, sinceIso): every email the shop sent (the email service's sent log)
//   reputation     events(shopId, sinceIso): the bounces and spam reports the newsletter guard already counts
//                  (services/email/reputation.js). Only newsletter emails are reported back that way, so the bounce
//                  rate here is never higher than the real one.

export const DELIVERY_DAYS = 7;
/** A bounce rate over this share of emails sent, counted only once at least BOUNCE_MIN_SENT were sent, needs a look. */
export const BOUNCE_RATE = 0.05;
export const BOUNCE_MIN_SENT = 20;
/** More failed payment events than this in the window needs a look. */
export const FAILED_PAYMENTS = 3;

export async function deliveryCounts({ shopId, deliveryStats, sentLog, reputation, now = () => new Date(), days = DELIVERY_DAYS }) {
  const since = new Date(now().getTime() - days * 86_400_000).toISOString();
  const count = async (kind) => (deliveryStats ? deliveryStats.count(shopId, kind, since) : 0);
  const problems = reputation ? await reputation.events(shopId, since) : [];
  return {
    since,
    payments: { received: await count("payment-event"), failed: await count("payment-event-failed") },
    email: {
      sent: sentLog ? await sentLog.countSince(shopId, since) : 0,
      bounced: problems.filter((e) => e.kind === "bounces").length,
      complained: problems.filter((e) => e.kind === "complaints").length,
    },
  };
}

/** Why a shop's delivery needs a look, in plain words (for shopHealth's "watch" reasons). */
export function deliveryReasons(delivery) {
  if (!delivery) return [];
  const reasons = [];
  const { sent = 0, bounced = 0 } = delivery.email ?? {};
  if (sent >= BOUNCE_MIN_SENT && bounced / sent > BOUNCE_RATE) {
    reasons.push(`${bounced} of ${sent} emails bounced in the last ${DELIVERY_DAYS} days (${Math.round((bounced / sent) * 1000) / 10}%)`);
  }
  const failed = delivery.payments?.failed ?? 0;
  if (failed > FAILED_PAYMENTS) reasons.push(`${failed} payment messages from Stripe or Square couldn't be passed to the shop in the last ${DELIVERY_DAYS} days`);
  return reasons;
}

/** The control room's reader (createControlRoom's `delivery`); a count that can't be read leaves the record without it. */
export function deliveryReader({ deliveryStats, sentLog, reputation, now = () => new Date() }) {
  return (shopId) => deliveryCounts({ shopId, deliveryStats, sentLog, reputation, now });
}
