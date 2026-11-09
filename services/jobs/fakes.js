// The jobs' run log in memory, with the shape of the real one (clients/stores.js `firestoreJobRuns`).
import { KEEP_RUNS } from "./index.js";

export function fakeJobRuns() {
  const runs = new Map();
  const states = new Map();
  return {
    runs,
    states,
    async add(name, run) {
      const list = [structuredClone(run), ...(runs.get(name) ?? [])].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
      runs.set(name, list.slice(0, KEEP_RUNS));
    },
    list: async (name, { limit = KEEP_RUNS } = {}) => structuredClone((runs.get(name) ?? []).slice(0, limit)),
    getState: async (name) => structuredClone(states.get(name) ?? null),
    setState: async (name, state) => void states.set(name, structuredClone(state)),
  };
}
