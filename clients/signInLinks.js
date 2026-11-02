// Email sign-in links for the platform's own pages (sign-up and the account page), made in the platform project the
// way Firebase Admin's generateSignInWithEmailLink makes them: the Identity Toolkit API, from Google's discovery
// document for identitytoolkit v1 (https://identitytoolkit.googleapis.com/$discovery/rest?version=v1):
//
//   projects.accounts.sendOobCode   POST v1/projects/{targetProjectId}/accounts:sendOobCode
//                                   body: GetOobCodeRequest { requestType: "EMAIL_SIGNIN", email, continueUrl,
//                                   canHandleCodeInApp, returnOobLink }  ->  { email, oobLink }
//
// `returnOobLink: true` makes Google hand the link back instead of emailing it: the platform sends it itself, in its
// own words (signup/signup.js sendSignInLink). Needs the caller's token to hold the Firebase Authentication Admin role
// in the platform project. Same shape as signup/fakes.js fakeAuth: signInLink(email, { url }) -> link.
import { googleHttp } from "./http.js";

export const IDENTITY_TOOLKIT = "https://identitytoolkit.googleapis.com/v1";

export function signInLinks({ fetch, token, projectId }) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId ?? "")) throw new Error("signInLinks needs a project id");
  const call = googleHttp({ fetch, token });
  return {
    async signInLink(email, { url }) {
      const answer = await call("POST", `${IDENTITY_TOOLKIT}/projects/${projectId}/accounts:sendOobCode`, {
        body: { requestType: "EMAIL_SIGNIN", email, continueUrl: url, canHandleCodeInApp: true, returnOobLink: true },
      });
      if (typeof answer.oobLink !== "string" || !answer.oobLink.startsWith("https://")) throw new Error("Google didn't give back a sign-in link");
      return answer.oobLink;
    },
  };
}
