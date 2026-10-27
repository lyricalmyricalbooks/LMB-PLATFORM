// In-memory stand-ins for the shop registry and a shop's audit log, for tests and dry runs. The real ones (Firestore in
// the platform project, and the shop's own `audit-log` collection) keep the same shape.
//
// Registry: `readSteps(shopId)` returns every step entry recorded for the shop, oldest first; `recordStep(shopId, entry)`
// adds one. Audit log: `ready(shopId)` says whether the shop's database exists yet; `write(shopId, id, entry)` stores
// the entry under `id`, replacing any entry with that id.

export function fakeRegistry(seed = {}) {
  const steps = new Map(Object.entries(seed).map(([shopId, list]) => [shopId, [...list]]));
  return {
    steps,
    async readSteps(shopId) {
      return [...(steps.get(shopId) ?? [])];
    },
    async recordStep(shopId, entry) {
      if (!steps.has(shopId)) steps.set(shopId, []);
      steps.get(shopId).push({ ...entry });
    },
  };
}

/** `isReady(shopId)` decides when the shop's database exists; by default it always does. */
export function fakeAuditLog({ isReady = () => true } = {}) {
  const entries = new Map();
  return {
    entries,
    async ready(shopId) {
      return Boolean(await isReady(shopId));
    },
    async write(shopId, id, entry) {
      if (!entries.has(shopId)) entries.set(shopId, new Map());
      entries.get(shopId).set(id, { ...entry });
    },
  };
}
