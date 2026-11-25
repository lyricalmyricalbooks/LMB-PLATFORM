// The front door's waitlist (25 November 2026): while sign-up is by invite, a press whose email has no invite joins the
// front page's waitlist from here, with the starter it picked on a sample shop as the source, instead of being sent back
// to the front page to type its email again. Loaded only when needed. The press's answers stay saved on the platform.
import { handleSignup } from "../waitlist/signup.js";
import { firestoreStore } from "../waitlist/firestoreStore.js";
import { WAITLIST_FIREBASE } from "../waitlist/config.js";

/** Adds the email to the waitlist. Throws when the list can't be reached, so the page can say so plainly. */
export async function joinWaitlist({ email, starter = "" }, { store = WAITLIST_FIREBASE.projectId ? firestoreStore(WAITLIST_FIREBASE) : null } = {}) {
  if (!store) throw new Error("No waitlist here.");
  const result = await handleSignup({ email, source: starter ? `join:starter:${starter}` : "join" }, { store });
  if (result.status !== 200) throw new Error(result.body?.message || "That didn't go through.");
  return result;
}
