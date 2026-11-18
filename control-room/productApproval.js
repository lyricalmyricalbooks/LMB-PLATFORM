// Product types that need a check (product types plan, round 2, 18 November 2026; apps/shop src/shared/typeApproval.ts).
// A shop selling alcohol, supplements or CBD keeps those products as drafts until a platform admin says yes for that
// type here. The owner asks from the product editor (the shop's own `approvalRequests/{typeId}`); the answer goes into
// the shop's `platform/approvals`, which its rules and its server read before a product of that type may go on sale or
// be sold. A no needs a reason in plain words: the owner reads it under the product's Visibility.
//
// Each answer is logged in the registry, the shop's audit log and the activity log. Answering the same way twice writes
// nothing new. The registry row keeps `approvalsWaiting` (the number of asks waiting); Today also looks at each live
// shop's asks, since an owner's ask reaches only the shop's own records.
//
// Clients passed in (as bookingsBeta.js):
//   registry  getShop(shopId); listShops(); updateShop(shopId, fields); recordEvent(shopId, entry)
//   auditLog  ready(shopId); write(shopId, id, entry)
//   shopData  get(shopId, path); set(shopId, path, data); find(shopId, collection, { where, limit }) -> [{ id, data }]
//   activity  optional: the activity log (activity.js)
import { createHash } from "node:crypto";
import { ControlError, adminOf } from "./controlRoom.js";
import { activityEntry } from "./activity.js";

/** The product types that need a check, their names and why: the shop's own list (apps/shop src/shared/typeApproval.ts
 *  and productTypes.ts), copied here because the server image carries no shop files. productApproval.test.js keeps the
 *  two equal. */
export const APPROVAL_TYPES = [
  { typeId: "supplements", name: "Supplements", why: "Health products have rules about what they may claim, and card companies ask us to check them before they go on sale." },
  { typeId: "cbd", name: "CBD and hemp", why: "Card companies allow CBD and hemp only in some places and with some licences, so we check before it goes on sale." },
  { typeId: "alcohol", name: "Wine, beer and spirits", why: "Selling alcohol needs a licence where you are, and card companies ask us to check it before it goes on sale." },
];
const APPROVAL_TYPE_IDS = APPROVAL_TYPES.map((t) => t.typeId);
const typeOf = (typeId) => APPROVAL_TYPES.find((t) => t.typeId === typeId);

/** The control room's answers, in the shop's own folder (admin-read, written only here). */
export const APPROVALS_DOC = "platform/approvals";
export const REQUESTS = "approvalRequests";
/** Longest reason a no may carry. */
export const REASON_MAX = 500;
/** Most shops Today reads for asks in one go. */
export const MAX_SHOPS_READ = 500;


