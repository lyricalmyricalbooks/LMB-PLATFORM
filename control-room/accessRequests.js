// The press says yes before "Make changes" (code plan 19.6). Looking at a shop (act as, "view") needs no yes. Opening a
// shop's admin able to change it ("edit") is asked for first: the control room makes a support-access request, the
// shop's owner is emailed and answers on their account page, and only an approved, unexpired, unused request opens a
// 30-minute staff sign-in, once. Emergencies (closing a shop, moving its payments) never wait for a yes.
//
// A request: { id, shopId, by, reason, askedAt, expiresAt (24 hours on), status, answeredAt?, answeredBy?, usedAt?,
// usedBy? }. Status is waiting, approved, declined, expired or used; a waiting or approved request past its expiresAt
// reads as expired.
//
// The store (fakes.js fakeAccessRequestStore is the in-memory one; the real one is `supportAccessRequests/<id>` in the
// platform project, which no browser can read or write):
//   get(id) -> row | null; create(id, row) (refuses an id it has); listByShop(shopId) -> rows
//   update(id, fn) -> row | null: reads the row, writes fn's answer, atomically (a transaction), so of two "use"s
//   started together only one can open the shop
import { randomBytes } from "node:crypto";
import { dateText } from "../services/billing/billing.js";

/** How long the press has to answer, and how long an approved request can be used. */
export const REQUEST_HOURS = 24;
/** How many past support visits the account page shows. */
export const VISITS_SHOWN = 10;
export const STATUSES = Object.freeze(["waiting", "approved", "declined", "expired", "used"]);

export class AccessRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** The request's status at `nowMs`: a waiting or approved request past its time reads as expired. */
export function statusAt(row, nowMs) {
  if ((row.status === "waiting" || row.status === "approved") && Date.parse(row.expiresAt) <= nowMs) return "expired";
  return row.status;
}

/** What a page may show of a request. */
export function requestView(row, nowMs) {
  const view = { id: row.id, shopId: row.shopId, by: row.by, reason: row.reason, askedAt: row.askedAt, expiresAt: row.expiresAt, status: statusAt(row, nowMs) };
  for (const key of ["answeredAt", "answeredBy", "usedAt", "usedBy"]) if (row[key]) view[key] = row[key];
  return view;
}

/** The words for a request that can't open the shop, in plain English. */
const NOT_OPEN = {
  waiting: "The press hasn't said yes yet. Their admin opens once they approve on their account page.",
  declined: "The press said no, so their admin can't be opened to make changes. Ask again if something changes.",
  expired: "That request ran out after 24 hours. Ask the press again.",
  used: "That yes has been used. Ask the press again for another visit.",
};

