// A shop's newsletter pauses itself when too many people mark it as spam or too many addresses bounce (code plan 8.3).
// Only the newsletter stream pauses: receipts, order notices and every other orders-stream email keep going, because
// a shopper waiting for a receipt never chose the newsletter.
//
// Resend reports each delivery problem as an event (`email.complained`: delivered, then marked as spam;
// `email.bounced`: the receiving server refused it for good). webhook.js checks the event is really from Resend and
// passes it here; the shop and stream come back in the event's tags (index.js tags every email with both).
//
// The limits, counted over the last 7 days of the shop's newsletter stream:
//   complaints  more than 0.3% of emails sent, and at least 2 (the large inbox providers ask bulk senders to stay
//               under 0.3%)
//   bounces     more than 4% of emails sent, and at least 5 (only "Permanent" bounces count; a full inbox is not a
//               bad address)
// The minimums stop one complaint on a small list from pausing a press.
//
// When a shop passes a limit: its newsletter pause is saved, the owner gets one plain email saying what happened and
// what to do, and the control room's repair queue gets an item. A platform admin resumes it from the control room
// (`resume`), with a reason, once the press has cleaned its list; every pause and resume is logged.
//
// Clients passed in:
//   store     getState(shopId) -> { paused, pausedAt?, resumedAt?, ... } | null; setState(shopId, state);
//             addEvent(shopId, event) -> false when the event id was already counted; events(shopId, sinceIso) -> events
//   sentLog   countSince(shopId, sinceIso, stream) -> newsletter emails sent (fakes.js; the email service writes it)
//   registry  getShop(shopId) -> { pressName, ownerEmail }; recordEvent(shopId, entry)
//   email     sendPlatform({ kind, to, data, idempotencyKey, shopId }) (this service)
//   repairs   report({ shopId, check, problem, detail }) (control-room/repairs.js)

export const WINDOW_DAYS = 7;
export const LIMITS = Object.freeze({
  complaints: Object.freeze({ rate: 0.003, atLeast: 2 }),
  bounces: Object.freeze({ rate: 0.04, atLeast: 5 }),
});
export const PAUSE_CHECK = "newsletter-reputation";

export class NewsletterPausedError extends Error {
  constructor(shopId) {
    super(`${shopId}'s newsletter is paused because too many people marked it as spam or too many addresses bounced. Receipts and order emails still go.`);
    this.code = "newsletter-paused";
    this.retryable = false;
  }
}

/** The kind of problem an event is, or null when it doesn't count. */
export function problemOf(event) {
  if (event?.type === "email.complained") return "complaints";
  if (event?.type === "email.bounced" && String(event.data?.bounce?.type ?? "").toLowerCase() === "permanent") return "bounces";
  return null;
}

/** Tags come back from Resend as { name: value }; accept the [{ name, value }] shape too. */
export function tagsOf(event) {
  const tags = event?.data?.tags;
  if (Array.isArray(tags)) return Object.fromEntries(tags.filter((t) => t && typeof t.name === "string").map((t) => [t.name, String(t.value)]));
  return tags && typeof tags === "object" ? Object.fromEntries(Object.entries(tags).map(([k, v]) => [k, String(v)])) : {};
}

/** Whether the counts pass a limit, and which. */
export function overLimit({ sent, complaints, bounces }) {
  const over = [];
  const base = Math.max(sent, 1);
  if (complaints >= LIMITS.complaints.atLeast && complaints / base > LIMITS.complaints.rate) over.push("complaints");
  if (bounces >= LIMITS.bounces.atLeast && bounces / base > LIMITS.bounces.rate) over.push("bounces");
  return over;
}

const percent = (part, whole) => `${Math.round((part / Math.max(whole, 1)) * 1000) / 10}%`;

export function createReputationGuard({ store, sentLog, registry, email, repairs, now = () => new Date() }) {
  const at = () => now().toISOString();

  async function log(shopId, what, detail) {
    const stamp = at();
    await registry.recordEvent(shopId, { id: `email-${stamp}-${what}`, source: "email", at: stamp, what, ...detail });
  }

  return {
    /** Is this shop's newsletter paused? (the email service asks before every newsletter-stream email) */
    async isPaused(shopId) {
      return (await store.getState(shopId))?.paused === true;
    },

    /**
     * Counts one delivery event. Returns { counted, paused } where `paused` is true only when this event paused the
     * shop. Events for orders-stream emails, the platform's own email, or a repeat of one already counted change nothing.
     */
    async record(event, { eventId } = {}) {
      const kind = problemOf(event);
      const tags = tagsOf(event);
      const shopId = tags.shop;
      if (!kind || !shopId || tags.stream !== "newsletter") return { counted: false, paused: false };
      const id = String(eventId || event.data?.email_id || "").slice(0, 200);
      if (!id) return { counted: false, paused: false };
      if (!(await store.addEvent(shopId, { id: `${kind}/${id}`, kind, at: event.created_at || at() }))) return { counted: false, paused: false };
      const state = await store.getState(shopId);
      if (state?.paused) return { counted: true, paused: false };

      // After a resume, only what happens next counts: the old problems were dealt with.
      const windowStart = new Date(now().getTime() - WINDOW_DAYS * 86_400_000).toISOString();
      const since = state?.resumedAt && state.resumedAt > windowStart ? state.resumedAt : windowStart;
      const recent = await store.events(shopId, since);
      const counts = {
        sent: await sentLog.countSince(shopId, since, "newsletter"),
        complaints: recent.filter((e) => e.kind === "complaints").length,
        bounces: recent.filter((e) => e.kind === "bounces").length,
      };
      const over = overLimit(counts);
      if (!over.length) return { counted: true, paused: false };

      const pause = { paused: true, pausedAt: at(), over, ...counts };
      await store.setState(shopId, pause);
      await log(shopId, "newsletter-paused", pause);
      const shop = await registry.getShop(shopId);
      const words = over.map((o) => (o === "complaints"
        ? `${counts.complaints} people marked it as spam (${percent(counts.complaints, counts.sent)})`
        : `${counts.bounces} addresses bounced (${percent(counts.bounces, counts.sent)})`));
      await repairs.report({
        shopId,
        check: PAUSE_CHECK,
        problem: "the newsletter paused itself: too many spam reports or bounces",
        detail: `In the last ${WINDOW_DAYS} days, of ${counts.sent} newsletter emails, ${words.join(" and ")}. Resume from the control room once the press has cleaned its list.`,
      });
      if (shop?.ownerEmail) {
        await email.sendPlatform({
          kind: "newsletter-paused", to: shop.ownerEmail, shopId,
          data: { pressName: shop.pressName || shopId, problems: words, days: WINDOW_DAYS },
          idempotencyKey: `${shopId}/newsletter-paused/${pause.pausedAt}`,
        });
      }
      return { counted: true, paused: true };
    },

    /** A platform admin resumes a paused newsletter (the control room), with a reason. Safe to repeat. */
    async resume(shopId, { by, reason }) {
      const pause = await store.getState(shopId);
      if (!pause?.paused) return { resumed: false };
      await store.setState(shopId, { paused: false, resumedAt: at(), resumedBy: by, lastPause: pause });
      await log(shopId, "newsletter-resumed", { by, reason, pausedAt: pause.pausedAt });
      return { resumed: true };
    },
  };
}
