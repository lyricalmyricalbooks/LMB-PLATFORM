// The account recovery review queue (plan 4.5): someone who has lost the email address their Colophon account uses
// asks to move it to a new address, and a platform admin decides. Nothing moves on a request alone.
//
// How a request goes:
//   1. The person signs in with the NEW address (so it is proven theirs) and asks, naming the old address and saying
//      how we can check it's them. The old address is emailed at once: if that wasn't its owner asking, they sign in
//      and cancel. The person asking is never told whether the old address has an account.
//   2. A platform admin reviews it in the control room: approve (with a note on how they checked) or deny (with the
//      reason the person is sent). Approving starts a HOLD_HOURS wait, and the old address is emailed again.
//   3. After the wait, if nobody cancelled, the admin applies it (`applyRecovery`, passed in). Every step is kept on the
//      request and logged to each shop the old address owns.
// The old address's owner can cancel at any time before it is applied; the person asking can withdraw.
//
//   createRecovery({ store, email, registry, auditLog, findAccount, applyRecovery, settings, admins, now, newId })
//   store: get(id); put(id, row); list({ status }); listByRequester(email); listByOld(email); countSince(email, iso)
//   findAccount(email) -> { accountId } | null: the platform account that signs in with that address
//   applyRecovery({ from, to, accountId, shops, doneByHand }) does the move; `recoveryByHand` below until it's automatic
import { randomBytes } from "node:crypto";
import { adminOf } from "../control-room/controlRoom.js";
import { SignupError, personOf } from "../signup/signup.js";

export const HOLD_HOURS = 72;
export const MAX_REQUESTS_PER_WEEK = 3;
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const OPEN = ["waiting", "approved"];

const text = (value) => (typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "");

/** What the person asking sees: no note from the team, no shops, nothing that says whether the old account exists. */
const forRequester = (r) => ({ id: r.id, oldEmail: r.oldEmail, status: r.status, askedAt: r.askedAt, holdUntil: r.holdUntil ?? null, reason: r.status === "denied" ? r.reason : null });
/** What the old address's owner sees: who asked, so they can tell whether it was them. */
const forOwner = (r) => ({ id: r.id, requesterEmail: r.requesterEmail, status: r.status, askedAt: r.askedAt, holdUntil: r.holdUntil ?? null });