export function createAccessRequests({ store, email = null, settings, now = () => new Date(), newId = () => randomBytes(12).toString("base64url") }) {
  const nowMs = () => now().getTime();

  async function mine(id, shopId) {
    const row = typeof id === "string" && id ? await store.get(id) : null;
    if (!row || (shopId && row.shopId !== shopId)) throw new AccessRequestError(404, "There's no such request for this shop.");
    return row;
  }

  return {
    /** A new waiting request (the control room logs it, then emails the owner with `tellOwner`). */
    async ask({ shopId, by, reason }) {
      const askedAt = new Date(nowMs()).toISOString();
      const row = { id: newId(), shopId, by, reason, askedAt, expiresAt: new Date(nowMs() + REQUEST_HOURS * 3600_000).toISOString(), status: "waiting" };
      await store.create(row.id, row);
      return requestView(row, nowMs());
    },

    /** Emails the shop's owner: who, why, and the way to approve or decline. False when the email didn't go. */
    async tellOwner(request, shop) {
      if (!email || !shop?.ownerEmail) return false;
      try {
        await email.sendPlatform({
          kind: "support-access-request", to: shop.ownerEmail, shopId: request.shopId, idempotencyKey: `support-access-request/${request.id}`,
          data: { pressName: shop.pressName || request.shopId, by: request.by, reason: request.reason, until: dateText(request.expiresAt), link: `${settings.platformUrl}/accounts/` },
        });
        return true;
      } catch {
        return false;
      }
    },

    /** A shop's requests, newest first. */
    async forShop(shopId) {
      const rows = await store.listByShop(shopId);
      return rows.sort((a, b) => (a.askedAt < b.askedAt ? 1 : -1)).map((row) => requestView(row, nowMs()));
    },

    /**
     * The press answers: only a waiting request that hasn't run out. Safe to repeat with the same answer (`changed` is
     * false then). Answers { request, changed }.
     */
    async answer({ id, by, approve }) {
      if (typeof approve !== "boolean") throw new AccessRequestError(400, "Say yes or no.");
      const want = approve ? "approved" : "declined";
      let refusal = null;
      let changed = false;
      const row = await store.update(id, (current) => {
        if (!current) return current;
        const status = statusAt(current, nowMs());
        if (status === want) return current;
        if (status !== "waiting") {
          refusal = status === "expired" ? "That request ran out after 24 hours. If you still want help, ask us again." : "That request has already been answered.";
          return current;
        }
        changed = true;
        return { ...current, status: want, answeredAt: new Date(nowMs()).toISOString(), answeredBy: by };
      });
      if (!row) throw new AccessRequestError(404, "There's no such request.");
      if (refusal) throw new AccessRequestError(409, refusal);
      return { request: requestView(row, nowMs()), changed };
    },

    /** The request's shop, before an answer (the account door checks its owner). */
    async shopOf(id) {
      return (await mine(id)).shopId;
    },

    /** The control room uses an approved request: once, for that shop, before it runs out. */
    async use({ id, shopId, by }) {
      await mine(id, shopId);
      let refused = null;
      const row = await store.update(id, (current) => {
        const status = statusAt(current, nowMs());
        if (status !== "approved") {
          refused = status;
          return current;
        }
        return { ...current, status: "used", usedAt: new Date(nowMs()).toISOString(), usedBy: by };
      });
      // No yes (waiting, declined) is "not allowed"; a yes that ran out or was used conflicts with what happened.
      if (refused) throw new AccessRequestError(refused === "waiting" || refused === "declined" ? 403 : 409, NOT_OPEN[refused] ?? "That request can't open the shop.");
      return row;
    },

    /** Gives a yes back when the sign-in couldn't be made, so the visit can be tried again. */
    async unuse(id) {
      await store.update(id, (current) => {
        if (current?.status !== "used") return current;
        const { usedAt: _usedAt, usedBy: _usedBy, ...rest } = current;
        return { ...rest, status: "approved" };
      });
    },
  };
}

/** The last support visits to a shop (act-as entries from the control room's activity log), newest first. */
export async function pastVisits(activity, shopId, limit = VISITS_SHOWN) {
  if (!activity) return [];
  const entries = await activity.list({ shopId, limit: 200 });
  return entries.filter((entry) => entry.what === "act-as").slice(0, limit).map((entry) => ({
    at: entry.at, by: entry.by, mode: entry.detail?.mode === "edit" ? "edit" : "view", reason: entry.detail?.reason ?? "", until: entry.detail?.expiresAt ?? null,
  }));
}

/**
 * The control room's "Make changes" (controlRoom.js actAs with mode "edit"). Without `requestId` it asks the press and
 * logs the ask; with an approved request it uses it, logs the visit and makes the 30-minute staff sign-in. `log`,
 * `reasonOf` and `shopOr404` are the control room's own.
 */
export async function editVisit({ requests, shopAccess, log, reasonOf, shopOr404, minutes, now }, by, { shopId, reason, requestId }) {
  if (!requests) throw new AccessRequestError(503, "Making changes needs the press's yes, and asking them isn't set up here.");
  const row = await shopOr404(shopId);
  if (row.status !== "live") throw new AccessRequestError(409, "That shop isn't live yet, so there's no admin to open.");
  if (!requestId) {
    const why = reasonOf(reason);
    const request = await requests.ask({ shopId, by, reason: why });
    await log(shopId, "access-asked", { by, reason: why, requestId: request.id, expiresAt: request.expiresAt });
    const emailed = await requests.tellOwner(request, row);
    return { shopId, mode: "edit", asked: true, emailed, request };
  }
  const request = await requests.use({ id: requestId, shopId, by });
  const expiresAt = new Date(now().getTime() + minutes * 60_000).toISOString();
  try {
    // Logged before the sign-in is made, as every visit is; no log, no sign-in.
    await log(shopId, "act-as", { by, reason: request.reason, expiresAt, mode: "edit", requestId });
    const { url } = await shopAccess.supportSignIn(shopId, { by, reason: request.reason, minutes, mode: "edit" });
    return { shopId, url, expiresAt, mode: "edit", requestId };
  } catch (error) {
    await requests.unuse(requestId);
    throw error;
  }
}
