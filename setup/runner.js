// The shop maker's step runner. It runs numbered steps for one shop, in order, and stops at the first failure.
//
// A step is `{ number, name, check(ctx), act(ctx) }`:
// - `check` looks, never changes anything, and returns true when the step's work is already done.
// - `act` does the work. The runner checks again afterwards, so a step only counts as done when its check agrees.
//
// Every outcome is written to the shop registry (always) and to the shop's audit log once its database exists. The first
// time the audit log is there, the registry's whole history for the shop is copied into it, so entries from before the
// database (or from an earlier run that stopped) are not lost. Entries have stable ids, so copying twice changes nothing. After a failure, the next run starts at the failed step: steps the registry
// records as done are not run again. Nothing here ever deletes a project: a failed step is retried, never undone.
//
// The registry and audit log are passed in (see fakes.js for their shape), so tests and dry runs never touch Google.

/** Checks a list of steps: numbered 1, 2, 3… with no gaps or repeats, each with a name, check and act. */
export function stepProblems(steps) {
  const problems = [];
  if (!Array.isArray(steps) || steps.length === 0) return ["there are no steps"];
  steps.forEach((step, index) => {
    const where = `step ${index + 1}`;
    if (step?.number !== index + 1) problems.push(`${where} is numbered ${step?.number}`);
    if (typeof step?.name !== "string" || !step.name.trim()) problems.push(`${where} has no name`);
    if (typeof step?.check !== "function") problems.push(`${where} has no check`);
    if (typeof step?.act !== "function") problems.push(`${where} has no act`);
  });
  return problems;
}

/**
 * Runs `steps` for `shop` (an object with at least `shopId`).
 *
 * Returns `{ ok, ran: [{ step, name, status }], failedStep?, error? }`, where status is one of:
 * - `done`: the step acted and its check now passes.
 * - `already-done`: its check passed before it acted, so it did nothing.
 * - `done-before`: the registry records it as done in an earlier run, so it was not run again.
 * - `failed`: its check, its act, or the check after acting failed. The run stops here.
 * Dry runs use `would-run` instead of acting and write nothing.
 */
export async function runSteps({ shop, steps, registry, auditLog, dryRun = false, print = () => {}, now = () => new Date() }) {
  const problems = stepProblems(steps);
  if (problems.length) throw new Error(`The setup steps have problems: ${problems.join("; ")}`);
  if (!shop?.shopId) throw new Error("The shop has no shopId");
  const { shopId } = shop;

  const history = [...((await registry.readSteps(shopId)) ?? [])];
  const before = latestByStep(history);
  const resumeAt = steps.find((step) => before[step.number]?.status !== "done")?.number;
  const ran = [];
  const ctx = { shop, dryRun, print };

  if (dryRun) print(`Dry run for ${shopId}: nothing will be changed.`);
  else if (resumeAt > 1 && before[resumeAt]?.status === "failed") print(`Resuming ${shopId} at step ${resumeAt}.`);

  // The audit log is written once the shop's database exists (step 5 creates it); the first time, with the whole history.
  let auditCaughtUp = false;
  const record = async (entry) => {
    await registry.recordStep(shopId, entry);
    history.push(entry);
    if (auditCaughtUp) return auditLog.write(shopId, entryId(entry), entry);
    if (!(await auditLog.ready(shopId))) return;
    for (const old of history) await auditLog.write(shopId, entryId(old), old);
    auditCaughtUp = true;
  };

  // In a dry run, once one step would act, later checks could only guess (their project or database may not exist
  // yet), so they are not asked.
  let wouldActEarlier = false;

  for (const step of steps) {
    const label = `${step.number}. ${step.name}`;
    if (resumeAt === undefined || step.number < resumeAt) {
      ran.push({ step: step.number, name: step.name, status: "done-before" });
      print(`${label}: done in an earlier run`);
      continue;
    }

    if (dryRun) {
      let status = "would-run";
      if (!wouldActEarlier) {
        try {
          if (await step.check(ctx)) status = "already-done";
        } catch (error) {
          print(`${label}: its check failed (${message(error)}); a real run would stop here`);
          ran.push({ step: step.number, name: step.name, status: "failed" });
          return { ok: false, ran, failedStep: step.number, error: message(error) };
        }
      }
      if (status === "would-run") wouldActEarlier = true;
      print(`${label}: ${status === "already-done" ? "already done, would skip" : "would run"}`);
      ran.push({ step: step.number, name: step.name, status });
      continue;
    }

    const startedAt = now().toISOString();
    let status;
    try {
      if (await step.check(ctx)) {
        status = "already-done";
      } else {
        print(`${label}: running`);
        await step.act(ctx);
        if (!(await step.check(ctx))) throw new Error("the step finished but its check still says it isn't done");
        status = "done";
      }
    } catch (error) {
      const entry = { step: step.number, name: step.name, status: "failed", startedAt, finishedAt: now().toISOString(), error: message(error) };
      await record(entry);
      print(`${label}: failed: ${entry.error}`);
      ran.push({ step: step.number, name: step.name, status: "failed" });
      return { ok: false, ran, failedStep: step.number, error: entry.error };
    }

    // The registry only knows "done": whether the step acted this time is kept in the audit detail.
    await record({ step: step.number, name: step.name, status: "done", acted: status === "done", startedAt, finishedAt: now().toISOString() });
    print(`${label}: ${status === "done" ? "done" : "already done"}`);
    ran.push({ step: step.number, name: step.name, status });
  }

  return { ok: true, ran };
}

/** The latest registry entry for each step number. */
export function latestByStep(history) {
  const latest = {};
  for (const entry of history) latest[entry.step] = entry;
  return latest;
}

/** A stable audit-log id: the same entry always gets the same id, so writing it twice keeps one copy. */
export function entryId(entry) {
  return `${entry.startedAt}-step-${String(entry.step).padStart(2, "0")}-${entry.status}`;
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}
