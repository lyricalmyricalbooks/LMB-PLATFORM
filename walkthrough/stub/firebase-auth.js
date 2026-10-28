// The walkthrough's stand-in for Firebase's sign-in library: "Continue with Google" signs in at once as a made-up
// person, with no window and no Google account. The platform's pages call it exactly as they call the real one.
//
// Who signs in: `?as=person@example.com` on the page, else whoever signed in last in this browser, else the page's usual
// person: a new press on the sign-up page (nobody has a shop yet, so the form shows) and the owner of two made-up
// presses everywhere else.
const KEY = "walkthrough.user";
const PEOPLE = {
  "owner@example.com": { uid: "uid-owner", name: "Ada Owner" },
  "newcomer@example.com": { uid: "uid-newcomer", name: "Nell Newcomer" },
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const remember = (value) => { try { value ? localStorage.setItem(KEY, value) : localStorage.removeItem(KEY); } catch {} };
const recalled = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
const asked = () => { const as = new URLSearchParams(location.search).get("as"); return as && EMAIL.test(as) ? as.toLowerCase() : ""; };
const usual = () => (location.pathname.startsWith("/signup") ? "newcomer@example.com" : "owner@example.com");
const claimsOf = (email) => ({ uid: PEOPLE[email]?.uid ?? `uid-${email}`, email, email_verified: true, name: PEOPLE[email]?.name ?? email.split("@")[0] });

const listeners = new Set();
const auth = { currentUser: null };
const userOf = (email) => ({ email, displayName: claimsOf(email).name, getIdToken: async () => JSON.stringify(claimsOf(email)) });
const set = (email) => {
  auth.currentUser = email ? userOf(email) : null;
  remember(email);
  for (const listener of listeners) listener(auth.currentUser);
};

// Someone who signed in before, or who is named in the address, is signed in when the page opens.
const first = asked() || recalled();
if (first) {
  auth.currentUser = userOf(first);
  remember(first);
}

function says() {
  const text = `Walkthrough: pretend data on this computer. ${auth.currentUser ? `Signed in as ${auth.currentUser.email}.` : "Not signed in: Continue with Google signs in as a made-up person."} Add ?as=name@example.com to the address to be someone else.`;
  const show = () => {
    let note = document.getElementById("walkthrough-note");
    if (!note) {
      note = document.createElement("p");
      note.id = "walkthrough-note";
      note.style.cssText = "position:fixed;left:0;right:0;bottom:0;margin:0;padding:6px 12px;background:#222;color:#fff;font:13px system-ui,sans-serif;text-align:center;z-index:99999";
      document.body.append(note);
    }
    note.textContent = text;
  };
  if (document.body) show();
  else addEventListener("DOMContentLoaded", show);
}

export const getAuth = () => auth;
export class GoogleAuthProvider {}
export const onAuthStateChanged = (_auth, listener) => {
  listeners.add(listener);
  queueMicrotask(() => { listener(auth.currentUser); says(); });
  return () => listeners.delete(listener);
};
export const signInWithPopup = async () => {
  set(asked() || usual());
  says();
  return { user: auth.currentUser };
};
export const signOut = async () => { set(null); says(); };
export const isSignInWithEmailLink = () => false;
export const signInWithEmailLink = async () => { throw new Error("The walkthrough has no email links; use Continue with Google."); };
