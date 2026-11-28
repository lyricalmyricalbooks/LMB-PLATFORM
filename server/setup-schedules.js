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
//   projects.locations.jobs.delete    DELETE https://cloudscheduler.googleapis.com/v1/{name}
import { pathToFileURL } from "node:url";
import { googleHttp, isNotFound } from "../clients/http.js";
import { JOBS } from "../services/jobs/index.js";
import { JOBS_SERVICE, REGION, TICK_JOB_NAME, platformTickJob, schedulerJobId } from "./schedules.js";
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
 * Jobs the code no longer schedules directly in Cloud Scheduler: their schedules are removed so only `platform-tick`
 * remains (1 job inside Google's free 3-job tier).
 */
export const RETIRED_JOBS = Object.freeze([
  // Presses' own sending addresses went with Resend (10 November 2026): every email now leaves through Google.
  "own-email-addresses",
  ...JOBS.map((job) => job.name),
]);

/**
 * Ensures the single `platform-tick` dispatcher schedule exists and matches, and removes any retired per-job
 * schedules. Returns { actions: [{ job, does: [...] }], jobsUrl }.
 */
export async function setupSchedules({ fetch, token, project = DEFAULT_PROJECT, region = REGION, jobsUrl = null, apply = false, print = console.log }) {
  const call = googleHttp({ fetch, token });
  const base = jobsUrl ?? (await jobsServerUrl({ call, project, region }));
  print(`${apply ? "Making" : "Plan for"} the schedules in ${project} (${region}), calling ${base}`);
  const actions = [];
  const want = platformTickJob({ project, region, jobsUrl: base });
  let have = null;
  try {
    have = await call("GET", `${SCHEDULER}/${want.name}`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  const does = [];
  if (!have) {
    does.push("create");
  } else {
    const fields = changedFields(want, have);
    if (fields.length) does.push(`update ${fields.join(",")}`);
    if (have.state === "PAUSED") does.push("resume");
  }
  actions.push({ job: TICK_JOB_NAME, does });
  print(`  ${TICK_JOB_NAME.padEnd(20)} ${want.schedule.padEnd(14)} ${does.length ? does.join(", ") : "unchanged"}`);
  if (apply) {
    for (const step of does) {
      if (step === "create") await call("POST", `${SCHEDULER}/projects/${project}/locations/${region}/jobs`, { body: want });
      else if (step.startsWith("update ")) await call("PATCH", `${SCHEDULER}/${want.name}`, { query: { updateMask: step.slice(7) }, body: want });
      else await call("POST", `${SCHEDULER}/${want.name}:${step}`, { body: {} });
    }
  }
  for (const name of RETIRED_JOBS) {
    const jobName = `projects/${project}/locations/${region}/jobs/${schedulerJobId(name)}`;
    let old = null;
    try {
      old = await call("GET", `${SCHEDULER}/${jobName}`);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    if (!old) continue;
    actions.push({ job: name, does: ["delete"] });
    print(`  ${name.padEnd(20)} ${"".padEnd(14)} delete (replaced by platform-tick)`);
    if (apply) await call("DELETE", `${SCHEDULER}/${jobName}`);
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
    // The server's settings, when there (the deploy writes server/env.yaml first): they say which jobs can run.
    const { existsSync, readFileSync } = await import("node:fs");
    const { readEnvFile } = await import("./deploy.js");
    const envFile = new URL("./env.yaml", import.meta.url);
    const env = existsSync(envFile) ? readEnvFile(readFileSync(envFile, "utf8")) : {};
    await setupSchedules({ fetch: globalThis.fetch, token: gcloudToken, project: process.env.PLATFORM_PROJECT || DEFAULT_PROJECT, apply: args.includes("--apply"), jobsUrl: at >= 0 ? args[at + 1] : null, env });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
