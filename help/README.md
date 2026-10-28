# Help

Plain answers to the questions presses ask most in their first weeks (plan 3.4): `index.html`, a static page with
no build step, like the status page and the waitlist.

- **The answers** live in `articles.js`, one list grouped by topic. Each has a question, a few short paragraphs, where
  to click in the shop's admin (`where`) and, when it only applies to the shop or the stockroom, its `plans`.
- **Every first-week step has an answer** (plan 8.2): `CHECKLIST_ANSWERS` maps each step of the shop's list
  (`StepId` in `apps/shop/src/app/admin/firstWeek.ts`) to an article; a new step fails `help.test.js` until it has one.
- **What our help includes** (plan 8.2): `support.js` holds what support covers and what it doesn't (no setup calls, no
  data entry, no design work). The help page shows it under the answers, and the sign-up page carries the same lines next
  to the plans (it has no build step, so the test checks the two match word for word).
- **The page** (`page.js`) groups them by topic, filters by the search box and opens the answer named in the address
  (`#editions`), so support can send a link to one answer. `?plan=shop`, `?plan=stockroom` or `?plan=both` shows only
  that plan's answers.
- **Rules for the words** (`help.test.js` checks them): plain words, sentences of at most 32 words, no tool or code
  names, never a rival's name ("Bring your shop with you"), and every "Page › Part" path must be a real page in the
  shop's admin menu (`apps/shop/src/app/admin/riso/nav.ts`). Say only what the shop does today; when something isn't
  built yet, say so and say what to do instead.
- **When the shop changes** a page name or a feature an answer describes, change the answer in the same pull request.

## Publishing it

Like the status page: a deliberate step on the owner's machine, never from CI. Any Hosting site in the platform project
can serve this folder; the account page links to it as `../help/`, so it sits next to `accounts/`.

## Not yet

- A Hosting address (Julian), and a link from each shop's admin to this page.
- Answers grow from the questions the support inbox actually gets (`services/support`).
