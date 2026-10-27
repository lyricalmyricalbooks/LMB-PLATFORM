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

Not yet: the steps themselves (plan items 1.29 and 1.30) and a command to run them.
