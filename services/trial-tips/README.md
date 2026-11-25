# Trial tips

Emails during a press's first two months that point at the next step of their shop's setup guide (code plan 6.10).
Plain Node 22 ES modules, no packages; tests use `fakes.js` and the setup fakes, never a live shop or email account.

## What a press gets

| Day | Email | Sent by |
| --- | --- | --- |
| 0 | Welcome, with the links to the admin | the shop maker (setup step 14) |
| 2, 4, 7, 21, 60 | A setup tip: the next step of **Set up your shop** they haven't done | this sweep |
| 11 | The trial ends in three days | `services/billing` (`trial-ending`) |
| 14 | Paused until a card is added (only with no card) | `services/billing` (`card-needed`) |

The sweep runs once a day (`createTrialTips(...).run()`). For each shop it works out the trial day (the first trial
end minus `TRIAL_DAYS`, else when the shop was made), reads the shop's `firstWeek/start` (the `progress` the admin's
guide saves: every step in order and the ones done), and sends at most one tip:

- only on a tip day, or the day after when a run was missed, never later and never two at once;
- at most one every two days, and each tip day once (its own record, plus the email service's idempotency key);
- never for a step that is done or was already the tip; nothing once every step is done;
- never for the test shop, a closed, abandoned or paused shop, or a shop with no shop admin (stockroom-only plans);
- an owner who hasn't opened the admin yet has no saved progress: every step counts as still to do, in the guide's
  general order.

Each tip is recorded in the sweep's store, as a registry event and in the shop's audit log. Words are in `TIPS` (one per
guide step; a test fails when the shop's guide gains a step without one); the email is the `trial-tip` template in
`services/email/templates.js`, sent from the platform's own address.

## Get started nudges (plan 17.14; one a day since the sign-up plan's move 5, 25 November 2026)

While a press's shop isn't open, from day 1 to day 10, it can get one email a day naming the one next step on Home's
list (`startNudges.js`): "One step from open: add your first book", or "3 steps from open. Next: …". The order is the
admin's run (`startRun.ts`): the look, products (services for a services shop), Get paid (platform cards only), contact
and policies, shipping (not for a services shop), the final check. Every button opens Home, where the list holds the step.
Each stage is nudged once, recorded in the store as `startNudges`, and at most one goes out a day. An older shop that
chose its look before the run existed (no `welcome.firstRun`, nothing else done) gets none.

The platform setting `START_NUDGES` decides whether they go out: `instead` (the default since move 5: sent in place of
that day's setup tip, which then waits for the next tip day, so a press never gets two emails in a day), `beside` (sent
with that day's setup tip) or `hold` (none). A tips-off link stops them too. A press with no owner email or no shop admin
is skipped with its reason.

## Turning tips off

Every tip ends with a link, `<PLATFORM_URL>/tips/off?shop=<id>&sig=<signature>`, signed with `TRIAL_TIPS_SECRET`
(`offToken`). `handleOff(url)` answers that page: a right signature turns the shop's tips off for good (logged), a wrong
one changes nothing. Billing emails never pass through this module, so they keep coming.

## Hosting

The platform's server program runs it (`server/`): the `trial-tips` job every day at 09:00 Toronto time, and the
`/tips/off` page on the web door. The sweep's record is `trialTips/<shop id>` in the platform project
(`clients/platformStores.js`), and each shop's `firstWeek/start` is read with the platform's token (`clients/shop.js`).
Without `TRIAL_TIPS_SECRET` the job and the page answer "not connected yet".
