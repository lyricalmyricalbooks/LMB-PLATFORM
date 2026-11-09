// The pretend store for messages to presses (messages.js). The real one is pressMessages/<id> in the platform project,
// which no browser can read or write.

/** The messages store, in memory. No delete, like the real one: an ended message stays on record. */
export function fakePressMessages() {
  const rows = new Map();
  return {
    rows,
    get: async (id) => structuredClone(rows.get(id) ?? null),
    set: async (id, row) => void rows.set(id, structuredClone(row)),
    list: async () => structuredClone([...rows.values()]),
  };
}
