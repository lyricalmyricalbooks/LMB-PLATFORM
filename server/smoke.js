// After a deploy: does each door answer, and does each refuse a call it should refuse? It only reads and knocks; it
// signs nobody in, sends no email and runs no job.
//
//   node server/smoke.js                                  # the platform's address (https://lmb-platform-prod.web.app)
//   node server/smoke.js --base https://… --jobs-url https://platform-jobs-….run.app
//
// Checks, each passing or failing on its own:
//   - GET  /api/plans answers 200 with the plans, with the safety headers and never cached
//   - GET  /api/signup without a sign-in is refused (401), and so is the control room's job list
//   - POST /api/billing/events without Stripe's signature is refused (400)
//   - POST /api/email/shop without a shop's key is refused (401)
//   - GET  /tips/off with a wrong link is refused (400), or says the tips aren't switched on yet (503)
//   - an address no door has is 404
//   - with --jobs-url: POST /jobs/health-checks without the scheduler's sign-in is refused by Cloud Run (401 or 403)
import { pathToFileURL } from "node:url";

export const DEFAULT_BASE = "https://lmb-platform-prod.web.app";

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

/** The checks, each `{ name, run(fetch) -> problem | null }`. */
export function smokeChecks({ base = DEFAULT_BASE, jobsUrl = null } = {}) {
  const at = (path) => `${base.replace(/\/+$/, "")}${path}`;
  const status = (name, method, path, allowed, init = {}) => ({
    name,
    async run(fetch) {
      const response = await fetch(at(path), { method, redirect: "manual", ...init });
      return allowed.includes(response.status) ? null : `answered ${response.status}, expected ${allowed.join(" or ")}`;
    },
  });
  const checks = [
    {
      name: "the plans answer, safely and never cached",
      async run(fetch) {
        const response = await fetch(at("/api/plans"), { method: "GET" });
        if (response.status !== 200) return `answered ${response.status}`;
        const body = await readJson(response);
        if (body?.ok !== true || !Array.isArray(body.plans) || !body.plans.length) return "the answer has no plans";
        const missing = ["x-content-type-options", "strict-transport-security", "content-security-policy"].filter((h) => !response.headers.get(h));
        if (missing.length) return `missing the ${missing.join(", ")} header${missing.length > 1 ? "s" : ""}`;
        if (!/no-store/.test(response.headers.get("cache-control") ?? "")) return "the answer may be cached";
        return null;
      },
    },
    status("sign-up refuses a call without a sign-in", "GET", "/api/signup", [401]),
    status("the control room refuses a call without a sign-in", "GET", "/api/control/jobs", [401]),
    status("billing's events address refuses an unsigned event", "POST", "/api/billing/events", [400], { headers: { "Content-Type": "application/json" }, body: "{}" }),
    status("the shops' email door refuses a call without a shop's key", "POST", "/api/email/shop", [401], { headers: { "Content-Type": "application/json" }, body: "{}" }),
    status("the tips' turn-off page refuses a wrong link", "GET", "/tips/off?shop=smoke-check&sig=wrong", [400, 503]),
    status("an address no door has is 'nothing here'", "GET", "/api/smoke-check-nothing-here", [404]),
  ];
  if (jobsUrl) {
    checks.push({
      name: "the jobs server refuses anyone but the scheduler",
      async run(fetch) {
        const response = await fetch(`${jobsUrl.replace(/\/+$/, "")}/jobs/health-checks`, { method: "POST" });
        return [401, 403].includes(response.status) ? null : `answered ${response.status}: the jobs server must be private`;
      },
    });
  }
  return checks;
}

/** Runs every check. Returns { ok, results: [{ name, ok, problem }] }. */
export async function smoke({ fetch = globalThis.fetch, base, jobsUrl, print = console.log } = {}) {
  const results = [];
  for (const check of smokeChecks({ base, jobsUrl })) {
    let problem;
    try {
      problem = await check.run(fetch);
    } catch (error) {
      problem = `no answer (${error.message})`;
    }
    results.push({ name: check.name, ok: !problem, problem: problem ?? null });
    print(`${problem ? "FAIL" : "ok  "} ${check.name}${problem ? `: ${problem}` : ""}`);
  }
  const ok = results.every((r) => r.ok);
  print(ok ? "Every door answers and refuses what it should." : `${results.filter((r) => !r.ok).length} check(s) failed.`);
  return { ok, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const result = await smoke({ base: value("--base") ?? DEFAULT_BASE, jobsUrl: value("--jobs-url") ?? null });
  process.exitCode = result.ok ? 0 : 1;
}