export function createProductApproval({ admins, registry, auditLog, shopData, activity = null, now = () => new Date() }) {
  const at = () => now().toISOString();

  async function shopRow(claims, shopId) {
    const by = adminOf(claims, admins, now().getTime());
    const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
    if (!row) throw new ControlError(404, "There's no shop with that id.");
    if (!shopData?.find) throw new ControlError(503, "The control room can't read the shop's own records yet.");
    return { by, row };
  }

  async function log(shopId, what, detail) {
    const stamp = at();
    const entry = { id: `control-room-${stamp}-${what}-${createHash("sha256").update(JSON.stringify(detail)).digest("hex").slice(0, 8)}`, source: "control-room", at: stamp, what, ...detail };
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
    if (activity) await activity.record(activityEntry({ at: stamp, by: detail.by, what, shopId, detail }));
  }

  /** Every type that needs a check, for one shop: its answer, and the owner's ask with the note. */
  async function typesFor(shopId) {
    const answers = (await shopData.get(shopId, APPROVALS_DOC))?.types ?? {};
    const asks = Object.fromEntries((await shopData.find(shopId, REQUESTS, { limit: 20 })).map((d) => [d.id, d.data]));
    return APPROVAL_TYPE_IDS.map((typeId) => {
      const answer = answers[typeId] ?? null;
      const ask = asks[typeId] ?? null;
      const waiting = ask?.state === "waiting" && (answer?.state !== "declined" || String(ask.askedAt || "") > String(answer?.at || "")) && answer?.state !== "approved";
      return {
        typeId, name: typeOf(typeId).name, why: typeOf(typeId).why,
        state: answer?.state === "approved" ? "approved" : waiting ? "waiting" : answer?.state === "declined" ? "declined" : "not-asked",
        reason: answer?.reason ?? "", answeredAt: answer?.at ?? null, answeredBy: answer?.by ?? null,
        note: ask?.note ?? "", askedAt: ask?.askedAt ?? null,
      };
    });
  }

  async function countWaiting(shopId) {
    const waiting = (await typesFor(shopId)).filter((t) => t.state === "waiting").length;
    await registry.updateShop(shopId, { approvalsWaiting: waiting });
    return waiting;
  }

  return {
    /** The shop record's section: each type, where it stands and the owner's note. */
    async forShop(claims, { shopId } = {}) {
      await shopRow(claims, shopId);
      try {
        return { shopId, types: await typesFor(shopId) };
      } catch (failure) {
        throw new ControlError(502, `Couldn't read the shop's records: ${failure.message}`);
      }
    },

    /** Yes or no for one type in one shop. A no needs a reason; a yes may take one. Safe to repeat. */
    async decide(claims, { shopId, typeId, approve, reason } = {}) {
      const { by } = await shopRow(claims, shopId);
      if (!APPROVAL_TYPE_IDS.includes(typeId)) throw new ControlError(400, "That kind of product doesn't need a check.");
      if (typeof approve !== "boolean") throw new ControlError(400, "Say yes or no.");
      const words = String(reason ?? "").trim().slice(0, REASON_MAX);
      if (!approve && !words) throw new ControlError(400, "Say why, in a sentence the shop owner will read.");
      if (!(await auditLog.ready(shopId))) throw new ControlError(409, "The shop's records aren't ready yet.");
      const saved = (await shopData.get(shopId, APPROVALS_DOC)) ?? {};
      const before = saved.types?.[typeId];
      const state = approve ? "approved" : "declined";
      const ask = await shopData.get(shopId, `${REQUESTS}/${typeId}`);
      const askedSince = ask?.state === "waiting" && String(ask.askedAt || "") > String(before?.at || "");
      if (before?.state === state && (before.reason ?? "") === words && !askedSince) return { shopId, typeId, state, changed: false };
      const stamp = at();
      await shopData.set(shopId, APPROVALS_DOC, { ...saved, types: { ...(saved.types ?? {}), [typeId]: { state, reason: words, at: stamp, by } } });
      await log(shopId, approve ? "product-type-approved" : "product-type-declined", { by, typeId, ...(words ? { reason: words } : {}) });
      const waiting = await countWaiting(shopId);
      return { shopId, typeId, state, changed: true, waiting };
    },

    /** Every waiting ask across live shops, oldest first, for Today. One small query per live shop (asks marked
     *  waiting); the registry's count is brought into step as it goes, since a shop's ask arrives without telling us. */
    async waiting(claims) {
      adminOf(claims, admins, now().getTime());
      if (!shopData?.find) throw new ControlError(503, "The control room can't read the shops' own records yet.");
      const rows = (await registry.listShops()).filter((row) => row.status === "live" || Number(row.approvalsWaiting) > 0);
      const asks = [];
      for (const row of rows.slice(0, MAX_SHOPS_READ)) {
        try {
          const open = await shopData.find(row.shopId, REQUESTS, { where: [["state", "==", "waiting"]], limit: APPROVAL_TYPE_IDS.length });
          if (!open.length && !Number(row.approvalsWaiting)) continue;
          const types = (await typesFor(row.shopId)).filter((t) => t.state === "waiting");
          if (types.length !== Number(row.approvalsWaiting ?? 0)) await registry.updateShop(row.shopId, { approvalsWaiting: types.length });
          for (const t of types) asks.push({ shopId: row.shopId, pressName: row.pressName ?? row.shopId, typeId: t.typeId, name: t.name, note: t.note, askedAt: t.askedAt });
        } catch {
          asks.push({ shopId: row.shopId, pressName: row.pressName ?? row.shopId, typeId: null, name: "Couldn't read its asks", note: "", askedAt: null });
        }
      }
      return { asks: asks.sort((a, b) => String(a.askedAt ?? "").localeCompare(String(b.askedAt ?? ""))) };
    },

    /** Looks at one shop's asks again and keeps the registry's count right (the shop's ask arrives without telling us). */
    async recount(claims, { shopId } = {}) {
      await shopRow(claims, shopId);
      return { shopId, waiting: await countWaiting(shopId) };
    },
  };
}

//   POST /api/control/approvals          { shopId }: each type that needs a check, and where it stands
//   POST /api/control/approvals/decide   { shopId, typeId, approve, reason }: yes or no (a no needs a reason)
//   POST /api/control/approvals/recount  { shopId }: count the shop's waiting asks again
//   GET  /api/control/approvals/waiting: every waiting ask, oldest first
export function productApprovalRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/control/approvals/waiting": (claims) => desk.waiting(claims),
    "POST /api/control/approvals": (claims, request) => desk.forShop(claims, body(request)),
    "POST /api/control/approvals/decide": (claims, request) => desk.decide(claims, body(request)),
    "POST /api/control/approvals/recount": (claims, request) => desk.recount(claims, body(request)),
  };
}
