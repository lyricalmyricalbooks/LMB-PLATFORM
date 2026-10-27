# Shop maker

Creates one press's Firebase copy in numbered steps (`docs/shop-setup.md`). Each step is safe to re-run and resumes after
a failure. Each step is logged to the shop registry and the shop's audit log.

Plain Node 22 ES modules with no packages; tests use Node's own test runner (`npm test` at the repo root).

## The runner (`runner.js`)

`runSteps({ shop, steps, registry, auditLog, dryRun, print })` runs the steps for one shop, in order, and stops at the
first failure.

- **Steps** are `{ number, name, check(ctx), act(ctx) }`, numbered 1, 2, 3… with no gaps. `check` only looks and returns
  true when the work is already there; `act` does it. The runner checks first and skips the step when it's done, and
  checks again after acting: a step only counts as done when its check agrees.
- **Logged twice.** Every outcome goes to the registry as `{ step, name, status, acted?, startedAt, finishedAt, error? }`
  (`status` is `done` or `failed`). Once the shop's database exists, the registry's whole history for the shop is copied
  to its audit log, then each new entry; entries have stable ids, so a copy made twice keeps one.
- **Resumes.** The next run starts at the first step the registry doesn't record as done (the failed one). Earlier steps
  aren't run again.
- **Dry run** (`dryRun: true`) writes nothing and acts on nothing. It prints, step by step, "already done, would skip"
  or "would run". After the first step that would run, later steps aren't checked: their project may not exist yet.
- **Never deletes.** A failed step is fixed and retried, never undone (deleted Google Cloud projects can't be reused for
  30 days).

The registry and audit log are passed in. `fakes.js` holds in-memory ones with the same shape as the real ones, for tests
and dry runs; Google is never called from tests.

## Steps 1–6 (`steps.js`)

`firstSteps({ google, registry, profileFiles, config })` returns steps 1–6 of `docs/shop-setup.md`:

1. Reserve the shop id in the registry (refused if the id belongs to another owner).
2. Create the Google Cloud project in the shops folder (`config.folder`) and link the platform billing account
   (`config.billingAccount`). The project id is the shop id. A project outside the folder, or marked for deletion, stops
   the run for a person to decide; it is never deleted or replaced.
3. Add Firebase to the project.
4. Turn on the services in `SERVICES` (only the missing ones).
5. Create the Firestore database (delete protection on) and the storage bucket in `northamerica-northeast1`. One in
   another region stops the run, since neither can be moved.
6. Create the web app ("Shop"), build the public profile from its settings, check it with `profile/profile.js`, and
   save it to the registry and to the per-shop `/shop-profile.js` file (`profileFiles`).

Google is reached only through the injected `google` clients (shape at the top of `steps.js`). There is no real client
in this folder yet, so nothing here can create a real project. `fakes.js` has a pretend Google; `test-shop.js` holds the
made-up test shop (`lmb-test-shop`) and made-up folder and billing ids.

Dry run for the test shop: `node setup/dry-run.js` (pretend Google, changes nothing).

Not yet: steps 7–15 (plan item 1.30); the real Google clients, registry and audit log, and a command that runs against
them; a lock so two runs on the same shop can't overlap; the bot-check key in the profile (left out, so the app's build
setting is used).
