// Scheduled publishing & campaigns (Studio 3.5). Studio writes admin-only `themeSchedule/{id}` entries:
//   { kind: "publish" | "campaign", name, design, startAt (ISO), endAt? (ISO, campaigns), status, createdAt }
// The 15-minute sweep (unpaidPaymentSweep) calls runThemeSchedule: a due publish replaces the live design; a campaign
// replaces it at startAt, keeps the design it replaced (`revertDesign`), and puts that back at endAt — unless the owner
// published something else in between, which is kept. Each change is one transaction on settings/website, records a
// theme version and stamps `themes/scheduler.lastRunAt` so Studio can show the scheduler is running. Nothing here
// touches orders, prices or stock.

const ACTIVE = ["scheduled", "live"];

// Design fields that are changed on the live design straight away, outside Studio's Publish (Book editor > new category,
// the "Under construction" switch: adminApi.addShopCategory / updateShopCategories / setUnderConstruction). A schedule
// stores a copy of the design taken when it was made, so applying it as is would undo those later edits. Whatever
// replaces the live design therefore keeps these two as they are live at that moment, unless the owner changed them on
// purpose inside the scheduled design itself.
const LIVE_ONLY_KEYS = ["categories", "showUnderConstruction"];

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const setOrDelete = (obj, key, value) => { if (value === undefined) delete obj[key]; else obj[key] = value; };

/** Pure: the live-only fields of a design (only those it has). Stored on a started campaign as `appliedLiveOnly`. */
function liveOnlyOf(design) {
  const out = {};
  for (const key of LIVE_ONLY_KEYS) if (plain(design)[key] !== undefined) out[key] = design[key];
  return out;
}

/**
 * Pure: the design to put live when a scheduled design starts. `base` is the live value of those fields when the schedule
 * was made (entry.liveBase): where the scheduled design still equals it, nobody meant to change it, so the current live
 * value wins; where it differs, the owner edited it inside the scheduled design and that is kept. Entries made before
 * liveBase existed let a defined live value win.
 */
function withLiveOnly(design, liveDesign, base) {
  const out = { ...plain(design) };
  const live = plain(liveDesign);
  for (const key of LIVE_ONLY_KEYS) {
    if (base && typeof base === "object") {
      if (!same(out[key], base[key])) continue;
    } else if (live[key] === undefined) continue;
    setOrDelete(out, key, live[key]);
  }
  return out;
}

/**
 * Pure: the design to put back when a campaign ends. A live-only field nobody touched while the campaign ran (still
 * what the start wrote, `applied`) goes back to the earlier design's value; one edited live during the campaign keeps
 * its current value. Campaigns started before `applied` was recorded keep a defined live value.
 */
function revertWithLiveOnly(revertDesign, liveDesign, applied) {
  const out = { ...plain(revertDesign) };
  const live = plain(liveDesign);
  for (const key of LIVE_ONLY_KEYS) {
    if (applied && typeof applied === "object") {
      if (same(live[key], applied[key])) continue;
    } else if (live[key] === undefined) continue;
    setOrDelete(out, key, live[key]);
  }
  return out;
}

const ms = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : NaN; };

/**
 * Pure: what to do now. Ends come before starts (a campaign can end and the next begin at the same moment); starts run
 * oldest first so the latest one due wins. A campaign whose end has already passed before it ever started is skipped.
 */
function planThemeSchedule(entries, now = Date.now()) {
  const steps = [];
  const valid = (entries || []).filter(e => e && e.id && ACTIVE.includes(e.status) && Number.isFinite(ms(e.startAt)));
  for (const e of valid) {
    if (e.status === "live" && e.kind === "campaign" && ms(e.endAt) <= now) steps.push({ type: "end", id: e.id });
  }
  const due = valid.filter(e => e.status === "scheduled" && ms(e.startAt) <= now).sort((a, b) => ms(a.startAt) - ms(b.startAt));
  for (const e of due) {
    if (e.kind === "campaign" && Number.isFinite(ms(e.endAt)) && ms(e.endAt) <= now) steps.push({ type: "skip", id: e.id, reason: "ended-before-start" });
    else if (!e.design || typeof e.design !== "object") steps.push({ type: "skip", id: e.id, reason: "no-design" });
    else steps.push({ type: "start", id: e.id });
  }
  return steps;
}

