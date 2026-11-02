// The press says yes before support makes changes (code plan 19.6): the account page's calls on the platform's one web
// door (signup/api.js `routes`). Signed in, and for the shop's owner only (accounts.js `roleIn`, as Team and Plan &
// billing check it); anyone else is refused.
//
//   GET  /api/account/access-requests?shopId=   -> { requests, visits }: the shop's support-access requests, newest
//                                                  first, and its last 10 support visits (the control room's act-as
//                                                  entries in the activity log)
//   POST /api/account/access-requests/answer    { id, approve: boolean } -> { request }: approve or decline a waiting
//                                                  request; the answer goes in the registry and the shop's audit log
import { createHash } from "node:crypto";
import { personOf, SignupError } from "../signup/signup.js";
import { pastVisits } from "../control-room/accessRequests.js";

export function accessRequestRoutes({ requests, accounts, activity = null, registry, auditLog, now = () => new Date() }) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});

  async function ownerOf(claims, shopId) {
    const person = personOf(claims);
    if (typeof shopId !== "string" || !shopId) throw new SignupError(400, "Which shop? Open this page from your shop list.");
    if ((await accounts.roleIn(person, shopId)) !== "owner") throw new SignupError(403, "Only the shop's owner can answer requests from Colophon support.");
    return person;
  }

  async function log(shopId, what, detail) {
    const at = now().toISOString();
    const entry = { id: `accounts-${at}-${what}-${createHash("sha256").update(JSON.stringify(detail)).digest("hex").slice(0, 8)}`, source: "accounts", at, what, ...detail };
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
  }

  return {
    "GET /api/account/access-requests": async (claims, request) => {
      const shopId = request.query?.shopId ?? body(request).shopId;
      await ownerOf(claims, shopId);
      return { requests: await requests.forShop(shopId), visits: await pastVisits(activity, shopId) };
    },
    "POST /api/account/access-requests/answer": async (claims, request) => {
      const { id, approve } = body(request);
      if (typeof id !== "string" || !id) throw new SignupError(400, "Which request? Open it from your shop list.");
      const shopId = await requests.shopOf(id).catch(() => null);
      // The same refusal whether the request doesn't exist or belongs to another shop: nobody learns of others' requests.
      if (!shopId) throw new SignupError(403, "Only the shop's owner can answer requests from Colophon support.");
      const person = await ownerOf(claims, shopId);
      const { request: answered, changed } = await requests.answer({ id, by: person.email, approve });
      if (changed) await log(shopId, approve ? "support-access-approved" : "support-access-declined", { by: person.email, requestId: id, asker: answered.by, reason: answered.reason });
      return { request: answered };
    },
  };
}
