# Waitlist

The public waitlist page for presses: `index.html`, a single static page with no build step.

`signup.js` is the sign-up handler. It checks the form, quietly ignores bots (the hidden `website` field), and stores
each email once, keyed by a hash of the address so the record id doesn't show it. It uses only browser built-ins, so the
page runs it directly.

Sign-ups are stored in Firestore in the platform's own Firebase project, `lmb-platform-prod` (database in Montréal,
delete protection on), which is separate from every shop's project. There is no server: `firestoreStore.js` adds each
sign-up straight from the page, and `firestore.rules` only lets the page add a well-formed record under the right id.
Nobody can read, change or delete sign-ups through the web; the owner reads them in the Firebase console. A repeat email
is refused by the database and counts as done. `config.js` holds the project's public web values; empty `projectId`
switches the form off.

Check it: `npx firebase-tools@15.32.1 emulators:exec --only firestore --project demo-waitlist "node firestore-emulator.mjs"`
(CI job `waitlist-rules`).

Publish it (a deliberate step on the owner's machine, never from CI):
`firebase deploy --only firestore:rules,hosting --project lmb-platform-prod` from this folder. There is no `.firebaserc`,
so a deploy has to name the project.

Before launch: pick the product name. "Colophon" is a working name.

Copy rules: never name a rival shop platform; no prices or trial lengths until they are decided.
