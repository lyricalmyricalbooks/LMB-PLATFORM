// The breach register (code plan 8.6): every privacy breach the platform finds, written down whether or not it had to
// be reported, as Canada's privacy law asks (a record of every breach of security safeguards, kept for at least 24
// months). Each entry says when it was found, what happened, which shops and people it touched, and whether it was
// reported to the Privacy Commissioner and the people affected were told.
//
// Entries are never deleted: `keepUntil` (two years after the day it was found) is the earliest an entry may go, and
// nothing here removes one. Changes add to the entry's history. Each affected shop's registry history and audit log
// get a line naming the entry (never its details), so the press's own record shows it too.
//
//   store     get(id); set(id, entry); list() -> every entry (clients/stores.js firestoreBreaches; fakes.js in memory)
//   registry  getShop(shopId); recordEvent(shopId, entry)
//   auditLog  ready(shopId); write(shopId, id, entry)
import { randomBytes } from "node:crypto";

export const KEEP_YEARS = 2;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class BreachError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (message) => new BreachError(400, message);

/** The day an entry may be deleted at the earliest: two years after it was found. */
export function keepUntil(foundOn) {
  const [year, month, day] = foundOn.split("-").map(Number);
  // 29 February rolls over to 1 March in a year without one.
  return new Date(Date.UTC(year + KEEP_YEARS, month - 1, day)).toISOString().slice(0, 10);
}

const text = (value, name, max) => {
  const out = typeof value === "string" ? value.trim() : "";
  if (!out) throw bad(`Say ${name}.`);
  return out.slice(0, max);
};

export function createBreachRegister({ store, registry, auditLog, now = () => new Date(), newId = () => randomBytes(6).toString("hex") }) {
  const at = () => now().toISOString();

  async function tellShops(shops, what, detail) {
    const stamp = at();
    for (const shopId of shops) {
      const entry = { id: `breach-${detail.breachId}-${what}-${stamp}`, source: "control-room", at: stamp, what, ...detail };
      await registry.recordEvent(shopId, entry);
      if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
    }
  }

  return {
    /** Every entry, newest found first. */
    async list() {
      return (await store.list()).sort((a, b) => (a.foundOn < b.foundOn ? 1 : a.foundOn > b.foundOn ? -1 : a.recordedAt < b.recordedAt ? 1 : -1));
    },

    async record({ by, foundOn, what, shops = [], people, reportedToCommissioner, peopleTold }) {
      if (typeof foundOn !== "string" || !DAY.test(foundOn) || Number.isNaN(Date.parse(foundOn))) throw bad("Give the day it was found, like 2026-10-28.");
      if (foundOn > at().slice(0, 10)) throw bad("The day it was found can't be in the future.");
      const description = text(what, "what happened", 4000);
      const affected = text(people, "who was affected (for example \"about 40 shoppers of one press\")", 1000);
      if (typeof reportedToCommissioner !== "boolean" || typeof peopleTold !== "boolean") {
        throw bad("Say whether it was reported to the Privacy Commissioner and whether the people affected were told.");
      }
      if (!Array.isArray(shops) || shops.length > 200) throw bad("List the shops affected (none, if it touched no shop).");
      const shopIds = [...new Set(shops.map((s) => String(s).trim()).filter(Boolean))];
      for (const shopId of shopIds) if (!(await registry.getShop(shopId))) throw bad(`There's no shop called ${shopId}.`);
      const stamp = at();
      const entry = {
        id: newId(), foundOn, what: description, shops: shopIds, people: affected,
        reportedToCommissioner, ...(reportedToCommissioner ? { reportedAt: stamp } : {}),
        peopleTold, ...(peopleTold ? { toldAt: stamp } : {}),
        recordedBy: by, recordedAt: stamp, keepUntil: keepUntil(foundOn),
        history: [{ at: stamp, by, what: "recorded" }],
      };
      await store.set(entry.id, entry);
      await tellShops(shopIds, "breach-recorded", { by, breachId: entry.id });
      return entry;
    },

    /** Marks a reported or told, or adds a note. Nothing already written is changed or removed. */
    async update({ by, id, reportedToCommissioner, peopleTold, note }) {
      const entry = typeof id === "string" && id ? await store.get(id) : null;
      if (!entry) throw new BreachError(404, "That entry isn't in the register.");
      const stamp = at();
      const changes = [];
      if (reportedToCommissioner === true && !entry.reportedToCommissioner) {
        Object.assign(entry, { reportedToCommissioner: true, reportedAt: stamp });
        changes.push("reported to the Privacy Commissioner");
      }
      if (peopleTold === true && !entry.peopleTold) {
        Object.assign(entry, { peopleTold: true, toldAt: stamp });
        changes.push("the people affected were told");
      }
      const extra = typeof note === "string" ? note.trim().slice(0, 2000) : "";
      if (!changes.length && !extra) throw bad("Nothing to add: mark it reported or told, or write a note.");
      entry.history.push({ at: stamp, by, what: changes.join("; ") || "note", ...(extra ? { note: extra } : {}) });
      await store.set(entry.id, entry);
      if (changes.length) await tellShops(entry.shops, "breach-updated", { by, breachId: entry.id, change: changes.join("; ") });
      return entry;
    },
  };
}
