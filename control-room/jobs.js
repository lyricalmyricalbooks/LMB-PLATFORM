// The Jobs page's door (code plan 19.11): every scheduled job with its last run, and "Run now". Platform admins only
// (adminOf). The jobs and their run log are services/jobs; this only shows them and runs one by hand.
//
// Clients passed in:
//   runner    services/jobs createJobs(...): jobsStatus({ now }), alertLate({ now }), runJob(name, fn, { by, reason })
//   jobs      optional: { <job name>: () => result }, the jobs this server can run itself. A job not in it runs only on
//             the server that hosts its schedule, and "Run now" says so.
//   activity  the activity log (activity.js): every "Run now" is logged there, with its reason, before it runs
import { ControlError, MIN_REASON, adminOf } from "./controlRoom.js";
import { activityEntry } from "./activity.js";
import { jobNamed } from "../services/jobs/index.js";

export const SERVER_ONLY = "This job can only run on the server.";

export function createJobsPage({ admins, runner, jobs = {}, activity, now = () => new Date() }) {
  return {
    /** Every job and its last run. Looking also sends any late alert not sent yet. */
    async list(claims) {
      adminOf(claims, admins, now().getTime());
      if (!runner) return { jobs: [] };
      await runner.alertLate({ now: now() }).catch(() => null);
      const rows = await runner.jobsStatus({ now: now() });
      return { jobs: rows.map((row) => ({ ...row, canRun: typeof jobs[row.name] === "function" })) };
    },

    /** Run now: logged with the reason, then run and recorded like a scheduled run. */
    async runNow(claims, { name, reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const why = typeof reason === "string" ? reason.trim() : "";
      if (why.length < MIN_REASON) throw new ControlError(400, `Say why, in at least ${MIN_REASON} characters. It goes in the activity log.`);
      if (typeof name !== "string" || !jobNamed(name)) throw new ControlError(404, "There's no job with that name.");
      if (!runner || typeof jobs[name] !== "function") throw new ControlError(409, SERVER_ONLY);
      if (activity) await activity.record(activityEntry({ at: now().toISOString(), by, what: "job-run", detail: { job: name, reason: why.slice(0, 500) } }));
      const run = await runner.runJob(name, jobs[name], { by, reason: why.slice(0, 500) });
      return { run };
    },
  };
}

//   GET  /api/control/jobs      every scheduled job: how often, last run, how long it took, its result, late or not
//   POST /api/control/jobs/run  { name, reason }: run one job now (logged); 409 when only its server can run it
export function jobsRoutes(page) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/control/jobs": (claims) => page.list(claims),
    "POST /api/control/jobs/run": (claims, request) => page.runNow(claims, body(request)),
  };
}
