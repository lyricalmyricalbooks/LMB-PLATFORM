// Who took their data with them (control room, a shop's record; code plan 29). Two kinds, both read only:
//   - the press's own "Download your shop" zip, made in its browser: the shop writes one audit-log line of type `export`
//     ("Downloaded the whole shop: …", apps/shop admin/takeoutRun.ts);
//   - the emailed copies (services/export): the press's account-page button, the control room's own button and the one
//     sent when a shop closes, kept as `dataExports` rows (status, who asked, when, who it went to).
// So when a press says "I never got my data", the record says whether it downloaded it itself or was emailed a link.
//
// Clients passed in:
//   registry  getShop(shopId)
//   shopData  find(shopId, collection, { where, limit }) -> [{ id, data }]
//   exports   list({ shopId }) -> [dataExports rows]
import { ControlError, adminOf } from "./controlRoom.js";

export const DOWNLOAD_START = "Downloaded the whole shop";
const MAX = 20;
const startsWith = (start) => [["message", ">=", start], ["message", "<", start.slice(0, -1) + String.fromCharCode(start.at(-1).charCodeAt(0) + 1)]];

/** One audit-log line as a download, or null. */
export function downloadOf(line) {
  const message = String(line?.message ?? "");
  if (line?.type !== "export" || !message.startsWith(DOWNLOAD_START)) return null;
  return { at: line.createdAt ?? null, words: message.slice(DOWNLOAD_START.length).replace(/^:\s*/, "") };
}

/** An emailed copy as a row for the room. The link itself is never kept or shown. */
export function emailedOf(row) {
  if (!row || row.kind === "owner-lock" || !row.shopId) return null;
  const asked = row.asked === "owner" ? "the press" : row.by === "the platform" ? "closing" : "the platform";
  return { at: row.at ?? null, status: row.status ?? "making", asked, by: row.by ?? null, emailedTo: row.emailedTo ?? null, expiresAt: row.expiresAt ?? null, problem: row.status === "failed" ? row.problem ?? null : null };
}

const newest = (a, b) => String(b.at ?? "").localeCompare(String(a.at ?? ""));

export function createTookData({ admins, registry, shopData, exports, now = () => new Date() }) {
  return {
    async forShop(claims, { shopId } = {}) {
      adminOf(claims, admins, now().getTime());
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      const emailed = (await exports.list({ shopId })).map(emailedOf).filter(Boolean).sort(newest).slice(0, MAX);
      let downloads = [];
      let unreadable = false;
      if (row.status === "live" && shopData?.find) {
        try {
          downloads = (await shopData.find(shopId, "audit-log", { where: startsWith(DOWNLOAD_START), limit: MAX })).map((d) => downloadOf(d.data)).filter(Boolean).sort(newest);
        } catch {
          unreadable = true;
        }
      }
      return { shopId, downloads, emailed, unreadable, took: downloads.length + emailed.filter((e) => e.status === "ready").length > 0 };
    },
  };
}

//   POST /api/control/took-data  { shopId }: whether the press took its data, and how (read only)
export function tookDataRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return { "POST /api/control/took-data": (claims, request) => desk.forShop(claims, body(request)) };
}
