// The platform Firebase project (lmb-platform-prod, database in Montréal) the page stores sign-ups in. These are
// public web values, not secret keys: waitlist/firestore.rules decides what they can do. Leave projectId empty to
// switch the form off (it then says the waitlist opens soon).
export const WAITLIST_FIREBASE = { projectId: "lmb-platform-prod", apiKey: "AIzaSyDWZVJtcSI5QPAbvBegni0vJV3HWjS43UQ" };

// The sample press anyone can try before signing up (plan 7.7, docs/demo-shop.md "The sample press"). Empty until
// Julian hosts it: the page then shows no link. signup/config.js has the same address.
export const SAMPLE_PRESS_URL = "";
