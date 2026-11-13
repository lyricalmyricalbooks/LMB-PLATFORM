# Bank feed (beta, a paid add-on)

Each shop's bank transactions through Plaid, read-only, for Bookkeeping › Transactions. `index.js` has the whole story
in its header; Julian's steps are in `server/README.md` ("Bank feed"). `config.js` reads the settings and prices,
`plaid.js` makes the five Plaid calls, `fakes.js` is the pretend Plaid for tests and the walkthrough.
