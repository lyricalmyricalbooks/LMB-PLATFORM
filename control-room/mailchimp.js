// Colophon's own Mailchimp app in the control room (services/mailchimp/app.js): whether it's switched on (its Mailchimp
// client id and secret are in place), and for each shop that added it where it stands (connecting, picking an audience,
// connected), the audience, how many newsletter readers it has added, when it last synced and the last problem
// Mailchimp reported. Read only; never a reader's address or the press's Mailchimp details.
//
// Clients passed in:
//   mailchimp    ready() -> whether the app has its id, secret, Mailchimp client and sealing key
//   connections  list() -> mailchimpShops rows
//   registry     getShop(shopId) for the press's name
import { adminOf } from "./controlRoom.js";

const STAGES = Object.freeze(["connected", "choose", "mailchimp"]);

/** One shop's row as the page shows it. */
export function mailchimpShop(row, shop) {
  return {
    shopId: row.shopId,
    pressName: shop?.pressName ?? row.shopId,
    stage: STAGES.includes(row.stage) ? row.stage : "mailchimp",
    audience: row.stage === "connected" ? row.listName ?? null : null,
    added: Number(row.added) || 0,
    connectedAt: row.connectedAt ?? null,
    lastSyncAt: row.lastSyncAt ?? null,
    lastProblem: row.lastProblem?.words ? { words: String(row.lastProblem.words).slice(0, 200), at: row.lastProblem.at ?? null } : null,
  };
}

export function createMailchimpDesk({ admins, mailchimp, connections, registry, now = () => new Date() }) {
  return {
    async overview(claims) {
      adminOf(claims, admins, now().getTime());
      const rows = connections?.list ? await connections.list() : [];
      const shops = [];
      for (const row of rows) shops.push(mailchimpShop(row, await registry.getShop(row.shopId).catch(() => null)));
      // Problems first, then shops still connecting, then by name.
      const rank = (s) => (s.lastProblem ? 0 : s.stage !== "connected" ? 1 : 2);
      shops.sort((a, b) => rank(a) - rank(b) || a.pressName.localeCompare(b.pressName));
      return {
        ready: Boolean(mailchimp?.ready?.()),
        shops,
        counts: { connected: shops.filter((s) => s.stage === "connected").length, problems: shops.filter((s) => s.lastProblem).length, added: shops.reduce((n, s) => n + s.added, 0) },
      };
    },
  };
}

//   POST /api/control/mailchimp  {}: whether Mailchimp is on, and each shop that added it (read only)
export function mailchimpDeskRoutes(desk) {
  return { "POST /api/control/mailchimp": (claims) => desk.overview(claims) };
}
