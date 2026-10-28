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

## Turning tips off

Every tip ends with a link, `<PLATFORM_URL>/tips/off?shop=<id>&sig=<signature>`, signed with `TRIAL_TIPS_SECRET`
(`offToken`). `handleOff(url)` answers that page: a right signature turns the shop's tips off for good (logged), a wrong
one changes nothing. Billing emails never pass through this module, so they keep coming.

## Not yet

- Hosting: the daily run and the `/tips/off` page become one scheduled function and one route in the platform project.
- The real stores: `trialTips/<shop id>` in the platform project for the sweep's record, and the shop's
  `firstWeek/start` read with the platform's token (`clients/shop.js` `shopDataClient`).
