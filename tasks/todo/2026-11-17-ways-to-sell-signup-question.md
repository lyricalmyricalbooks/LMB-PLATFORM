# Ways to sell (beta): the sign-up question (17 November 2026)

Second step of the Ways to sell build (plan https://claude.ai/artifact/AEohjazbR2c6yG42PibWhK; the switches came in
`2026-11-17-ways-to-sell-switches.md`): one optional question at sign-up, "Anything else you'll sell?", with the six
ways as pick-any tiles, each marked Beta. It turns nothing on. It tells Julian what new shops want, and later tells the
owner which ways they asked for.

## Plan

- [x] `signup/form.js` `ALSO_SELLS` (the six ways' own ids, checked against `shared/ways/ways.js`) and `cleanAlsoSells`;
      `checkSignup` keeps known picks and leaves the field out when nothing is picked.
- [x] Front door (`join/`): the question under "Selling somewhere already?", saved with the other answers
      (`pressRecord.js` `setupChange` accepts `alsoSells`, refuses anything else) and put back when the press returns.
- [x] The answer travels with the shop: sign-up row, `shopFromSignup`, the registry row (shared system) and the shop's
      `firstWeek/start` › `alsoSells`, written once by setup.
- [x] Shop rules: `alsoSells` is a sign-up answer, so the admin can't change it (emulator check).
- [x] Control room: "asked for at sign-up" beside a way in the shop's record, and a count and a column on
      Shops › Ways to sell (beta).
- [x] Shop admin: Settings › Ways to sell adds "You asked for this when you signed up." under a way the owner asked
      for and hasn't switched on.

## Verify

- Root `npm test`; shop tests, type-check, lint; the rules emulator script.
- Desktop and phone screenshots of the sign-up page (walkthrough) with two tiles picked.

## Review

- Root `npm test`: 2132 pass (new `signup/alsoSells.test.js`, more in `control-room/waysBeta.test.js`). Shop tests
  for the card and the rules list pass; type-check and lint clean. Rules emulator: 352 checks pass.
- `sells.test.js` reads `form.js` between two markers, so the new question sits after `ADDRESS_SUFFIX`, outside them.
- Seen on desktop and phone in the walkthrough: tiles pick and unpick, two to a row on a phone, Beta on each.
- Shops made before this have no answer; every reader treats a missing answer as none.
- Not done here: each way's own pages. Next is Events and tickets (E1).
