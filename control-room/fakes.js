// Pretend clients for the control room's tests. The registry, audit log, profile files and deploys come from
// setup/fakes.js.

/** A pretend support sign-in to a shop's admin. `calls` lists each one; `fail` makes the next one throw. */
export function fakeShopAccess() {
  const calls = [];
  return {
    calls,
    fail: false,
    async supportSignIn(shopId, options) {
      if (this.fail) throw new Error("the shop didn't answer (pretend error)");
      calls.push({ shopId, ...options });
      return { url: `https://${shopId}.example/admin/?support=${calls.length}` };
    },
  };
}

/** A pretend repair queue with open items by shop. */
export function fakeRepairQueue(open = {}) {
  return { open: async (shopId) => structuredClone(open[shopId] ?? []) };
}
