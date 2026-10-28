// The platform Firebase project's public web settings (the same project as the waitlist, lmb-platform-prod). They are
// not secret: Firebase Auth and the platform's /api door decide what anyone can do. The page signs people in to this
// project only; each press's shop lives in its own project.
export const PLATFORM_FIREBASE = Object.freeze({
  apiKey: "AIzaSyDWZVJtcSI5QPAbvBegni0vJV3HWjS43UQ",
  authDomain: "lmb-platform-prod.firebaseapp.com",
  projectId: "lmb-platform-prod",
});

// Firebase's browser library, one fixed version from Google's own address.
export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/11.10.0";

// The platform's web door (signup/api.js), on the same site as this page.
export const API_BASE = "/api";

// The sample press anyone can try before signing up (plan 7.7, docs/demo-shop.md "The sample press"). Empty until
// Julian hosts it: the page then shows no link. waitlist/config.js has the same address.
export const SAMPLE_PRESS_URL = "";
