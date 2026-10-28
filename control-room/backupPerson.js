// The backup person (code plan 8.7): one named person (PLATFORM_BACKUP_PERSON, nobody by default) who can act when
// Julian can't be reached, limited to the run book (runbook.js): pause releases, roll back a shop, post a status note.
//
// The access is sealed. It does nothing until the person opens it with a reason, which emails Julian's address
// (PLATFORM_ADMIN_EMAIL) at once and lasts SEAL_HOURS. With no address to tell, or if that email can't be sent, it
// stays shut. While it is open, each action is written to the emergency log and emailed to the same address. An email
// that fails after the seal is open is written in the log and the action still happens: in an emergency, the email
// service may be part of the problem.
//
// Platform admins can use the same actions without a seal; their uses are logged, not emailed.
//
// Clients passed in: people (people.js controlRoomPeople), admins (the platform admin list), runBook (runbook.js),
// state (clients/stores.js firestorePlatformState: get, set, log), email (services/email sendPlatform), registry and
// auditLog (a roll back is also written in the shop's own history), now.
import { createHash } from "node:crypto";
import { twoStepProblem } from "./controlRoom.js";

export const SEAL_HOURS = 12;
export const MIN_REASON = 10;

export const RUN_BOOK_ACTIONS = Object.freeze({
  "pause-releases": "paused releases",
  "resume-releases": "resumed releases",
  "roll-back": "rolled a shop back",
  "status-note": "posted a status note",
});

export class EmergencyError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createBackupAccess({ people = {}, admins = [], runBook, state, email, registry, auditLog, now = () => new Date() }) {
  const at = () => now().toISOString();

  /** "backup" for the backup person, "admin" for a platform admin, or a refusal. */
  function roleOf(claims) {
    if (!claims?.uid) throw new EmergencyError(401, "Sign in first.");
    const who = String(claims.email ?? "").toLowerCase();
    const role = claims.email_verified === true && people.backupPerson && who === people.backupPerson ? "backup"
      : claims.email_verified === true && admins.includes(who) ? "admin" : null;
    if (!role) throw new EmergencyError(403, "This is for the platform's admins and its backup person only.");
    // Two steps, signed in within 12 hours, for the backup person too (plan 9.1).
    const problem = twoStepProblem(claims, now().getTime());
    if (problem) throw new EmergencyError(problem.status, problem.message);
    return { role, by: who };
  }

  const reasonOf = (reason) => {
    const text = typeof reason === "string" ? reason.trim() : "";
    if (text.length < MIN_REASON) throw new EmergencyError(400, `Say why, in at least ${MIN_REASON} characters. Julian is told.`);
    return text.slice(0, 500);
  };

  async function openSeal() {
    const seal = await state.get("backupSeal");
    return seal && Date.parse(seal.until) > now().getTime() ? seal : null;
  }

  async function writeLog(what, detail) {
    const stamp = at();
    const id = `${stamp}-${what}-${createHash("sha256").update(JSON.stringify(detail)).digest("hex").slice(0, 8)}`;
    const entry = { id, at: stamp, what, ...detail };
    await state.log(id, entry);
    return entry;
  }

  const tell = (entry) => email.sendPlatform({
    kind: "backup-access-used", to: people.adminEmail, idempotencyKey: `backup-access-${entry.id}`,
    data: { by: entry.by, action: RUN_BOOK_ACTIONS[entry.what] ?? "opened the emergency access", reason: entry.reason ?? "", detail: entry.detail ?? "", at: entry.at, until: entry.until ?? "" },
  });

  async function act(claims, what, run) {
    const { role, by } = roleOf(claims);
    if (role === "backup" && !(await openSeal())) throw new EmergencyError(403, "Open the emergency access first, with a reason. Julian is emailed when you do.");
    const result = await run(by);
    const entry = await writeLog(what, { by, role, reason: result.reason, detail: result.detail });
    if (role === "backup") {
      try {
        await tell(entry);
      } catch (error) {
        await writeLog("email-failed", { by, about: entry.id, error: String(error?.message ?? error).slice(0, 300) });
      }
    }
    return result.answer;
  }

