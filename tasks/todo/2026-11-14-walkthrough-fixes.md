# Walkthrough fixes (14 November 2026)
Julian asked for Chrome walkthroughs of the whole platform; one PR fixes what they found.
- [x] Control room shop record drawer could not scroll (grid row grew to 14,800 px): fixed in the shared admin look
- [x] Control room: sidebar email broke mid-address, Since yesterday showed raw action names, empty income chart read "$1, $1", two black buttons on a test shop's record
- [x] General shop Home said "print book or edition sold out"
- [x] Checkout/bag: product with no photo rendered `<img src="">`
- [ ] Verify drawer in a browser against a harness; run npm test
## Review
Found but not fixable in code: test shops' card payments are off until the Stripe test publishable key is set (Julian).
