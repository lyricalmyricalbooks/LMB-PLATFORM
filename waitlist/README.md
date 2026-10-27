# Waitlist

The public waitlist page for presses: `index.html`, a single static page with no build step.

`signup.js` is the sign-up handler the page posts to. It checks the form, quietly ignores bots (the hidden `website`
field), and stores each email once, keyed by a hash of the address so the record id doesn't show it. Storage is passed
in, so the handler stays the same whichever store is chosen.

Before publishing:

1. Choose where sign-ups are stored, wrap `handleSignup` for it, and set `WAITLIST_ENDPOINT` in the page to its address. Until then the form says the waitlist opens soon.
2. Pick the product name. "Colophon" is a working name.
3. Host it on the platform project's Firebase Hosting.

Copy rules: never name a rival shop platform; no prices or trial lengths until they are decided.
