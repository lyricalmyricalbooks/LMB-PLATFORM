# Walkthrough fixes (14 November 2026)
Julian asked for Chrome walkthroughs of the whole platform; one PR fixes what they found.
- [x] Control room shop record drawer could not scroll (grid row grew to 14,800 px): fixed in the shared admin look
- [x] Control room: sidebar email broke mid-address, Since yesterday showed raw action names, empty income chart read "$1, $1", two black buttons on a test shop's record
- [x] General shop Home said "print book or edition sold out"
- [x] Checkout/bag: product with no photo rendered `<img src="">`
- [x] Verify drawer in a browser against a harness (16,363 px unscrollable before, 750 px scrollable after); `npm test` green (2054)
- [x] US shop Bookkeeping showed CA$: a saved Tax centre `baseCurrency` of CAD overrode the shop currency (`homeCurrency`)
- [x] Test shops: made-up contact address, five policy pages, placeholder Instagram link removed (applies on Reset sample data)
- [x] Running costs: real trial shops already see them (billing row made at sign-up); test shops have no row, so the empty Billing words now name running costs
## Review
Still open after this PR: a public "Admin" link in the storefront footer, the test shops' admin brand reads "Your Press".
Found but not fixable in code: test shops' card payments are off until the Stripe test publishable key is set (Julian).
