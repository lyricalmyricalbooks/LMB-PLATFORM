// The platform Firebase project the status page reads its one public document from (the same project as the waitlist).
// A public value, not a key: waitlist/firestore.rules lets anyone read publicStatus/current and nothing else.
export const STATUS_PROJECT = "lmb-platform-prod";

// Where to read the summary as plain JSON instead (the walkthrough's stand-in, walkthrough/server.js). Empty: read the
// platform project's document above.
export const STATUS_URL = "";
