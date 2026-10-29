// "Is Google ready?" (code plan 15.4). Connect Google reaches every press, so it must not be switched on until the
// things only Julian can do outside the code are done. This lists each one in plain words and says whether it is done.
// Julian confirms the first two and the last by setting a switch once the thing is really done; the check on the
// versions is automatic (google/endpoints.js VERSION_CHECKS, re-checked at least every 90 days).
//
//   googleReadiness(config, now)  -> { ready, items: [{ id, done, title, words }] }
//   assertGoogleReady(config, now)  throws the plain list while something is missing
import { VERSION_CHECKS } from "./endpoints.js";

const DAY = 24 * 60 * 60 * 1000;
export const VERSION_CHECK_DAYS = 90;

export function googleReadiness(config, now = Date.now()) {
  const oldest = Math.min(...Object.values(VERSION_CHECKS).map((v) => Date.parse(`${v.checked}T00:00:00Z`)));
  const age = Math.floor((now - oldest) / DAY);
  const items = [
    {
      id: "signInApproved", done: config.signInApproved, title: "Google approved the sign-in screen",
      words: "Google reviews Colophon's sign-in screen and the permissions it asks for. Until it says yes, only 100 people can ever sign in. When it has approved the screen, set GOOGLE_SIGNIN_APPROVED to yes.",
    },
    {
      id: "merchantRegistered", done: config.merchantRegistered && Boolean(config.merchantProviderId), title: "Google Shopping is set up for Colophon",
      words: "Colophon needs its own Merchant Center account (home page verified), registered with Google once, and that account's number saved. Then set GOOGLE_MERCHANT_REGISTERED to yes and GOOGLE_MERCHANT_PROVIDER_ID to the number.",
    },
    {
      id: "versionsChecked", done: age <= VERSION_CHECK_DAYS, title: "Google's service versions were checked lately",
      words: age <= VERSION_CHECK_DAYS
        ? `The versions of Google's services were last checked ${age} day${age === 1 ? "" : "s"} ago.`
        : `The versions of Google's services were last checked ${age} days ago. Google retires old ones, so check them again (the list is in google/endpoints.js) before switching on.`,
    },
    {
      id: "testProject", done: Boolean(config.testClientId), title: "A separate test project for test sign-ins",
      words: "Sign-ins from a project still in testing stop working after 7 days, so tests use their own project. Make it and set GOOGLE_TEST_CLIENT_ID to its sign-in ID.",
    },
  ];
  return { ready: items.every((i) => i.done), items };
}

export function assertGoogleReady(config, now = Date.now()) {
  const { ready, items } = googleReadiness(config, now);
  if (ready) return;
  const missing = items.filter((i) => !i.done).map((i) => `- ${i.title}: ${i.words}`).join("\n");
  throw new Error(`Connect Google can't be switched on yet. Still to do:\n${missing}\n(For practice runs with a pretend Google, set GOOGLE_READY_CHECKS=off.)`);
}