  return {
    /** What the person can see: their role, whether the seal is open, and the run book's state. */
    async status(claims) {
      const { role } = roleOf(claims);
      return {
        role,
        seal: await openSeal(),
        releasesPaused: await runBook.releasesPaused(),
        statusNote: await runBook.statusNote(),
        backupPersonSet: Boolean(people.backupPerson),
        adminTold: Boolean(people.adminEmail),
      };
    },

    /** The backup person breaks the seal: logged and emailed to Julian first; no email, no access. */
    async open(claims, { reason } = {}) {
      const { role, by } = roleOf(claims);
      if (role !== "backup") throw new EmergencyError(400, "Platform admins don't need the emergency access.");
      const why = reasonOf(reason);
      if (!people.adminEmail) throw new EmergencyError(503, "Nobody would be told, so the emergency access stays shut. PLATFORM_ADMIN_EMAIL isn't set.");
      const seal = { by, reason: why, openedAt: at(), until: new Date(now().getTime() + SEAL_HOURS * 3_600_000).toISOString() };
      const entry = await writeLog("open", { by, role, reason: why, until: seal.until });
      try {
        await tell(entry);
      } catch {
        await writeLog("email-failed", { by, about: entry.id, error: "the email to Julian couldn't be sent, so the access stayed shut" });
        throw new EmergencyError(503, "Julian couldn't be emailed, so the emergency access stays shut. Try again in a minute.");
      }
      await state.set("backupSeal", seal);
      return { seal };
    },

    pauseReleases: (claims, { reason } = {}) => act(claims, "pause-releases", async (by) => {
      const why = reasonOf(reason);
      return { reason: why, answer: await runBook.pauseReleases({ by, reason: why }) };
    }),

    resumeReleases: (claims, { reason } = {}) => act(claims, "resume-releases", async (by) => {
      const why = reasonOf(reason);
      return { reason: why, answer: await runBook.resumeReleases({ by, reason: why }) };
    }),

    rollBack: (claims, { shopId, version, reason } = {}) => act(claims, "roll-back", async (by) => {
      const why = reasonOf(reason);
      if (typeof shopId !== "string" || !(await registry.getShop(shopId))) throw new EmergencyError(404, "There's no shop with that id.");
      if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version)) throw new EmergencyError(400, "Give the release to go back to, like 1.4.0.");
      const result = await runBook.rollBack({ shopId, version, by, reason: why });
      // The shop's own history says who rolled it back and why, as the release runner's audit entry does.
      const stamp = at();
      const entry = { id: `run-book-${stamp}-roll-back`, source: "run-book", at: stamp, what: "roll-back", by, reason: why, version, ok: result.ok === true };
      await registry.recordEvent(shopId, entry);
      if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
      return { reason: why, detail: `${shopId} to ${version}: ${result.ok ? "done" : result.error}`, answer: result };
    }),

    statusNote: (claims, { text } = {}) => act(claims, "status-note", async (by) => {
      const answer = await runBook.postStatusNote({ text, by });
      return { reason: answer.statusNote ? answer.statusNote.text : "took the note down", detail: answer.statusNote?.text ?? "", answer };
    }),
  };
}

/** The routes on the platform's one web door. The backup person reaches only these. */
export function emergencyRoutes(access) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/control/emergency": (claims) => access.status(claims),
    "POST /api/control/emergency/open": (claims, request) => access.open(claims, body(request)),
    "POST /api/control/emergency/pause-releases": (claims, request) => access.pauseReleases(claims, body(request)),
    "POST /api/control/emergency/resume-releases": (claims, request) => access.resumeReleases(claims, body(request)),
    "POST /api/control/emergency/roll-back": (claims, request) => access.rollBack(claims, body(request)),
    "POST /api/control/emergency/status-note": (claims, request) => access.statusNote(claims, body(request)),
  };
}
