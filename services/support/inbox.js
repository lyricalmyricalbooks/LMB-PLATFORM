// The support inbox (plan 4.4): presses ask for help from their account page, and the platform team answers from the
// control room. Each request is a ticket in the platform project (`support/<id>`); every message on it is kept, and
// the press gets each answer by email.
//
//   createSupportInbox({ store, email, registry, roleIn, settings, admins, now, newId })
//
// Who may do what:
// - A signed-in person with a confirmed email opens a ticket, adds to their own tickets and reads them. Naming a shop is
//   optional; a named shop must be one they have a role in (`roleIn`, accounts/accounts.js), so nobody can file in
//   another press's name.
// - Platform admins (control room, PLATFORM_ADMIN_EMAILS) list every ticket, answer and close.
// Limits: MAX_OPEN_PER_DAY new tickets per person a day; text lengths below. A double press of Send is one ticket (the
// page's `requestId`).
//
// Clients passed in:
//   store     get(id); put(id, ticket); list({ status, limit }) newest first; listByEmail(email); countSince(email, iso)
//   email     sendPlatform({ kind, to, data, idempotencyKey, shopId? }) (services/email)
//   registry  getShop(shopId) for the press's name
import { createHash, randomBytes } from "node:crypto";
import { adminOf } from "../../control-room/controlRoom.js";
import { SignupError, personOf } from "../../signup/signup.js";

export const MAX_OPEN_PER_DAY = 10;
export const LIMITS = Object.freeze({ subject: 150, body: 5000 });
export const STATUSES = Object.freeze(["open", "answered", "closed"]);

const clean = (value) => (typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "");

function words({ subject, body }, { needSubject = true } = {}) {
  const problems = {};
  const s = clean(subject).replace(/\s+/g, " ");
  const b = clean(body);
  if (needSubject && !s) problems.subject = "Say in a few words what it's about.";
  if (s.length > LIMITS.subject) problems.subject = `Keep it under ${LIMITS.subject} characters.`;
  if (b.length < 10) problems.body = "Tell us a little more, so we can help.";
  if (b.length > LIMITS.body) problems.body = `Keep it under ${LIMITS.body} characters.`;
  if (Object.keys(problems).length) throw new SignupError(400, "Check the highlighted fields.", problems);
  return { subject: s, body: b };
}

/** What a press sees of a ticket: no admin addresses. */
const forPress = (t) => ({
  id: t.id, subject: t.subject, status: t.status, shopId: t.shopId, pressName: t.pressName, openedAt: t.openedAt, updatedAt: t.updatedAt,
  messages: t.messages.map(({ from, body, at }) => ({ from: from === "press" ? "you" : "support", body, at })),
});

