// Connections that stopped working (app store plan, fix 5, 12 November 2026): every shop's Google, QuickBooks, Facebook
// & Instagram, Pinterest or TikTok connection that the other side no longer accepts, in one list on the Shops page, so
// Colophon can tell the press before they notice. Read only, and never a token: only the shop, what stopped, since when,
// and where the press connects it again.
//
// The nightly `connection-check` job (server/jobs.js) asks Google for a fresh pass for each shop connected to it, so a
// press who changed their password or took Colophon's access away shows here the next morning even if their shop has
// been quiet. QuickBooks finds its own lost companies in its nightly run (services/accounting), and a social network is
// marked lost the first time it refuses a post (services/social).
//
// Clients passed in:
//   platform   the platform's database (clients/firestore.js): googleConnections, accountingConnections and
//              socialConnections are read, one collection at a time
//   registry   getShop(shopId) for the press's name and whether the shop is still open
//   tokens     optional: the Google link's tokens (google/tokens.js), for the nightly check
import { ControlError, adminOf, eachInTurn } from "./controlRoom.js";
import { NETWORK_NAMES } from "../services/social/endpoints.js";

const MAX = 5000;
const lastSegment = (path) => String(path ?? "").split("/").pop();

/** Where the press connects each one again, in the admin's own words. */
export const RECONNECT_WHERE = Object.freeze({
  google: "Settings › Google",
  quickbooks: "Settings › Apps › QuickBooks",
  social: "Sales channels",
});

/**
 * Every connection that stopped working, newest first:
 * [{ shopId, pressName, app, name, since, where }]. Shops that closed or were deleted are left out.
 */
export async function stoppedConnections({ platform, registry }) {
  const found = [];
  const [google, quickbooks, social] = await Promise.all([
    platform.query("googleConnections", { limit: MAX }),
    platform.query("accountingConnections", { where: [["problem", "==", "lost"]], limit: MAX }),
    platform.query("socialConnections", { where: [["problem", "==", "lost"]], limit: MAX }),
  ]);
  for (const row of google) {
    const c = row.data ?? {};
    // A grant Google refused (plan 15.15) that the press hasn't given back on purpose.
    if (c.reconnectAt && c.sealed && !c.revokedAt) found.push({ shopId: lastSegment(row.path ?? row.id), app: "google", name: "Google", since: c.reconnectAt });
  }
  for (const row of quickbooks) {
    const c = row.data ?? {};
    if (c.shopId) found.push({ shopId: c.shopId, app: "quickbooks", name: "QuickBooks", since: c.disconnectedAt ?? null });
  }
  for (const row of social) {
    const c = row.data ?? {};
    if (c.shopId && c.network && !c.disconnectedAt) found.push({ shopId: c.shopId, app: "social", name: NETWORK_NAMES[c.network] ?? c.network, since: c.lostAt ?? null });
  }
  const shops = new Map();
  await eachInTurn([...new Set(found.map((f) => f.shopId))], 5, async (shopId) => {
    shops.set(shopId, await registry.getShop(shopId).catch(() => null));
  });
  return found
    .filter((f) => { const s = shops.get(f.shopId); return s && s.status !== "closed" && s.status !== "deleted" && !s.closing?.deletedAt; })
    .map((f) => ({ ...f, pressName: shops.get(f.shopId)?.pressName ?? f.shopId, where: RECONNECT_WHERE[f.app] }))
    .sort((a, b) => (String(a.since ?? "") < String(b.since ?? "") ? 1 : -1));
}

/**
 * The nightly check: asks Google for a fresh pass for each shop with a live Google connection (a refusal is
 * remembered by google/tokens.js), then counts what stopped working. Safe to run twice.
 */
export async function runConnectionCheck({ platform, registry, tokens = null }) {
  let checked = 0;
  const problems = [];
  if (tokens) {
    const rows = await platform.query("googleConnections", { limit: MAX });
    const live = rows.filter((row) => row.data?.sealed && !row.data.revokedAt && !row.data.reconnectAt);
    await eachInTurn(live, 5, async (row) => {
      const shopId = lastSegment(row.path ?? row.id);
      try {
        await tokens.fresh(shopId);
        checked += 1;
      } catch (failure) {
        // Google didn't answer: not a lost connection, so it is tried again tomorrow.
        problems.push(`${shopId}: ${String(failure?.message ?? failure).slice(0, 120)}`);
      }
    });
  }
  const stopped = await stoppedConnections({ platform, registry });
  return { checked, stopped: stopped.length, problems };
}

export function createConnectionsDesk({ admins, platform, registry, now = () => new Date() }) {
  return {
    async stopped(claims) {
      adminOf(claims, admins, now().getTime());
      try {
        return { stopped: await stoppedConnections({ platform, registry }) };
      } catch (failure) {
        throw new ControlError(502, `Couldn't read the connections: ${failure.message}`);
      }
    },
  };
}

export function connectionsRoutes(desk) {
  return {
    "POST /api/control/connections-stopped": (claims) => desk.stopped(claims),
  };
}
