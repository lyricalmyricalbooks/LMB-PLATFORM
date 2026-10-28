// Pretend clients for the shop's plan copies and the closing sweep (shopPlan.js, closing.js). A shop's default
// database is accounts/fakes.js fakeShopData; nothing here reaches Google.

/** The stockroom's own database in each shop's project. `ready` says whether it exists yet (default: it does). */
export function fakeStockroomData({ isReady = () => true } = {}) {
  const docs = new Map();
  return {
    docs,
    ready: async (shopId) => Boolean(await isReady(shopId)),
    get: async (shopId, path) => structuredClone(docs.get(`${shopId} ${path}`) ?? null),
    set: async (shopId, path, data) => void docs.set(`${shopId} ${path}`, structuredClone(data)),
  };
}

/** A pretend project deleter: `deleted` lists each call; `fail` makes the next one throw. */
export function fakeProjects() {
  const deleted = [];
  return {
    deleted,
    fail: false,
    async deleteProject(projectId) {
      if (this.fail) {
        this.fail = false;
        throw new Error("Google didn't answer (pretend error)");
      }
      deleted.push(projectId);
    },
  };
}