export function createSupportInbox({ store, email, registry, roleIn, settings, admins, now = () => new Date(), newId = () => randomBytes(6).toString("hex") }) {
  const at = () => now().toISOString();

  async function ticketOf(person, id) {
    const ticket = typeof id === "string" && /^[a-z0-9-]{6,64}$/.test(id) ? await store.get(id) : null;
    // One answer for "no such ticket" and "not yours", so ids can't be fished for.
    if (!ticket || ticket.email !== person.email) throw new SignupError(404, "We couldn't find that request.");
    return ticket;
  }

  async function adminTicket(id) {
    const ticket = typeof id === "string" && /^[a-z0-9-]{6,64}$/.test(id) ? await store.get(id) : null;
    if (!ticket) throw new SignupError(404, "There's no such request.");
    return ticket;
  }

  return {
    /** A signed-in person asks for help. `{ subject, body, shopId?, requestId }` -> { ticket }. */
    async open(claims, input = {}) {
      const person = personOf(claims);
      const { subject, body } = words(input);
      let shopId = null;
      let pressName = null;
      if (input.shopId) {
        if (typeof input.shopId !== "string" || !(await roleIn(person, input.shopId))) throw new SignupError(403, "You're not on that shop's team.");
        shopId = input.shopId;
        pressName = (await registry.getShop(shopId))?.pressName ?? shopId;
      }
      // The same Send twice (a double press, a retry after a dropped connection) is one ticket.
      const requestId = typeof input.requestId === "string" && /^[A-Za-z0-9-]{8,64}$/.test(input.requestId) ? input.requestId : null;
      const id = requestId ? createHash("sha256").update(`${person.email} ${requestId}`).digest("hex").slice(0, 12) : newId();
      const existing = await store.get(id);
      if (existing) {
        if (existing.email !== person.email) throw new SignupError(409, "Try sending that again.");
        return { ticket: forPress(existing) };
      }
      const since = new Date(now().getTime() - 24 * 3600_000).toISOString();
      if ((await store.countSince(person.email, since)) >= MAX_OPEN_PER_DAY) {
        throw new SignupError(429, `You've sent ${MAX_OPEN_PER_DAY} requests today. Add to one you've already sent, or try again tomorrow.`);
      }
      const ticket = {
        id, email: person.email, shopId, pressName, subject, status: "open", openedAt: at(), updatedAt: at(),
        messages: [{ from: "press", by: person.email, body, at: at() }],
      };
      await store.put(id, ticket);
      const data = { pressName: pressName ?? "", ticketId: id, subject, body, from: person.email };
      await email.sendPlatform({ kind: "support-received", to: person.email, shopId, data, idempotencyKey: `support-${id}-received` });
      await email.sendPlatform({ kind: "support-new", to: settings.supportEmail, shopId, data, idempotencyKey: `support-${id}-new` });
      return { ticket: forPress(ticket) };
    },

    /** The person's own requests, newest first. */
    async mine(claims) {
      const person = personOf(claims);
      return { tickets: (await store.listByEmail(person.email)).map(forPress) };
    },

    /** The person adds to their own request (it opens again if it was answered or closed). */
    async addTo(claims, { id, body } = {}) {
      const person = personOf(claims);
      const ticket = await ticketOf(person, id);
      const { body: text } = words({ body }, { needSubject: false });
      ticket.messages.push({ from: "press", by: person.email, body: text, at: at() });
      Object.assign(ticket, { status: "open", updatedAt: at() });
      await store.put(ticket.id, ticket);
      await email.sendPlatform({
        kind: "support-new", to: settings.supportEmail, shopId: ticket.shopId,
        data: { pressName: ticket.pressName ?? "", ticketId: ticket.id, subject: ticket.subject, body: text, from: person.email, followUp: true },
        idempotencyKey: `support-${ticket.id}-press-${ticket.messages.length}`,
      });
      return { ticket: forPress(ticket) };
    },

    // ── The platform team, from the control room ──

    /** Every request with this status (default open), oldest waiting first. */
    async list(claims, { status = "open" } = {}) {
      adminOf(claims, admins);
      if (!STATUSES.includes(status)) throw new SignupError(400, "Pick open, answered or closed.");
      const tickets = await store.list({ status, limit: 200 });
      return { tickets: tickets.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1)) };
    },

    /** An answer, emailed to the person who asked. */
    async answer(claims, { id, body } = {}) {
      const by = adminOf(claims, admins);
      const ticket = await adminTicket(id);
      const { body: text } = words({ body }, { needSubject: false });
      ticket.messages.push({ from: "support", by, body: text, at: at() });
      Object.assign(ticket, { status: "answered", updatedAt: at() });
      await store.put(ticket.id, ticket);
      await email.sendPlatform({
        kind: "support-reply", to: ticket.email, shopId: ticket.shopId,
        data: { pressName: ticket.pressName ?? "", ticketId: ticket.id, subject: ticket.subject, body: text },
        idempotencyKey: `support-${ticket.id}-reply-${ticket.messages.length}`,
      });
      return { ticket };
    },

    async close(claims, { id } = {}) {
      const by = adminOf(claims, admins);
      const ticket = await adminTicket(id);
      if (ticket.status === "closed") return { ticket };
      Object.assign(ticket, { status: "closed", closedBy: by, updatedAt: at() });
      await store.put(ticket.id, ticket);
      return { ticket };
    },
  };
}
