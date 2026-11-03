// Makes every job's schedule in Cloud Scheduler, or brings it up to date. Safe to run as often as you like: each job is
// read first, then created, changed or left alone, and paused or resumed to match whether it can run yet
// (server/jobs.js WAITING_JOBS). Without --apply it only reads and prints what it would do.
//
//   node server/setup-schedules.js            # the plan: reads Google, changes nothing
//   node server/setup-schedules.js --apply    # does it
//   … --jobs-url https://platform-jobs-….run.app   # skip looking the jobs server's address up
//
// The token comes from `gcloud auth print-access-token` (the person running it needs Cloud Scheduler Admin and Cloud
// Run Viewer in the platform project, and Service Account User on the scheduler's account). Endpoints, from Google's
// discovery documents for cloudscheduler v1 and run v2:
//
//   projects.locations.services.get   GET   https://run.googleapis.com/v2/projects/P/locations/L/services/S  -> { uri }
//   projects.locations.jobs.get       GET   https://cloudscheduler.googleapis.com/v1/{name}
//   projects.locations.jobs.create    POST  https://cloudscheduler.googleapis.com/v1/projects/P/locations/L/jobs   body: Job
//   projects.locations.jobs.patch     PATCH https://cloudscheduler.googleapis.com/v1/{name}?updateMask=a,b      body: Job
//   projects.locations.jobs.pause     POST  https://cloudscheduler.googleapis.com/v1/{name}:pause
//   projects.locations.jobs.resume    POST  https://cloudscheduler.googleapis.com/v1/{name}:resume
import { pathToFileURL } from "node:url";
import { googleHttp, isNotFound } from "../clients/http.js";
import { JOBS } from "../services/jobs/index.js";
import { WAITING_JOBS } from "./jobs.js";
import { JOBS_SERVICE, REGION, schedulerJob } from "./schedules.js";
import { DEFAULT_PROJECT } from "./world.js";

export const SCHEDULER = "https://cloudscheduler.googleapis.com/v1";
export const CLOUD_RUN = "https://run.googleapis.com/v2";

/** The fields of `want` whose leaves differ from `have` (Google fills in defaults we never set, so only ours count). */
export function changedFields(want, have) {
  const differs = (a, b) => {
    if (a && typeof a === "object" && !Array.isArray(a)) return Object.entries(a).some(([k, v]) => differs(v, b?.[k]));
    return JSON.stringify(a) !== JSON.stringify(b);
  };
  return Object.keys(want).filter((key) => key !== "name" && differs(want[key], have?.[key]));
}

/** The jobs server's address, from Cloud Run. */
export async function jobsServerUrl({ call, project, region = REGION }) {
  try {
    const service = await call("GET", `${CLOUD_RUN}/projects/${project}/locations/${region}/services/${JOBS_SERVICE}`);
    if (typeof service.uri === "string" && service.uri.startsWith("https://")) return service.uri;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  throw new Error(`There's no ${JOBS_SERVICE} server in ${project} yet. Run node server/deploy.js --apply first.`);
}

/**
 * Reads every job's schedule and makes it match. Returns { actions: [{ job, does: [...] }] }, where `does` lists
 * "create", "update <fields>", "pause", "resume" or is empty ("unchanged").
 */
export async function setupSchedules({ fetch, token, project = DEFAULT_PROJECT, region = REGION, jobsUrl = null, apply = false, print = console.log }) {
  const call = googleHttp({ fetch, token });
  const base = jobsUrl ?? (await jobsServerUrl({ call, project, region }));
  print(`${apply ? "Making" : "Plan for"} the schedules in ${project} (${region}), calling ${base}`);
  const actions = [];
  for (const job of JOBS) {
    const want = schedulerJob({ project, region, job, jobsUrl: base });
    const waiting = WAITING_JOBS[job.name] ?? null;
    let have = null;
    try {
      have = await call("GET", `${SCHEDULER}/${want.name}`);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    const does = [];
    if (!have) {
      does.push("create");
      if (waiting) does.push("pause");
    } else {
      const fields = changedFields(want, have);
      if (fields.length) does.push(`update ${fields.join(",")}`);
      if (waiting && have.state !== "PAUSED") does.push("pause");
      if (!waiting && have.state === "PAUSED") does.push("resume");
    }
    actions.push({ job: job.name, does });
    const why = waiting ? ` (paused: waits on ${waiting.waitsOn})` : "";
    print(`  ${job.name.padEnd(20)} ${want.schedule.padEnd(14)} ${does.length ? does.join(", ") : "unchanged"}${why}`);
    if (!apply) continue;
    for (const step of does) {
      if (step === "create") await call("POST", `${SCHEDULER}/projects/${project}/locations/${region}/jobs`, { body: want });
      else if (step.startsWith("update ")) await call("PATCH", `${SCHEDULER}/${want.name}`, { query: { updateMask: step.slice(7) }, body: want });
      else await call("POST", `${SCHEDULER}/${want.name}:${step}`, { body: {} });
    }
  }
  const changes = actions.filter((a) => a.does.length).length;
  print(apply ? `Done: ${changes} schedule${changes === 1 ? "" : "s"} changed.` : `${changes} schedule${changes === 1 ? "" : "s"} would change. Run again with --apply to do it.`);
  return { actions, jobsUrl: base };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--jobs-url");
  const { gcloudToken } = await import("../release-check/run.js");
  try {
    await setupSchedules({ fetch: globalThis.fetch, token: gcloudToken, project: process.env.PLATFORM_PROJECT || DEFAULT_PROJECT, apply: args.includes("--apply"), jobsUrl: at >= 0 ? args[at + 1] : null });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
