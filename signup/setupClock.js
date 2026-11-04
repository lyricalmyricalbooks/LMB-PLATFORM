// The clock for a press that has not opened (code plan 18.11, the warnings and the removal). A setup record is kept 60
// days after the press's last visit (pressRecord.js SETUP_EXPIRY_DAYS). The press is emailed 30 days and 7 days before
// (a sweep that missed the first sends only the second), and the record is cleared only after the 7-day email went, and
// never sooner than 7 days after it. A visit
// resets the clock: the warnings are tied to the visit they counted from (`setupWarnings.seen`), so a press that comes
// back starts again with no warning sent.
//
// Clearing a record keeps the one document (status `expired`, which nothing moves on from) with the dates and the
// warnings sent, and wipes what the press typed and its kept product file. Nothing else exists for a press in setup:
// no shop, no trial, nothing at Google or billing.
//
//   setupClockDue(record, nowMs)  -> { action: "warn", before: 30 | 7, removesOn } | { action: "clear" } | null
//   createSetupClock({ presses, stagedFiles, email, settings, now }).sweep() -> { warned, cleared, skipped, summary };
//                                 throws after the pass when any press failed, naming each
//
// Clients passed in:
//   presses      the front door's store: list(); update(pressId, change) (one read-and-write step)
//   stagedFiles  remove(path), fine when nothing is there
//   email        sendPlatform({ kind, to, data, idempotencyKey, language })
//   settings     { platformUrl }
import { SETUP_EXPIRY_DAYS } from "./pressRecord.js";
import { START_PAGE } from "./frontDoor.js";

const DAY = 86_400_000;
/** Days before the removal that the press is emailed, earliest first. */
export const SETUP_WARNINGS = Object.freeze([30, 7]);
/** The least notice the last warning gives: a late warning moves the removal back. */
export const LAST_NOTICE_DAYS = SETUP_WARNINGS.at(-1);

/** The removal date counted from the press's last visit (from when it was made, if that visit's date can't be read). */
export const removalDate = (record) => {
  const seen = Date.parse(record.lastSeenAt ?? "");
  return (Number.isFinite(seen) ? seen : Date.parse(record.createdAt ?? "")) + SETUP_EXPIRY_DAYS * DAY;
};

/** The warnings sent for the visit the clock counts from now; an older visit's warnings no longer count. */
function sentFor(record) {
  const warnings = record.setupWarnings;
  return warnings && warnings.seen === record.lastSeenAt ? warnings.sent ?? {} : {};
}

/** What the clock owes this record today. */
export function setupClockDue(record, nowMs) {
  if (record?.status !== "setup") return null;
  const removesAt = removalDate(record);
  if (!Number.isFinite(removesAt)) return null;
  const sent = sentFor(record);
  // The last warning sent means the press has had its notice (an earlier one missed by the sweep is never sent late).
  if (sent[LAST_NOTICE_DAYS]) {
    const last = Date.parse(sent[LAST_NOTICE_DAYS]);
    return nowMs >= Math.max(removesAt, last + LAST_NOTICE_DAYS * DAY) ? { action: "clear" } : null;
  }
  // The nearest warning now due; a missed earlier one is not sent as well, so the press gets one email, not two.
  const due = SETUP_WARNINGS.filter((days) => !sent[days] && nowMs >= removesAt - days * DAY).at(-1);
  if (!due) return null;
  return { action: "warn", before: due, removesOn: new Date(Math.max(removesAt, nowMs + LAST_NOTICE_DAYS * DAY)).toISOString() };
}

/** The typed answers and kept file a cleared record no longer holds (pressRecord.js newPressRecord's fields). */
const CLEARED = Object.freeze({ plan: "", pressName: "", sells: "", country: "", look: "", adminLook: "", moving: "", language: "",
  domainChoice: "", domain: "", domainSeller: "", domainEasy: false, stagedImportPath: "", stagedImport: null, pendingImportPath: "" });

export function createSetupClock({ presses, stagedFiles, email, settings, now = () => new Date() }) {
  const link = () => `${String(settings.platformUrl ?? "").replace(/\/$/, "")}/${START_PAGE}/`;

  async function warn(record, due) {
    const at = now().toISOString();
    // The email first, with a key per visit and warning, so a sweep that stops after it and runs again sends one email.
    await email.sendPlatform({
      kind: "setup-ending", to: record.ownerEmail, language: record.language === "fr" ? "fr" : "en",
      idempotencyKey: `setup-ending:${record.pressId}:${record.lastSeenAt}:${due.before}`,
      data: { pressName: record.pressName || "", daysLeft: due.before, date: new Date(due.removesOn).toLocaleDateString("en-CA", { dateStyle: "long", timeZone: "America/Toronto" }), on: due.removesOn, link: link() },
    });
    await presses.update(record.pressId, (current) => {
      // A visit since the read restarts the clock: the email stands, but it no longer counts.
      if (!current || current.status !== "setup" || current.lastSeenAt !== record.lastSeenAt) return { row: null, result: null };
      const sent = { ...sentFor(current), [due.before]: at };
      return { row: { ...current, setupWarnings: { seen: current.lastSeenAt, sent } }, result: null };
    });
  }

  async function clear(record) {
    const at = now().toISOString();
    const done = await presses.update(record.pressId, (current) => {
      // Only the record as it was read: a visit, or Open my shop, since then keeps it.
      if (!current || current.status !== "setup" || current.lastSeenAt !== record.lastSeenAt || setupClockDue(current, now().getTime())?.action !== "clear") return { row: null, result: { cleared: false, paths: [] } };
      return { row: { ...current, ...CLEARED, status: "expired", expiredAt: at }, result: { cleared: true, paths: [current.stagedImportPath, current.pendingImportPath].filter(Boolean) } };
    });
    for (const path of done.paths) await stagedFiles.remove(path);
    return done.cleared;
  }

  return {
    /** One pass over every setup record. One press's trouble doesn't stop the others. */
    async sweep() {
      const tally = { warned: 0, cleared: 0, skipped: 0, failed: [] };
      for (const record of await presses.list()) {
        const due = setupClockDue(record, now().getTime());
        if (!due) {
          tally.skipped += 1;
          continue;
        }
        try {
          if (due.action === "warn") {
            await warn(record, due);
            tally.warned += 1;
          } else {
            if (await clear(record)) tally.cleared += 1;
            else tally.skipped += 1;
          }
        } catch (failure) {
          tally.failed.push({ pressId: record.pressId, error: failure.message });
        }
      }
      const summary = `${tally.warned} warned, ${tally.cleared} cleared${tally.failed.length ? `, ${tally.failed.length} failed` : ""}`;
      // A press that couldn't be reached makes the run fail, so the Jobs page shows it; the rest were still done.
      if (tally.failed.length) throw new Error(`${summary}: ${tally.failed.map((f) => `${f.pressId} (${f.error})`).join("; ")}`);
      return { ...tally, summary };
    },
  };
}
