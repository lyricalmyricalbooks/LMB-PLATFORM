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
  // `words` is one plain line for the Launch page; `setting` is the line to add to the server settings once it's done
  // (the Launch page folds it under "How"), and `href` where the thing itself is done.
  const items = [
    {
      id: "signInApproved", done: config.signInApproved, title: "Get Google to approve the sign-in screen",
      words: "Until Google says yes, only 100 people can ever connect Google.",
      setting: 'GOOGLE_SIGNIN_APPROVED: "yes"', href: "https://console.cloud.google.com/auth/verification", hrefWords: "Open Google Cloud",
    },
    {
      id: "merchantRegistered", done: config.merchantRegistered && Boolean(config.merchantProviderId), title: "Set up Google Shopping for Colophon",
      words: "Make Colophon's own Merchant Center account, verify the home page and register it with Google once.",
      setting: 'GOOGLE_MERCHANT_REGISTERED: "yes" and GOOGLE_MERCHANT_PROVIDER_ID: "<the account number>"', href: "https://merchants.google.com/", hrefWords: "Open Merchant Center",
    },
    {
      id: "versionsChecked", done: age <= VERSION_CHECK_DAYS, title: "Check Google's service versions",
      words: age <= VERSION_CHECK_DAYS
        ? `Checked ${age} day${age === 1 ? "" : "s"} ago. Nothing to do.`
        : `Last checked ${age} days ago. Google retires old versions, so have them checked again.`,
      setting: null,
    },
    {
      id: "testProject", done: Boolean(config.testClientId), title: "Make a separate Google project for tests",
      words: "Test sign-ins from a project still in testing stop after 7 days, so tests need their own.",
      setting: 'GOOGLE_TEST_CLIENT_ID: "<its sign-in ID>"', href: "https://console.cloud.google.com/projectcreate", hrefWords: "Open Google Cloud",
    },
  ];
  return { ready: items.every((i) => i.done), items };
}

/**
 * The readiness list straight from the server's settings, without the checks that make the Google link itself refuse to
 * start (keys that go together, a web address). The control room's "Connect Google" list must show even while those
 * are half done: reading the full config there threw, and the page said "Something went wrong on our side".
 */
export function googleReadinessFromEnv(env = {}, now = Date.now()) {
  const text = (name) => String(env[name] ?? "").trim();
  const yes = (name) => text(name).toLowerCase() === "yes";
  return googleReadiness({
    signInApproved: yes("GOOGLE_SIGNIN_APPROVED"), merchantRegistered: yes("GOOGLE_MERCHANT_REGISTERED"),
    merchantProviderId: text("GOOGLE_MERCHANT_PROVIDER_ID") || null, testClientId: text("GOOGLE_TEST_CLIENT_ID") || null,
  }, now);
}

export function assertGoogleReady(config, now = Date.now()) {
  const { ready, items } = googleReadiness(config, now);
  if (ready) return;
  const missing = items.filter((i) => !i.done).map((i) => `- ${i.title}: ${i.words}${i.setting ? ` Then set ${i.setting}.` : ""}`).join("\n");
  throw new Error(`Connect Google can't be switched on yet. Still to do:\n${missing}\n(For practice runs with a pretend Google, set GOOGLE_READY_CHECKS=off.)`);
}
