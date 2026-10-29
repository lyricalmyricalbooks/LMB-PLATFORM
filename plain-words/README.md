# Plain words

Nothing technical reaches a press (plan 6.16). A shop the platform runs shows its press no **Firebase, Google Cloud,
API, key, webhook, secret, DNS, CNAME, TXT, Resend or deploy**.

- **The list** is `banned.json`: one entry per word, as a pattern and a flag. Every test below reads it; no one copies
  it. Never shorten it.
- **`words.js`** reads a page or a piece of JavaScript the way a press would: the visible text of HTML, the sentences
  in quoted strings, and each banned word found with a little of the sentence around it.
- **`plainWords.test.js`** reads the platform's own press-facing pages and messages: sign-up, account, Plan & billing,
  help (every answer, support lines), the status page, the terms and the waitlist; the words in the code that fill
  those pages; the shop maker's setup steps and tips; and every email the platform sends (the press ones must read
  plainly; a short list is only for the platform's own staff).
- **`phone.test.js`** checks the sign-up, account, billing and help pages for a phone (plan 5.12): the viewport,
  nothing wider than a small phone, side gutters, tap targets of 44px, form fields of 16px, text colours that read
  in light and dark, outlines kept for keyboard use, and a loading, empty and error state on every screen. It is a
  check of the markup and the styles, not a browser run: these pages load their sign-in library from Google, which the
  browser checks in CI don't reach.
- **The shop's admin** is read by `apps/shop/src/app/admin/platformPlainWords.test.ts`, the stockroom by
  `apps/stockroom/tests/platformPlainWords.test.js`. Both read `banned.json` from here and both are named by the
  test in this folder, so they can't be deleted by accident.

## What may stay

A banned word is allowed only where a press on the platform cannot reach it:

- behind a check for a shop the platform runs (`runsOnColophon()`, `OwnAccountOnly`, `data-own-accounts` in the
  stockroom's page), found by the test reading the code's own structure;
- on a line marked `Own-account shops only`, with the reason in the same comment;
- as a plain use of the word (the keyboard's arrow keys, a Resend email button), written into the test's allowed list
  with a comment saying why.

The stockroom has one more list, `apps/stockroom/tests/plainWords.known.json`: sentences of features that need a
carrier, AI, Stripe or Google Sheet account of the press's own, word for word. The test fails for a technical sentence
not on it and for a listed one that no longer exists, so the list only gets shorter.
