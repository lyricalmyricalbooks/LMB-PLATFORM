# Monthly shop check-up

One short email a month to each live press (code plan 14.9): what the platform looked at on their shop, what is fine, and
what to fix, with a button to the right page for each fix. It shows a press that someone is looking after their shop.

`createCheckups(...).run()` runs daily and sends at most once per shop per calendar month. It skips the test shop,
closed, abandoned or paused shops, shops under 14 days old, shops with no shop admin, and shops that turned it off.
Each send is recorded in the registry and the shop's audit log; the email service's idempotency key stops a double send.

## What it looks at

| Fact | Read from | Today |
| --- | --- | --- |
| Books with no description | the shop's own `books` (`makeInspector`) | live |
| Broken links | a crawl of the shop's sitemap | not built: left out of the email |
| Pages Google has | Search Console, once Connect Google is on | not built: left out |
| Speed on a phone | the live page timings | not built: left out (the CI speed budget, plan 14.5, only guards the templates) |

A fact that is not known is left out of the email, never guessed. When none is known the shop gets no email.

## Turning it off

Every email ends with `<PLATFORM_URL>/checkup/off?shop=<id>&sig=<signature>` (`offToken`, signed with the check-up's own
secret). `handleOff(url)` answers that page. Billing emails never pass through here.

## Hosting

The platform's server program runs it (`server/`): the `shop-checkup` job every day at 10:00 Toronto time (each shop
gets one email a month), and the `/checkup/off` page on the web door. Its record is `checkups/<shop id>` in the
platform project. Without `CHECKUP_SECRET` the job and the page answer "not connected yet".

## Not yet

- The three missing readers above, which need the shop live and Julian's Google connection.
