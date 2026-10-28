# The first-hour test

Plan 3.6. Five presses who have never seen Colophon each get one hour, with no help, to sign up, bring their shop over
and take a test order. We watch where they stall. The three worst stalls become the fixes in 3.6.

The gate this checks: a press moves over in an afternoon without a call (phase 3), and a press nobody has spoken to
signs up, pays and takes an order with no help (phase 2).

## Before the sessions

- **What has to be live:** sign-up, the shop maker, the account page and the help page on a real address, in test mode.
  Shops made by the shop maker start in test mode, so no real money moves. Check this with one dry run on the test shop
  first. Never run a session on a paying press's shop or with live payment keys.
- **Who:** five people who run a small press or sell their own books, and who have not used Colophon. Spread them over the
  sign-up answers: one moving from another online shop, one who sells at fairs, one who keeps a spreadsheet, one just
  starting, and one who sells through bookshops. Pay them for their hour.
- **What they bring:** the one moving shop brings a product export and a customer export from their own shop. Everyone
  else uses the sample files in `docs/first-hour-test/`: a spreadsheet of five books, and a product export
  from a made-up old shop with three products, one with two editions. Neither has photos, so adding one
  photo by hand is part of task 3. Both import with no problems (checked against Books › Import CSV when they were made).
- **Each session:** a fresh email address for sign-up, a phone with a camera (for the fair task), and screen and voice
  recording with written consent. Recordings are deleted 30 days after the last session.
- **People:** one moderator who talks, one note-taker who doesn't. Neither helps, except by the hint ladder below.

## The script

Read this out, word for word:

> Thank you for coming. We're testing Colophon, not you. If something is hard, that's our fault and exactly what we
> need to see. Please think out loud: say what you're looking for and what you expect to happen. We won't help you,
> because nobody will be there to help the presses who use it. If you'd give up at home, say "I'd give up here," and
> we'll move on. You have an hour.

Then hand over the tasks, one card at a time. Start the clock for each card when they finish reading it.

| # | Task card (what they read) | Done when |
| --- | --- | --- |
| 1 | Sign up for Colophon for your press. | Their shop is ready and they can open its admin. |
| 2 | Find out what Colophon suggests you do first. | They name the first step on Your first week, or open it. |
| 3 | Put your books in the shop. (Moving shop: use your export. Others: use the spreadsheet on the desk.) | The books are in Books, as drafts or published. |
| 4 | One of your books comes as a paperback and a signed copy. Make sure people can buy either. | The book has two editions, each with a price. |
| 5 | Make sure shoppers in your own country can get books delivered, and see the price. | A shipping price is set for their country. |
| 6 | Put one book on sale, then buy it yourself as a shopper. Use the test card on the desk. | A paid test order is in Orders. |
| 7 | Send that order and let the buyer know. | The order is marked as shipped. |
| 8 | (Moving shop only) Bring your customers over. | Their customers have notes; nobody joined the newsletter without the permission box. |
| 9 | You have a question we didn't cover. Find where you'd get an answer. | They open the help page or Get help from Colophon. |

Stop each task at 10 minutes, mark it as not done, and move on. When the hour is up, ask the closing questions:

1. What was the hardest part?
2. Was there a moment you'd have given up at home? When?
3. Would you move your press to this today? What would stop you?

## What to watch

The note-taker writes down, with the time on the recording:

- **Where they look first** for each task (which menu, which button). A wrong first guess more than once is a naming
  problem.
- **Every stall** (see below), with what they said at that moment.
- **Words they use** for things that don't match ours (they say "variants" and we say "editions").
- **Anything they believe is done but isn't** (a book left as a draft, a shipping price for the wrong country). These are
  worse than stalls, because nobody notices.
- **Any time they leave the shop** to search the web or check their email.

## Stalls

A **stall** is any of these:

- 60 seconds or more with no progress toward the task.
- Going back the way they came twice or more on the same task.
- Asking for help, or saying they'd give up.
- Finishing with the wrong result and not noticing.

The **hint ladder**, used only after a stall and always in this order:

1. After 3 minutes stalled: "What are you looking for?" (no answer from us).
2. After 5 minutes: "It's under [menu name]."
3. After 7 minutes: show them, then mark the task as done with help.

Score each stall:

| Score | Meaning |
| --- | --- |
| 3, blocker | Needed a step-2 or step-3 hint, gave up, or finished wrong without noticing. |
| 2, major | Stalled more than 2 minutes, or needed the step-1 hint, then got there. |
| 1, minor | Stalled 60 seconds to 2 minutes and found the way alone. |

Score each task per person: **alone**, **with a hint** or **not done**, and the minutes it took.

## After the five sessions

1. Put every stall in one table: task, what happened, score and person. Merge stalls that are the same problem, even if
   they happened at different moments.
2. Rank each problem by **sum of scores across the five people**. A problem that hit four people at score 1 (4) ranks
   below one that blocked two people (6).
3. The top three are the 3.6 fixes. Each fix gets its own row in `docs/code-plan.md` and its own pull request, saying in
   the description which stall it fixes and how many people hit it.
4. The gate passes when, in a second round of five sessions after the fixes, at least four of five people finish tasks 1,
   3 and 6 alone, and no problem scores 3 for more than one person.

### Recording sheet (one per person)

| Task | Minutes | Alone / hint / not done | Stalls (time, what happened, score) | Words they used |
| --- | --- | --- | --- | --- |
| 1 Sign up | | | | |
| 2 First steps | | | | |
| 3 Books in | | | | |
| 4 Two editions | | | | |
| 5 Shipping | | | | |
| 6 Test order | | | | |
| 7 Send it | | | | |
| 8 Customers | | | | |
| 9 Find help | | | | |
