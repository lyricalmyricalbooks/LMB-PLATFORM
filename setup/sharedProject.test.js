import { test } from "node:test";
import assert from "node:assert/strict";
import { stepProblems } from "./runner.js";
import { fakeGoogle } from "./fakes.js";
import { SERVICES, STOCKROOM_DATABASE, WEB_APP_NAME } from "./steps.js";
import { SERVICE_KEY_SECRET } from "./serviceKey.js";
import { runProjectSteps, sharedProjectSteps } from "./sharedProject.js";

const P = "lmb-test-shop";

function setup() {
  const google = fakeGoogle();
  // The project itself is made once by a person (site/README.md); everything after that is the steps'.
  google.world.projects.set(P, { projectId: P, state: "ACTIVE", parent: "folders/1" });
  const steps = sharedProjectSteps({ google });
  const lines = [];
  const run = (apply) => runProjectSteps({ projectId: P, steps, apply, print: (line) => lines.push(line) });
  return { google, steps, run, lines };
}

const turnOnGoogleSignIn = (google) => google.world.googleSignIns.set(P, { enabled: true, clientId: "client.example", clientSecret: "made-up-secret" });

test("the shared project's steps are numbered and complete", () => {
  const { steps } = setup();
  assert.deepEqual(stepProblems(steps), []);
  assert.equal(steps.length, 9);
});

test("a dry run only looks, and says what a real run would do", async () => {
  const { google, run, lines } = setup();
  const result = await run(false);
  assert.equal(result.ok, true);
  assert.equal(result.ready, false);
  assert.deepEqual(google.calls, []);
  assert.deepEqual(result.ran.map((r) => r.status), Array(9).fill("would-run"));
  assert.match(lines[0], /1\. Add Firebase to the project: would run/);
});

test("a real run readies the project for shops, and stops in plain words for the one thing a person does", async () => {
  const { google, run } = setup();
  const first = await run(true);
  assert.equal(first.ok, false);
  assert.equal(first.failedStep, 5);
  assert.match(first.error, /Google sign-in isn't on in lmb-test-shop yet: a person turns it on once/);
  // What steps 1–5 could do is done: Firebase, every service, the databases and buckets, the web app, the sign-in lists.
  assert.ok(google.world.firebase.has(P));
  assert.ok(SERVICES.every((name) => google.world.services.get(P).has(name)));
  assert.ok(google.world.databases.has(P) && google.world.namedDatabases.has(`${P}/${STOCKROOM_DATABASE}`));
  assert.ok(google.world.extraBuckets.has(`${P}-stockroom`) && google.world.realtimeDatabases.has(P));
  assert.deepEqual([...google.world.apps.get(P)].map((a) => a.displayName), [WEB_APP_NAME]);
  assert.deepEqual(google.world.authConfigs.get(P), { subtype: "IDENTITY_PLATFORM", multiTenant: { allowTenants: true } });

  turnOnGoogleSignIn(google);
  const second = await run(true);
  assert.equal(second.ok, true, second.error);
  assert.equal(second.ready, true);
  assert.deepEqual(second.ran.map((r) => r.status), ["already-done", "already-done", "already-done", "already-done", "already-done", "done", "done", "done", "done"]);
  assert.ok(google.world.backupPermission.has(P));
  const key = google.world.secrets.get(`${P} ${SERVICE_KEY_SECRET}`);
  assert.equal(key.length, 1);

  // Run again: nothing changes, and the server's key is never made a second time.
  const before = google.calls.length;
  const third = await run(true);
  assert.equal(third.ready, true);
  assert.deepEqual(third.ran.map((r) => r.status), Array(9).fill("already-done"));
  assert.equal(google.calls.length, before);
  assert.equal(google.world.secrets.get(`${P} ${SERVICE_KEY_SECRET}`).length, 1);
});

test("the old builds' cleanup rule waits for the first deploy, then is set", async () => {
  const { google, run } = setup();
  turnOnGoogleSignIn(google);
  // Before the first deploy there is no build repository: nothing to set yet, and the step counts as done.
  const noRepository = { ...google, buildCleanup: { ...google.buildCleanup, has: async () => null } };
  const early = await runProjectSteps({ projectId: P, steps: sharedProjectSteps({ google: noRepository }), apply: true });
  assert.equal(early.ready, true);
  assert.equal(early.ran.at(-1).status, "already-done");
  assert.equal(google.world.buildCleanup.has(P), false);
  // Once it is there, the next run sets the rule.
  const later = await run(true);
  assert.equal(later.ran.at(-1).status, "done");
  assert.ok(google.world.buildCleanup.has(P));
});

test("readying a named project refuses the platform's own, a missing one and one without billing", async () => {
  const { readySharedProject } = await import("./ready-shared-project.js");
  const google = fakeGoogle();
  await assert.rejects(readySharedProject({ projectId: "lmb-platform-prod", google, print: () => {} }), /never holds shops/);
  await assert.rejects(readySharedProject({ projectId: "moth-press", google, print: () => {} }), /doesn't exist yet/);
  google.world.projects.set("moth-press", { projectId: "moth-press", state: "ACTIVE", parent: "folders/1" });
  await assert.rejects(readySharedProject({ projectId: "moth-press", google, print: () => {} }), /no billing account/);
  google.world.billing.set("moth-press", { billingEnabled: true, billingAccountName: "billingAccounts/x" });
  const result = await readySharedProject({ projectId: "moth-press", google, print: () => {} });
  assert.deepEqual([result.ok, result.ready, google.calls.length], [true, false, 0]);
});
