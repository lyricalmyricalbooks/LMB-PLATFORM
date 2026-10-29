# Shop profile

The one written format the shop and the stockroom agree on. Everything that differs between shops and is safe to be
public: the press's name (optional, for the stockroom's download file names), what the shop sells (optional `sells`, its sign-up answer, so the stockroom's words follow it), Firebase web settings, functions region,
the shop's address, the bot-protection site key, which apps are on,
and the `switches` for features one press needed once (`legacyStockroomSignIn`, `githubPagesForwarding`,
`gmailReceiptFinder`, `gmailOrderScan`, `oldShopSync`; optional, on only when `true`; setup writes all five as `false`), and `payments`: the provider,
`own` or `platform` mode, and the public ids the card form needs (for Stripe through the platform: the press's
connected account and the platform's publishable keys). Setup writes `payments` at step 13, once the account exists.

- `shop-profile.schema.json` is the master copy. Each app repo keeps a copy, checked by a test.
- `examples/test-shop.json` is the made-up test shop's profile (never a live project).
- `profile.js` checks a profile and writes the file Hosting serves (`/shop-profile.js`), which sets
  `window.__SHOP_PROFILE__` before the app starts.

Not in the profile, on purpose: plan, trial, test mode, secret keys, the platform fee and sender domain. Those live in
server-only documents and the platform registry, so a shop owner can't change them and nobody can read them from the
page. The connected account id is in it because Stripe's card form needs it on the page; nothing on the server trusts
it (the payment service uses the account the registry lists).
