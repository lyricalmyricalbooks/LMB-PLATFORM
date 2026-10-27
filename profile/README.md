# Shop profile

The one written format the shop and the stockroom agree on. Everything that differs between shops and is safe to be
public: Firebase web settings, functions region, the shop's address, the bot-protection site key, which apps are on,
and the `switches` for features one press needed once (`legacyStockroomSignIn`, `githubPagesForwarding`,
`gmailReceiptFinder`; optional, on only when `true`; setup writes all three as `false`).

- `shop-profile.schema.json` is the master copy. Each app repo keeps a copy, checked by a test.
- `examples/test-shop.json` is the made-up test shop's profile (never a live project).
- `profile.js` checks a profile and writes the file Hosting serves (`/shop-profile.js`), which sets
  `window.__SHOP_PROFILE__` before the app starts.

Not in the profile, on purpose: plan, trial, test mode, Stripe account and sender domain. Those live in server-only
documents and the platform registry, so a shop owner can't change them and nobody can read them from the page.
