// Run one job now instead of waiting for its schedule (sign-up plan, move 3, 25 November 2026): when a press opens its
// shop, the web door asks the jobs server to run the shop maker straight away, so making starts in seconds rather than
// at the next minute's sweep. The schedule stays the safety net: a nudge that fails changes nothing.
//
//   const nudge = jobsNudge({ fetch, region });
//   await nudge("shop-maker")   -> true when the jobs server took the call, false otherwise. Never throws.
//
// The jobs server is private (only callers with Cloud Run's invoker role on it): the web door's own account is given
// that role by the deploy (server/deploy.js), and calls with an identity token from the metadata server, whose audience
// is the jobs server's address. That address is Cloud Run's fixed form, https://<service>-<project number>.<region>.run.app,
// with the project number also from the metadata server, so nothing needs configuring.
//
// The call waits at most `waitMs`: the jobs server keeps running the job after the web door stops listening, and the
// press's page never waits on a whole run.
import { JOBS_SERVICE, REGION } from "./schedules.js";

const METADATA = "http://metadata.google.internal/computeMetadata/v1";
const HEADERS = { "Metadata-Flavor": "Google" };

/** Cloud Run's address for a service: https://<service>-<project number>.<region>.run.app */
export const runUrl = (service, projectNumber, region) => `https://${service}-${projectNumber}.${region}.run.app`;

export function jobsNudge({ fetch, region = REGION, service = JOBS_SERVICE, waitMs = 2000, log = console.error }) {
  let base = null;
  const metadata = async (path) => {
    const response = await fetch(`${METADATA}${path}`, { method: "GET", headers: HEADERS });
    if (!response.ok) throw new Error(`the metadata server answered ${response.status}`);
    return (await response.text()).trim();
  };
  return async function nudge(job) {
    try {
      base ??= runUrl(service, await metadata("/project/numeric-project-id"), region);
      const token = await metadata(`/instance/service-accounts/default/identity?audience=${encodeURIComponent(base)}`);
      const answer = await fetch(`${base}/jobs/${job}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(waitMs) });
      return answer.ok;
    } catch (error) {
      // A wait that ran out means the job is running: the jobs server carries on without us.
      if (error?.name === "TimeoutError") return true;
      log(`couldn't start ${job} now (the schedule will): ${error?.message ?? error}`);
      return false;
    }
  };
}