async function runThemeSchedule(db, now = new Date()) {
  const nowIso = now.toISOString();
  const snap = await db.collection("themeSchedule").where("status", "in", ACTIVE).get();
  const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const steps = planThemeSchedule(entries, now.getTime());
  const settingsRef = db.collection("settings").doc("website");
  const results = [];
  for (const step of steps) {
    const ref = db.collection("themeSchedule").doc(step.id);
    try {
      let applied = null; // the design this step wrote (reset by each transaction attempt)
      const outcome = await db.runTransaction(async (tx) => {
        applied = null;
        const [entrySnap, settingsSnap] = [await tx.get(ref), await tx.get(settingsRef)];
        const entry = entrySnap.exists ? entrySnap.data() : null;
        const settings = settingsSnap.exists ? settingsSnap.data() : {};
        if (!entry || !ACTIVE.includes(entry.status)) return "gone";
        if (step.type === "skip") {
          tx.update(ref, { status: "skipped", endedAt: nowIso, note: step.reason });
          return "skipped";
        }
        if (step.type === "start") {
          if (entry.status !== "scheduled") return "gone";
          const next = withLiveOnly(entry.design, settings.design, entry.liveBase);
          tx.set(settingsRef, { design: next, designPublishedAt: nowIso }, { mergeFields: ["design", "designPublishedAt"] });
          applied = next;
          tx.update(ref, entry.kind === "campaign"
            ? { status: "live", startedAt: nowIso, revertDesign: settings.design || {}, revertPublishedAt: settings.designPublishedAt || null, appliedLiveOnly: liveOnlyOf(next) }
            : { status: "done", startedAt: nowIso });
          return "started";
        }
        // end of a campaign: put back what it replaced, unless something else was published since it started.
        if (entry.status !== "live") return "gone";
        if (settings.designPublishedAt && settings.designPublishedAt !== entry.startedAt) {
          tx.update(ref, { status: "done", endedAt: nowIso, note: "kept-later-publish" });
          return "kept";
        }
        const back = revertWithLiveOnly(entry.revertDesign || {}, settings.design, entry.appliedLiveOnly);
        tx.set(settingsRef, { design: back, designPublishedAt: nowIso }, { mergeFields: ["design", "designPublishedAt"] });
        applied = back;
        tx.update(ref, { status: "done", endedAt: nowIso, revertDesign: null });
        return "reverted";
      });
      results.push({ ...step, outcome });
      if (outcome === "started" || outcome === "reverted") {
        const entry = entries.find(e => e.id === step.id) || {};
        const label = outcome === "started" ? `Scheduled: ${entry.name || "design"}` : `Campaign ended: ${entry.name || "design"}`;
        await db.collection("theme-versions").add({ kind: "published", label, createdAt: nowIso, design: applied || {} })
          .catch(err => console.warn("themeSchedule: version not recorded:", err.message));
        await db.collection("audit-log").add({ type: "settings", message: label, createdAt: nowIso })
          .catch(() => {});
      }
    } catch (err) {
      console.error(`themeSchedule: ${step.type} ${step.id} failed:`, err.message);
      results.push({ ...step, outcome: "failed" });
    }
  }
  await db.collection("themes").doc("scheduler").set({ lastRunAt: nowIso, lastResults: results.slice(0, 20) }, { merge: true })
    .catch(err => console.warn("themeSchedule: could not stamp lastRunAt:", err.message));
  return results;
}

module.exports = { planThemeSchedule, runThemeSchedule, withLiveOnly, revertWithLiveOnly, liveOnlyOf, LIVE_ONLY_KEYS, ACTIVE };