export function createRecovery({ store, email, registry, auditLog, findAccount, applyRecovery, settings, admins, now = () => new Date(), newId = () => randomBytes(6).toString("hex") }) {
  const at = () => now().toISOString();

  async function ownedShops(address) {
    return (await registry.listShops()).filter((row) => String(row.ownerEmail ?? "").toLowerCase() === address).map((row) => row.shopId);
  }

  async function log(request, what, detail = {}) {
    const entry = { at: at(), what, ...detail };
    request.history = [...(request.history ?? []), entry];
    for (const shopId of request.shops ?? []) {
      const id = `recovery-${request.id}-${what}-${entry.at}`;
      const event = { id, source: "recovery", requestId: request.id, from: request.oldEmail, to: request.requesterEmail, ...entry };
      await registry.recordEvent(shopId, event);
      if (await auditLog.ready(shopId)) await auditLog.write(shopId, id, event);
    }
  }

  async function load(id) {
    const row = typeof id === "string" && /^[a-z0-9]{6,32}$/.test(id) ? await store.get(id) : null;
    if (!row) throw new SignupError(404, "There's no such request.");
    return row;
  }

  const mail = (kind, to, request, extra = {}) => email.sendPlatform({
    kind, to, idempotencyKey: `recovery-${request.id}-${kind}-${to}-${request.status}`,
    data: { requestId: request.id, oldEmail: request.oldEmail, newEmail: request.requesterEmail, holdUntil: request.holdUntil ?? null, ...extra },
  });

  return {
    /** Signed in with the new address: ask to move the account from `oldEmail`. */
    async ask(claims, input = {}) {
      const person = personOf(claims);
      const oldEmail = text(input.oldEmail).toLowerCase();
      const details = text(input.details);
      const problems = {};
      if (!EMAIL.test(oldEmail)) problems.oldEmail = "Enter the email address you used to sign in.";
      else if (oldEmail === person.email) problems.oldEmail = "That's the address you're signed in with now. Enter the one you've lost.";
      if (details.length < 20) problems.details = "Tell us how we can check it's you: your press, your shop's address, a recent order.";
      if (details.length > 3000) problems.details = "Keep it under 3,000 characters.";
      if (Object.keys(problems).length) throw new SignupError(400, "Check the highlighted fields.", problems);

      const same = (await store.listByRequester(person.email)).find((r) => r.oldEmail === oldEmail && OPEN.includes(r.status));
      if (same) return { request: forRequester(same) };
      const since = new Date(now().getTime() - 7 * 24 * 3600_000).toISOString();
      if ((await store.countSince(person.email, since)) >= MAX_REQUESTS_PER_WEEK) {
        throw new SignupError(429, "You've asked several times this week. We'll answer the requests you've sent.");
      }
      const account = await findAccount(oldEmail);
      const request = {
        id: newId(), requesterEmail: person.email, requesterUid: person.accountId, oldEmail, details,
        accountId: account?.accountId ?? null, shops: await ownedShops(oldEmail), status: "waiting", askedAt: at(), history: [],
      };
      await log(request, "asked");
      await store.put(request.id, request);
      await mail("recovery-asked", oldEmail, request);
      await mail("recovery-received", person.email, request);
      await mail("recovery-new", settings.supportEmail, request, { accountFound: Boolean(account), shopCount: request.shops.length });
      return { request: forRequester(request) };
    },

    /** The signed-in person's own requests, and any open request to move their account away. */
    async mine(claims) {
      const person = personOf(claims);
      const asked = (await store.listByRequester(person.email)).map(forRequester);
      const againstMe = (await store.listByOld(person.email)).filter((r) => OPEN.includes(r.status)).map(forOwner);
      return { asked, againstMe };
    },

    /** The old address's owner stops it, or the person asking withdraws it. Any time before it is applied. */
    async cancel(claims, { id } = {}) {
      const person = personOf(claims);
      const request = await load(id);
      const owner = request.oldEmail === person.email;
      if (!owner && request.requesterEmail !== person.email) throw new SignupError(404, "There's no such request.");
      if (!OPEN.includes(request.status)) throw new SignupError(409, "That request is already settled.");
      request.status = owner ? "cancelled" : "withdrawn";
      await log(request, request.status, { by: person.email });
      await store.put(request.id, request);
      await mail("recovery-stopped", settings.supportEmail, request, { by: owner ? "the account's owner" : "the person who asked" });
      if (owner) await mail("recovery-stopped", request.requesterEmail, request, { by: "the account's owner" });
      return owner ? { request: forOwner(request) } : { request: forRequester(request) };
    },

    // ── Platform admins, from the control room ──

    async queue(claims, { status = "waiting" } = {}) {
      adminOf(claims, admins, now().getTime());
      const rows = await store.list({ status });
      return { requests: rows.sort((a, b) => (a.askedAt < b.askedAt ? -1 : 1)) };
    },

    /** Approve, with a note on how the person was checked. The move waits HOLD_HOURS for the old owner to object. */
    async approve(claims, { id, note } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      if (text(note).length < 10) throw new SignupError(400, "Say how you checked it's them (at least 10 characters).");
      const request = await load(id);
      if (request.status !== "waiting") throw new SignupError(409, "Only a waiting request can be approved.");
      request.status = "approved";
      request.holdUntil = new Date(now().getTime() + HOLD_HOURS * 3600_000).toISOString();
      await log(request, "approved", { by, note: text(note) });
      await store.put(request.id, request);
      await mail("recovery-approved", request.oldEmail, request);
      await mail("recovery-approved", request.requesterEmail, request);
      return { request };
    },

    async deny(claims, { id, reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      if (text(reason).length < 10) throw new SignupError(400, "Give the reason the person will be sent (at least 10 characters).");
      const request = await load(id);
      if (!OPEN.includes(request.status)) throw new SignupError(409, "That request is already settled.");
      request.status = "denied";
      request.reason = text(reason);
      await log(request, "denied", { by, reason: request.reason });
      await store.put(request.id, request);
      await mail("recovery-denied", request.requesterEmail, request, { reason: request.reason });
      return { request };
    },

    /** After the wait, with nobody objecting: the move itself. */
    async apply(claims, { id, doneByHand = false } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const request = await load(id);
      if (request.status !== "approved") throw new SignupError(409, "Only an approved request can be applied.");
      if (now().toISOString() < request.holdUntil) throw new SignupError(409, `The old address has until ${request.holdUntil} to object.`);
      // Looked up again: shops bought or handed over since the request are moved too.
      const shops = await ownedShops(request.oldEmail);
      const result = await applyRecovery({ from: request.oldEmail, to: request.requesterEmail, accountId: request.accountId, shops, doneByHand: doneByHand === true });
      request.shops = [...new Set([...(request.shops ?? []), ...shops])];
      request.status = "applied";
      await log(request, "applied", { by, result: result ?? null });
      await store.put(request.id, request);
      await mail("recovery-applied", request.requesterEmail, request);
      await mail("recovery-applied", request.oldEmail, request);
      return { request };
    },
  };
}

/**
 * Until the move is automatic, an admin makes it by hand ("Recovery: applying" in accounts/README.md) and then applies
 * with `doneByHand: true`, which records it. Applying without it stops and says so.
 */
export async function recoveryByHand({ doneByHand }) {
  if (doneByHand !== true) {
    throw new SignupError(409, "Moving an account isn't automatic yet. Follow \"Recovery: applying\" in accounts/README.md, then tick \"Done by hand\" and apply.");
  }
  return { byHand: true };
}
