// How the Google jobs record what they did: the registry row's `google` (one entry per step in `steps`, plus what each
// part made) and one entry in the shop's audit log. A step that ran again and found nothing to change records nothing,
// so a re-run leaves the registry and the audit log as they were.
//
//   google: { analytics, searchConsole, merchantCenter, domain, email, drive?, youtube?, calendar?, businessProfile?,
//             ads?, accountEmail, connectedAt, closedAt?, deletedAt?,
//             steps: [{ step, state: "done" | "failed" | "waiting", at, detail }] }

export const STATES = Object.freeze(["done", "failed", "waiting"]);

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function createRecorder({ registry, auditLog, now = () => Date.now() }) {
  const iso = () => new Date(now()).toISOString();

  /** Merges top-level fields into the row's `google`. */
  async function updateGoogle(shopId, fields) {
    const row = await registry.getShop(shopId);
    const google = { steps: [], ...(row?.google ?? {}) };
    const next = { ...google, ...fields };
    if (!same(google, next)) await registry.updateShop(shopId, { google: next });
    return next;
  }

  /**
   * One step's outcome: `{ state, detail, part?, record? }`. `record` is merged into `google[part]` (part defaults to the
   * step). Nothing is written when the state, the words and the record are what the row already holds.
   */
  async function recordStep(shopId, step, outcome, { source = "google-connect" } = {}) {
    if (!STATES.includes(outcome.state)) throw new Error(`a step can't be ${outcome.state}`);
    const row = await registry.getShop(shopId);
    const google = { steps: [], ...(row?.google ?? {}) };
    const part = outcome.part ?? step;
    const before = google.steps.find((s) => s.step === step);
    const record = outcome.record ? { ...(google[part] ?? {}), ...outcome.record } : google[part];
    const unchanged = before && before.state === outcome.state && before.detail === outcome.detail && same(record, google[part]);
    if (unchanged) return { changed: false, entry: before };
    const at = iso();
    const entry = { step, state: outcome.state, at, detail: outcome.detail };
    const steps = [...google.steps.filter((s) => s.step !== step), entry];
    await registry.updateShop(shopId, { google: { ...google, ...(outcome.record ? { [part]: record } : {}), steps } });
    const id = `google-${step}-${outcome.state}-${Date.parse(at)}`;
    const log = { id, source, kind: `google.${step}`, state: outcome.state, detail: outcome.detail, at };
    await registry.recordEvent(shopId, log);
    await auditLog.write(shopId, id, log);
    return { changed: true, entry };
  }

  return { recordStep, updateGoogle, iso };
}
