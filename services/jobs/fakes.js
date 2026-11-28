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
    async getAllSummaries() {
      const out = {};
      for (const [name, list] of runs.entries()) {
        const last = list[0] ?? null;
        const lastOk = list.find((r) => r.ok) ?? null;
        const st = states.get(name) ?? {};
        out[name] = structuredClone({ lastRun: last, lastSuccessAt: lastOk?.startedAt ?? null, lateAlertedAt: st.lateAlertedAt ?? null, backOnTimeAt: st.backOnTimeAt ?? null });
      }
      for (const [name, st] of states.entries()) {
        if (!out[name]) out[name] = structuredClone({ lastRun: null, lastSuccessAt: null, lateAlertedAt: st.lateAlertedAt ?? null, backOnTimeAt: st.backOnTimeAt ?? null });
      }
      return out;
    },
  };
}
