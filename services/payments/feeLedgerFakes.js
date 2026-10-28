// An in-memory pay-as-you-sell ledger store (payAsYouSell.js has the shape) for tests. The real one is two collections
// in the platform project: `feeMonths/{shopId}_{month}` (updated in a transaction) and `feePayments/{shopId}_{id}`.
export function fakeFeeLedgerStore() {
  const months = new Map();
  const links = new Map();
  const id = (shopId, part) => `${shopId}_${part}`;
  return {
    months,
    links,
    get: async (shopId, month) => structuredClone(months.get(id(shopId, month)) ?? null),
    update: async (shopId, month, fn) => {
      const next = fn(structuredClone(months.get(id(shopId, month)) ?? null));
      if (next) months.set(id(shopId, month), structuredClone(next));
      return structuredClone(next);
    },
    link: async (shopId, paymentId, ref) => void links.set(id(shopId, paymentId), { ...ref }),
    find: async (shopId, paymentId) => (links.has(id(shopId, paymentId)) ? { ...links.get(id(shopId, paymentId)) } : null),
  };
}
