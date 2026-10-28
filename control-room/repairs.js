// The repair queue (code plan 2.11): every problem that needs a person, one item per problem per shop. The shop maker
// (signup/shopMaker.js) and the self-checks (selfChecks.js) report to it; the control room lists it and a platform
// admin marks items fixed. A self-check that passes again closes its own items ("fixed itself").
//
// Reporting the same problem again never makes a second item: the open item's count and last-seen time go up. Every
// item that opens or closes is logged in the registry and, once the shop's database exists, its audit log.
//
// Clients passed in:
//   store     get(id) -> item | null; set(id, item); list({ shopId?, status? }) -> items
//   registry  recordEvent(shopId, entry)
//   auditLog  ready(shopId); write(shopId, id, entry)
import { createHash } from "node:crypto";

export const STATUSES = Object.freeze(["open", "fixed"]);

const idOf = (shopId, check, problem) => createHash("sha256").update(`${shopId}\n${check}\n${problem}`).digest("hex").slice(0, 32);
const text = (value, max) => String(value ?? "").slice(0, max);

export function createRepairQueue({ store, registry, auditLog, now = () => new Date() }) {
  const at = () => now().toISOString();

  async function log(item, what, detail = {}) {
    const stamp = at();
    const entry = { id: `repairs-${stamp}-${what}-${item.id.slice(0, 8)}`, source: "repairs", at: stamp, what, check: item.check, problem: item.problem, ...detail };
    await registry.recordEvent(item.shopId, entry);
    if (await auditLog.ready(item.shopId)) await auditLog.write(item.shopId, entry.id, entry);
  }

  async function close(item, by, note) {
    const closed = { ...item, status: "fixed", fixedAt: at(), fixedBy: by, ...(note ? { note: text(note, 500) } : {}) };
    await store.set(item.id, closed);
    await log(closed, "repair-fixed", { by, ...(note ? { note: closed.note } : {}) });
    return closed;
  }

  return {
    /** Adds a problem, or counts it again when the same one is already open. Returns { id, opened }. */
    async report({ shopId, check, problem, detail }) {
      if (!shopId || !check || !problem) throw new Error("a repair needs a shop, a check and a problem");
      const id = idOf(shopId, check, problem);
      const found = await store.get(id);
      if (found?.status === "open") {
        await store.set(id, { ...found, count: (found.count ?? 1) + 1, lastSeenAt: at(), ...(detail ? { detail: text(detail, 2000) } : {}) });
        return { id, opened: false };
      }
      // A problem fixed once and back again reopens the same item, so its history stays in one place.
      const item = {
        id, shopId, check: text(check, 80), problem: text(problem, 300), ...(detail ? { detail: text(detail, 2000) } : {}),
        status: "open", count: 1, firstSeenAt: at(), lastSeenAt: at(), ...(found ? { reopened: (found.reopened ?? 0) + 1 } : {}),
      };
      await store.set(id, item);
      await log(item, "repair-opened");
      return { id, opened: true };
    },

    /** Open items for one shop (the control room's health), oldest first. */
    async open(shopId) {
      return (await store.list({ shopId, status: "open" })).sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt));
    },

    /** Items for the control room's queue, newest first. */
    async list({ status = "open" } = {}) {
      if (!STATUSES.includes(status)) throw new Error(`status must be ${STATUSES.join(" or ")}`);
      return (await store.list({ status })).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    },

    /** A person marks an item fixed. Safe to repeat. */
    async markFixed(id, { by, note }) {
      const item = typeof id === "string" ? await store.get(id) : null;
      if (!item) return null;
      if (item.status !== "open") return item;
      return close(item, by, note);
    },

    /** A self-check passed: its open items for this shop are closed as fixed by themselves. Returns how many. */
    async passed(shopId, check) {
      const open = (await store.list({ shopId, status: "open" })).filter((item) => item.check === check);
      for (const item of open) await close(item, "self-check", "the check passes again");
      return open.length;
    },
  };
}
