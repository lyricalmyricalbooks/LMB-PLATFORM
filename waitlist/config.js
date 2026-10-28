// The platform Firebase project (lmb-platform-prod, database in Montréal) the page stores sign-ups in. These are
// public web values, not secret keys: waitlist/firestore.rules decides what they can do. Leave projectId empty to
// switch the form off (it then says the waitlist opens soon).
export const WAITLIST_FIREBASE = { projectId: "lmb-platform-prod", apiKey: "AIzaSyDWZVJtcSI5QPAbvBegni0vJV3HWjS43UQ" };

// Pricing on this page (plan 6.1): the platform's plans door and the sign-up page. Empty until sign-up is hosted: the
// page then never asks and stays the waitlist. Even when set, the plans show only while the control room has sign-up
// open (`signupOpen`).
export const PLANS_URL = "";
export const SIGNUP_URL = "";

// The sample press anyone can try before signing up (plan 7.7, docs/demo-shop.md "The sample press"). Empty until
// Julian hosts it: the page then shows no link. signup/config.js has the same address.
export const SAMPLE_PRESS_URL = "";
