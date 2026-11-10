// The pieces the hosted server can't run for real yet, each answering plainly that it isn't switched on instead of
// pretending. `words` are for whoever sees the answer (a press or the control room, so no technical words); `waitsOn`
// is what it needs, for the log and server/README.md.
//
// An answer from one of these is a NotConnected error: status 503, so the web door shows its words with a reference
// code (signup/api.js), and a scheduled job that meets one is a failed run whose reason says what it waits for.
export class NotConnected extends Error {
  constructor({ words, waitsOn }) {
    super(words);
    this.name = "NotConnected";
    this.status = 503;
    this.waitsOn = waitsOn;
  }
}

/** Every piece that isn't connected yet, by name. */
export const NOT_CONNECTED = Object.freeze({
  shopMaking: { words: "Making new shops isn't switched on yet. Your place is kept, and we'll email you when your shop starts.", waitsOn: "the Google organization and its shops folder (code plan 15.5)" },
  deploys: { words: "Putting a shop's pages live again isn't switched on here yet.", waitsOn: "the release runner's hosted home: deploys need the Firebase command line and a release build (code plan 4.1)" },
  supportSignIn: { words: "Opening a shop's admin from the control room isn't switched on yet.", waitsOn: "a support sign-in for each shop, after the real shop maker (15.5) and test shop (15.7)" },
  twoStepReset: { words: "Turning off two-step sign-in from the control room isn't switched on yet. Nothing was changed.", waitsOn: "the platform's access to each shop's sign-in, after the real shop maker (15.5) and test shop (15.7)" },
  signInSafety: { words: "Reading a shop's two-step sign-in and backup codes isn't switched on yet.", waitsOn: "the platform's access to each shop's sign-in, after the real shop maker (15.5) and test shop (15.7)" },
  stagedImports: { words: "Keeping your file until your shop opens isn't switched on yet. Your preview is fine: bring the file again once your shop is open.", waitsOn: "the platform's import bucket and its signed upload links (code plan 18.7)" },
  exportFiles: { words: "Downloading all of a shop's data isn't switched on yet. Write to us and we'll send it to you.", waitsOn: "the platform's export bucket and its signed download links (code plan 19.16)" },
  projectDeletion: { words: "Deleting a closed shop's project isn't switched on yet.", waitsOn: "Julian's go once the Google organization exists: deleting a project can't be undone" },
  appDeletion: { words: "Deleting a closed app's records isn't switched on yet.", waitsOn: "server access to each shop's Google project, after the real shop maker (15.5)" },
  rollBack: { words: "Rolling a shop back to an earlier release isn't switched on here yet.", waitsOn: "the release runner's hosted home (deploys need the Firebase command line)" },
  domains: { words: "Web addresses for shops aren't switched on yet.", waitsOn: "the domain service's hosted home, which deploys the shop's pages (code plan 2.9)" },
  bookkeeping: { words: "The QuickBooks link isn't switched on yet.", waitsOn: "the platform's QuickBooks app keys and its connection records (docs/accounting.md)" },
  selfChecks: { words: "The daily self-checks aren't switched on here yet.", waitsOn: "the deploy tool and release builds on the server, like the release runner" },
  runningCosts: { words: "Running costs can't be read yet, so nothing is added to bills.", waitsOn: "Google's billing export switched on (services/costs/README.md), or the shared system's per-shop meters" },
  trialTips: { words: "Setup tips aren't switched on yet.", waitsOn: "the TRIAL_TIPS_SECRET secret (at least 16 characters) in Secret Manager" },
  checkups: { words: "The monthly shop check-up isn't switched on yet.", waitsOn: "the CHECKUP_SECRET secret (at least 16 characters) in Secret Manager" },
});

/** A function that answers "not switched on yet" every time it is called. */
export const notConnectedFn = (piece) => async () => {
  throw new NotConnected(piece);
};

/** An object whose every listed method answers "not switched on yet". */
export const notConnectedClient = (piece, methods) => Object.fromEntries(methods.map((name) => [name, notConnectedFn(piece)]));

/** The page behind an email's "turn off" link while its sender isn't switched on: nothing was turned on, so nothing to turn off. */
export const notConnectedPage = (piece, platformName = "Colophon") => ({
  status: 503,
  html: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${platformName}</title><p style="font:16px/1.5 Helvetica,Arial,sans-serif;max-width:560px;margin:40px auto;padding:0 16px">${piece.words} Reply to any of our emails and we'll help.</p>`,
});
