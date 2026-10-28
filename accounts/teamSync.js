// People the owner adds in the shop's own admin (Settings › Team) show up in the account switcher (code plan 5.11).
//
// The shop's own team list (`members/<email>` in the shop's database) is the one truth: the shop's rules and sign-in
// passes read it. The platform's `memberships` rows are only a copy, kept so the switcher can list a person's shops.
// This module makes the copy match the list for ONE shop:
//
//   - someone in the shop's list but not in the copy is added;
//   - someone whose role differs gets the shop's role;
//   - someone in the copy but no longer in the shop's list is taken out.
//
// Removing someone on the account page already deletes the shop's document and the copy together (accounts.js
// `remove`); removing them in the shop deletes the document, and the next sync takes out the copy. So a removal in
// either place ends up in both.
//
// Safety:
//   - A sync is for one shop id and reads only that shop's own database. Every row it writes or removes carries that
//     shop id, so one shop's list can never add, change or remove anyone on another shop.
//   - The shop's door (`handleTeamChanged`) takes no data from the shop at all: the shop proves who it is with its
//     service key and the platform re-reads that shop's list itself. A body naming another shop changes nothing.
//   - Roles are the shop's own list (`roles`, by default accounts/roles.js ROLES, which a test keeps equal to
//     apps/shop/functions/roles.js ROLES). A document with any other role is ignored, as the shop itself ignores it.
//   - The shop's own owner address (registry `ownerEmail`) always counts as owner and is never copied.
//   - Safe to run again: a second run finds nothing to change and writes nothing. Each change is logged once in the
//     registry and the shop's audit log, with an id made from what changed.
//
// Clients (the same as accounts.js):
//   memberships   get, set, remove, listByShop
//   registry      getShop(shopId), listShops(), recordEvent(shopId, entry)
//   shopData      list(projectId, "members") -> [{ id, data }]  (a shop's project id is its shop id)
//   auditLog      ready(shopId); write(shopId, id, entry)
import { createHash } from "node:crypto";
import { ROLES } from "./roles.js";
import { leftOut } from "../services/release-runner/rings.js";
import { serviceKeyMatches } from "../services/email/http.js";

const EMAIL = /^[^\s@<>"',;/]+@[^\s@<>"',;/]+\.[^\s@<>"',;/]+$/;
const normal = (email) => String(email ?? "").trim().toLowerCase();
const short = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);

export function createTeamSync({ memberships, registry, shopData, auditLog, roles = ROLES, now = () => new Date() }) {
  const at = () => now().toISOString();

  async function log(shopId, what, detail) {
    const when = at();
    const entry = { id: `team-sync-${when}-${what}-${short(`${shopId} ${JSON.stringify(detail)}`)}`, source: "accounts", at: when, what, from: "shop-team", ...detail };
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
  }

  /** The shop's own team list, as { email: role }: valid addresses with a role the shop knows, never the owner address. */
  async function shopTeam(shopId, ownerEmail) {
    const team = new Map();
    for (const doc of await shopData.list(shopId, "members")) {
      const email = normal(doc?.id);
      const role = doc?.data?.role;
      if (!EMAIL.test(email) || email.length > 254 || email === ownerEmail || !roles.includes(role)) continue;
      team.set(email, role);
    }
    return team;
  }

  /** Makes the switcher's copy of one shop's team match the shop's own list. Returns what changed. */
  async function syncShop(shopId) {
    if (typeof shopId !== "string" || !shopId) throw new Error("syncShop needs a shop id");
    const row = await registry.getShop(shopId);
    if (!row) throw new Error(`${shopId} isn't in the registry`);
    const ownerEmail = normal(row.ownerEmail);
    const team = await shopTeam(shopId, ownerEmail);
    const copy = new Map((await memberships.listByShop(shopId)).filter((m) => m.shopId === shopId).map((m) => [normal(m.email), m]));
    const result = { shopId, added: [], changed: [], removed: [] };

    for (const [email, role] of team) {
      const had = copy.get(email);
      if (!had) {
        await memberships.set(shopId, email, { shopId, email, role, addedBy: "shop-team", addedAt: at() });
        await log(shopId, "member-added-in-shop", { email, role });
        result.added.push({ email, role });
      } else if (had.role !== role) {
        await memberships.set(shopId, email, { ...had, shopId, email, role });
        await log(shopId, "role-changed-in-shop", { email, from: had.role, to: role });
        result.changed.push({ email, from: had.role, to: role });
      }
    }
    for (const [email, had] of copy) {
      if (team.has(email)) continue;
      await memberships.remove(shopId, email);
      await log(shopId, "member-removed-in-shop", { email, role: had.role });
      result.removed.push({ email, role: had.role });
    }
    return result;
  }

  /** Every live shop, one at a time; one shop's failure never stops the others. */
  async function syncAll() {
    const results = [];
    for (const row of (await registry.listShops()).filter((r) => !leftOut(r))) {
      try {
        results.push(await syncShop(row.shopId));
      } catch (error) {
        results.push({ shopId: row.shopId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }

  return { syncShop, syncAll };
}

const header = (headers, name) => {
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return typeof found?.[1] === "string" ? found[1] : "";
};

/**
 * The shop's door: `POST /team-changed` with `X-Shop-Id` + `Authorization: Bearer <shop service key>`, called by the
 * shop's server whenever Settings › Team changes. Nothing in the body is read: the platform re-reads that shop's list.
 */
export async function handleTeamChanged(request, { registry, teamSync }) {
  if (request?.method !== "POST") return { status: 405, body: { ok: false, message: "Send a POST." } };
  const shopId = header(request.headers, "x-shop-id");
  const key = header(request.headers, "authorization").replace(/^Bearer\s+/i, "");
  const row = shopId ? await registry.getShop(shopId) : null;
  // One answer for "no such shop" and "wrong key", so the door can't be used to find shop ids.
  if (!row || !serviceKeyMatches(key, row.serviceKeyHash)) return { status: 401, body: { ok: false, message: "This shop can't reach the platform's accounts." } };
  try {
    const { added, changed, removed } = await teamSync.syncShop(shopId);
    return { status: 200, body: { ok: true, added: added.length, changed: changed.length, removed: removed.length } };
  } catch {
    return { status: 503, body: { ok: false, retryable: true, message: "The platform couldn't read the shop's team just now." } };
  }
}
