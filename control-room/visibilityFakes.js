// Pretend stores for the shop timeline, delivery counts and notes (code plan 19.10-19.13), in memory, with the shapes
// of the real ones in clients/stores.js. The jobs' run log is services/jobs/fakes.js.

/** Per-shop delivery counts by day (clients/stores.js `firestoreDeliveryStats`): add(shopId, kind, at); count(...). */
export function fakeDeliveryStats() {
  const days = new Map();
  const key = (shopId, kind, day) => `${shopId} ${kind} ${day}`;
  return {
    days,
    add: async (shopId, kind, at) => {
      const k = key(shopId, kind, String(at).slice(0, 10));
      days.set(k, (days.get(k) ?? 0) + 1);
    },
    count: async (shopId, kind, sinceIso) => {
      let total = 0;
      for (const [k, n] of days) {
        const [s, kd, day] = k.split(" ");
        if (s === shopId && kd === kind && day >= String(sinceIso).slice(0, 10)) total += n;
      }
      return total;
    },
  };
}

/** The control room's private notes and tags (clients/stores.js `firestoreShopNotes`). */
export function fakeShopNotes() {
  const docs = new Map();
  return {
    docs,
    get: async (shopId) => structuredClone(docs.get(shopId) ?? null),
    set: async (shopId, doc) => void docs.set(shopId, structuredClone(doc)),
    list: async () => structuredClone([...docs.values()]),
  };
}
