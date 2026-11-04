# Shared

Files the shop and the stockroom both build from, written once here and copied into each app by a script (a test fails when a copy differs).

- `admin-look/`: the admin look. See its README.
- `sells/`: what a shop sells (books or other things) for the platform's own code: the books rule, the general words and the payment account's merchant category. Not copied into the apps: the shop has its own TypeScript copy (`apps/shop/src/shared/shopSells.ts`), and `sells.test.js` keeps the two in step. The help page has a word-for-word copy, `help/sells.js` (it is published on its own, so it can't reach `shared/`); `help/help.test.js` fails when the two differ.
