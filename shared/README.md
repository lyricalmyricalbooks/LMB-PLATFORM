# Shared

Files the shop and the stockroom both build from, written once here and copied into each app by a script (a test fails when a copy differs).

- `admin-look/`: the admin look. See its README.
- `sells/`: what a shop sells (books or other things) for the platform's own code: the books rule, the general words and the payment account's merchant category. Not copied into the apps: the shop has its own TypeScript copy (`apps/shop/src/shared/shopSells.ts`), and `sells.test.js` keeps the two in step.
- `brand-logos/`: partner company logos (Google, Stripe, Square, QuickBooks, social networks, card brands) with their sources, owners and usage rules, and Google's sign-in button style. `build.mjs` writes `logos.js` and copies it to the shop (`components/brand/`) and the platform pages' `look/` folders; `brand-logos.test.js` fails when a copy is out of date. See its README before showing a logo.
