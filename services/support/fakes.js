// An in-memory support store with the shape of the real one (clients/stores.js `firestoreSupport`), for tests.
export function fakeSupportStore() {
  const tickets = new Map();
  const all = () => [...tickets.values()].map((t) => structuredClone(t));
  return {
    tickets,
    get: async (id) => structuredClone(tickets.get(id) ?? null),
    put: async (id, ticket) => void tickets.set(id, structuredClone(ticket)),
    list: async ({ status, limit = 200 }) => all().filter((t) => t.status === status).slice(0, limit),
    listByEmail: async (email) => all().filter((t) => t.email === email).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    countSince: async (email, since) => all().filter((t) => t.email === email && t.openedAt >= since).length,
  };
}
